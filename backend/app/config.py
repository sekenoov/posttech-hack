import logging
import secrets
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_backend_dir = Path(__file__).resolve().parent.parent
logger = logging.getLogger("janamen")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(_backend_dir / ".env"), extra="ignore")

    database_url: str = "sqlite:///./data/janamen.db"
    # Empty by default: a random per-process key is generated below, so no
    # usable secret ever lives in the repository.
    secret_key: str = ""
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


settings = Settings()

if not settings.secret_key:
    settings.secret_key = secrets.token_urlsafe(48)
    logger.warning("SECRET_KEY is not set: using a random key, sessions reset on restart")
