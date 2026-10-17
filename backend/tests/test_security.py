"""Negative API tests: authentication, read-only HR data, IDOR, role boundaries."""
from datetime import timedelta

from jose import jwt

from app.auth import create_access_token
from app.models import User
from tests.conftest import (
    DIRECTOR, EMPLOYEE, EMPLOYEE2, HR, MANAGER, MANAGER2, OUTSIDER, pending_request_of,
)
from seed import DEMO_PASSWORD


# --- authentication -----------------------------------------------------------

def test_public_registration_is_disabled(client):
    payload = {"name": "x", "email": "evil@x.example", "password": "p", "role": "hr", "department": "HR"}
    assert client.post("/auth/register", json=payload).status_code in (404, 405)


def test_login_success_and_uniform_failure(client):
    ok = client.post("/auth/login", json={"email": EMPLOYEE, "password": DEMO_PASSWORD})
    assert ok.status_code == 200 and ok.json()["access_token"]
    wrong_pw = client.post("/auth/login", json={"email": EMPLOYEE, "password": "wrong"})
    unknown = client.post("/auth/login", json={"email": "nobody@janamen.example", "password": "wrong"})
    assert wrong_pw.status_code == unknown.status_code == 401
    assert wrong_pw.json() == unknown.json()  # no account enumeration


def test_protected_endpoints_require_valid_token(client, user_id):
    assert client.get("/me").status_code == 401
    assert client.get("/me", headers={"Authorization": "Bearer garbage"}).status_code == 401
    forged = jwt.encode({"sub": str(user_id(HR))}, "attacker-secret", algorithm="HS256")
    assert client.get("/me", headers={"Authorization": f"Bearer {forged}"}).status_code == 401
    expired = create_access_token({"sub": str(user_id(HR))}, expires_delta=timedelta(seconds=-1))
    assert client.get("/me", headers={"Authorization": f"Bearer {expired}"}).status_code == 401


def test_deactivated_user_is_rejected(client, db, auth):
    headers = auth(EMPLOYEE)
    db.query(User).filter(User.email == EMPLOYEE).update({User.is_active: False})
    db.commit()
    assert client.get("/me", headers=headers).status_code == 401


# --- official HR data is read-only --------------------------------------------

def test_employee_cannot_change_official_fields(client, auth):
    before = client.get("/me", headers=auth(EMPLOYEE)).json()
    for field, value in [("manager_id", 1), ("last_name", "Хакер"), ("first_name", "X"),
                         ("position", "CEO"), ("role", "hr"), ("hire_date", "2000-01-01"),
                         ("department_id", 1), ("email", "x@x.example")]:
        r = client.patch("/me", json={field: value}, headers=auth(EMPLOYEE))
        assert r.status_code == 422, field
    after = client.get("/me", headers=auth(EMPLOYEE)).json()
    for key in ("manager", "full_name", "position", "role", "hire_date", "department", "email"):
        assert after[key] == before[key]


def test_employee_can_change_personal_phone(client, auth):
    r = client.patch("/me", json={"personal_phone": "+7 700 000 00 00"}, headers=auth(EMPLOYEE))
    assert r.status_code == 200 and r.json()["personal_phone"] == "+7 700 000 00 00"
    assert client.patch("/me", json={"personal_phone": "<script>"}, headers=auth(EMPLOYEE)).status_code == 422


# --- employee boundaries (IDOR) -----------------------------------------------

def test_employee_cannot_read_or_cancel_colleague_request(client, auth):
    colleague_req = pending_request_of(client, auth, EMPLOYEE2)
    assert client.get(f"/requests/{colleague_req['id']}", headers=auth(EMPLOYEE)).status_code == 404
    assert client.post(f"/requests/{colleague_req['id']}/cancel", headers=auth(EMPLOYEE)).status_code == 404
    assert client.get(f"/requests/{colleague_req['id']}", headers=auth(EMPLOYEE2)).status_code == 200


def test_request_list_contains_only_own_requests(client, auth, user_id):
    rows = client.get("/requests", headers=auth(EMPLOYEE)).json()
    assert rows and all(r["employee"]["id"] == user_id(EMPLOYEE) for r in rows)


