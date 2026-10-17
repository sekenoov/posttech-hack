import os
import sys
import tempfile
from pathlib import Path

import pytest

# Isolated database and a fixed key for the test process, set before app import.
_tmp = tempfile.mkdtemp(prefix="janamen-tests-")
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["SECRET_KEY"] = "test-secret-key-not-used-anywhere-else"
os.environ["LLM_PROVIDER"] = "none"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402

from app.auth import create_access_token  # noqa: E402
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402
import seed as seed_module  # noqa: E402

# Demo accounts (see backend/seed_data/org.json)
EMPLOYEE = "employee@janamen.example"     # Айдана, reports to MANAGER
EMPLOYEE2 = "erlan@janamen.example"       # same team as EMPLOYEE
MANAGER = "manager@janamen.example"       # Нурлан, reports to DIRECTOR
MANAGER2 = "manager2@janamen.example"     # Динара, other team
OUTSIDER = "timur@janamen.example"        # reports to MANAGER2
DIRECTOR = "director@janamen.example"     # manager of MANAGER and MANAGER2
HR = "hr@janamen.example"


@pytest.fixture()
def db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    seed_module.seed(session)
    yield session
    session.close()


@pytest.fixture()
def client(db):
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def user_id(db):
    def _get(email: str) -> int:
        return db.query(User).filter(User.email == email).one().id
    return _get


@pytest.fixture()
def auth(user_id):
    """Bearer headers for a demo user without paying bcrypt cost on every login."""
    def _headers(email: str) -> dict:
        token = create_access_token({"sub": str(user_id(email))})
        return {"Authorization": f"Bearer {token}"}
    return _headers


def pending_request_of(client, auth, email: str) -> dict:
    rows = client.get("/requests", params={"status": "pending"}, headers=auth(email)).json()
    assert rows, f"seed must contain a pending request for {email}"
    return rows[0]
