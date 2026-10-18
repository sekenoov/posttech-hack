"""The generated JWT key survives restarts without being committed anywhere."""
import os
import stat

from app.config import load_or_create_secret


def test_key_is_created_once_and_reused(tmp_path):
    path = tmp_path / "data" / ".secret_key"
    first = load_or_create_secret(path)
    assert len(first) >= 40 and path.read_text(encoding="utf-8") == first
    assert load_or_create_secret(path) == first  # a restart reads the same key


def test_key_file_is_owner_only(tmp_path):
    path = tmp_path / ".secret_key"
    load_or_create_secret(path)
    if os.name == "posix":
        assert stat.S_IMODE(path.stat().st_mode) == 0o600


def test_existing_key_is_never_overwritten(tmp_path):
    path = tmp_path / ".secret_key"
    path.write_text("key-written-by-another-process\n", encoding="utf-8")
    assert load_or_create_secret(path) == "key-written-by-another-process"


def test_empty_file_gets_a_key(tmp_path):
    path = tmp_path / ".secret_key"
    path.write_text("", encoding="utf-8")
    # an empty file means a crashed first write: it must not become an empty key
    key = load_or_create_secret(path)
    assert key