def test_employee_has_no_team_or_admin_access(client, auth):
    req = pending_request_of(client, auth, EMPLOYEE2)
    h = auth(EMPLOYEE)
    assert client.get("/team/members", headers=h).status_code == 403
    assert client.get("/team/requests", headers=h).status_code == 403
    assert client.post(f"/team/requests/{req['id']}/decision", json={"decision": "approve"}, headers=h).status_code == 403
    assert client.get("/admin/employees", headers=h).status_code == 403
    assert client.get("/admin/integration-events", headers=h).status_code == 403


def test_employee_cannot_touch_foreign_notifications(client, auth):
    foreign = client.get("/notifications", headers=auth(MANAGER)).json()["items"][0]
    assert client.post(f"/notifications/{foreign['id']}/read", headers=auth(EMPLOYEE)).status_code == 404
    client.post("/notifications/read-all", headers=auth(EMPLOYEE))
    still_unread = client.get("/notifications", params={"unread_only": True}, headers=auth(MANAGER)).json()
    assert still_unread["unread_count"] > 0


# --- manager boundaries -------------------------------------------------------

def test_manager_sees_only_direct_reports(client, auth, user_id):
    members = client.get("/team/members", headers=auth(MANAGER)).json()
    ids = {m["id"] for m in members}
    assert user_id(EMPLOYEE) in ids and user_id(EMPLOYEE2) in ids
    assert user_id(OUTSIDER) not in ids and user_id(MANAGER) not in ids
    # the team projection carries no contact / personal fields
    assert not {"email", "personal_phone", "address"} & set(members[0])
    assert client.get(f"/team/members/{user_id(OUTSIDER)}", headers=auth(MANAGER)).status_code == 404


def test_manager_team_requests_exclude_other_teams_and_own(client, auth, user_id):
    rows = client.get("/team/requests", headers=auth(MANAGER)).json()
    owners = {r["employee"]["id"] for r in rows}
    assert user_id(OUTSIDER) not in owners and user_id(MANAGER) not in owners
    assert user_id(EMPLOYEE) in owners


def test_manager_cannot_decide_other_team_request(client, auth):
    foreign = pending_request_of(client, auth, OUTSIDER)
    r = client.post(f"/team/requests/{foreign['id']}/decision", json={"decision": "approve"}, headers=auth(MANAGER))
    assert r.status_code == 404
    assert client.get(f"/requests/{foreign['id']}", headers=auth(MANAGER)).status_code == 404
    assert client.get(f"/requests/{foreign['id']}", headers=auth(OUTSIDER)).json()["status"] == "pending"


def test_manager_cannot_approve_own_request(client, auth):
    own = pending_request_of(client, auth, MANAGER)
    r = client.post(f"/team/requests/{own['id']}/decision", json={"decision": "approve"}, headers=auth(MANAGER))
    assert r.status_code == 403
    assert client.get(f"/requests/{own['id']}", headers=auth(MANAGER)).json()["status"] == "pending"


def test_hr_cannot_approve_own_request(client, auth):
    created = client.post("/requests", json={"start_date": _future(30), "end_date": _future(31)}, headers=auth(HR))
    assert created.status_code == 201
    r = client.post(f"/team/requests/{created.json()['id']}/decision", json={"decision": "approve"}, headers=auth(HR))
    assert r.status_code == 403


def test_managers_own_request_is_decided_by_their_manager(client, auth):
    own = pending_request_of(client, auth, MANAGER)
    assert client.post(f"/team/requests/{own['id']}/decision", json={"decision": "approve"},
                       headers=auth(MANAGER2)).status_code == 404
    r = client.post(f"/team/requests/{own['id']}/decision", json={"decision": "approve"}, headers=auth(DIRECTOR))
    assert r.status_code == 200 and r.json()["status"] == "approved"


def test_decision_payload_is_strict(client, auth):
    req = pending_request_of(client, auth, EMPLOYEE)
    for body in ({"decision": "maybe"}, {"decision": "approve", "status": "approved"}, {}):
        r = client.post(f"/team/requests/{req['id']}/decision", json=body, headers=auth(MANAGER))
        assert r.status_code == 422


def _future(days: int) -> str:
    from datetime import date
    return (date.today() + timedelta(days=days)).isoformat()


def test_integrations_overview_is_hr_only(client, auth):
    assert client.get("/admin/integrations", headers=auth(MANAGER)).status_code == 403
    rows = client.get("/admin/integrations", headers=auth(HR)).json()
    assert {r["system"] for r in rows} == {"1c_zup", "documentolog"} and all(r["mode"] == "mock" for r in rows)
