import logging
import os
import secrets
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_backend_dir = Path(__file__).resolve().parent.parent
logger = logging.getLogger("janamen")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(_backend_dir / ".env"), extra="ignore")

    database_url: str = "sqlite:///./data/janamen.db"
    # Empty by default: a random key is generated once and kept in the data
    # volume (secret_key_file), so no usable secret lives in the repository and
    # restarts do not log everyone out. SECRET_KEY from env always wins.
    secret_key: str = ""
    secret_key_file: str = "./data/.secret_key"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 480
    cors_origins: str = "http://localhost:3000,http://localhost:5173"

    # AI Jana LLM layer: openrouter (primary) | anthropic (optional) | none.
    # Keys stay server-side; without a key AI Jana runs retrieval-only.
    llm_provider: str = "openrouter"
    llm_model: str = ""
    llm_timeout_seconds: float = 25.0
    openrouter_api_key: str = ""
    anthropic_api_key: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


def load_or_create_secret(path: Path) -> str:
    """Reuse the key stored at path, or create it (owner-only) on first start."""
    def read() -> str:
        try:
            return path.read_text(encoding="utf-8").strip()
        except FileNotFoundError:
            return ""

    if existing := read():
        return existing
    key = secrets.token_urlsafe(48)
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        # O_EXCL: if another process (seed vs. API) created it meanwhile, use theirs
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        if existing := read():
            return existing
        # an empty file is a crashed first write: never return an empty key
        fd = os.open(path, os.O_WRONLY | os.O_TRUNC)
        os.chmod(path, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(key)
    return key


settings = Settings()

if not settings.secret_key:
    try:
        settings.secret_key = load_or_create_secret(Path(settings.secret_key_file))
        logger.info("SECRET_KEY is not set: using the key stored in %s", settings.secret_key_file)
    except OSError:
        settings.secret_key = secrets.token_urlsafe(48)
        logger.warning("SECRET_KEY is not set and the key file is not writable: sessions reset on restart")
