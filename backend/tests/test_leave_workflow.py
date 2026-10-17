"""Vacation request workflow: S2 end to end at the API level."""
from datetime import date, timedelta

from app.models import LeaveRequest, IntegrationEvent
from tests.conftest import EMPLOYEE, HR, MANAGER, pending_request_of


def d(days: int) -> str:
    return (date.today() + timedelta(days=days)).isoformat()


def test_full_approval_flow_with_history_notification_and_balance(client, auth, db):
    before = client.get("/me", headers=auth(EMPLOYEE)).json()["leave_balance"]

    created = client.post("/requests", json={"start_date": d(100), "end_date": d(104), "comment": "Отпуск"},
                          headers=auth(EMPLOYEE))
    assert created.status_code == 201
    req = created.json()
    assert req["status"] == "pending" and req["days"] == 5 and req["can_cancel"] and not req["can_decide"]
    assert [h["to_status"] for h in req["history"]] == ["pending"]

    # the manager sees it and is notified
    assert req["id"] in {r["id"] for r in client.get("/team/requests", params={"status": "pending"}, headers=auth(MANAGER)).json()}
    mgr_notes = client.get("/notifications", headers=auth(MANAGER)).json()["items"]
    assert any(n["link"] == f"/requests/{req['id']}" for n in mgr_notes)
    assert client.get(f"/requests/{req['id']}", headers=auth(MANAGER)).json()["can_decide"] is True

    decided = client.post(f"/team/requests/{req['id']}/decision", json={"decision": "approve"}, headers=auth(MANAGER))
    assert decided.status_code == 200
    body = decided.json()
    assert body["status"] == "approved"
    assert body["decided_by"]["full_name"].startswith("Абдрахманов")
    assert body["decided_at"].endswith("+00:00")
    assert [h["to_status"] for h in body["history"]] == ["pending", "approved"]
    assert body["docflow_ref"].startswith("DL-")

    # employee: notification + balance
    notes = client.get("/notifications", params={"unread_only": True}, headers=auth(EMPLOYEE)).json()
    approved_note = next(n for n in notes["items"] if n["type"] == "request_approved" and n["link"] == f"/requests/{req['id']}")
    after = client.get("/me", headers=auth(EMPLOYEE)).json()["leave_balance"]
    assert after["used_days"] == before["used_days"] + 5

    # mark read
    assert client.post(f"/notifications/{approved_note['id']}/read", headers=auth(EMPLOYEE)).json()["is_read"]

    # Documentolog hand-off was logged
    assert db.query(IntegrationEvent).filter_by(system="documentolog", reference=body["docflow_ref"]).count() == 1


def test_finished_request_cannot_be_decided_again(client, auth):
    req = pending_request_of(client, auth, EMPLOYEE)
    assert client.post(f"/team/requests/{req['id']}/decision", json={"decision": "approve"}, headers=auth(MANAGER)).status_code == 200
    for decision in ("approve", "reject"):
        r = client.post(f"/team/requests/{req['id']}/decision", json={"decision": decision}, headers=auth(MANAGER))
        assert r.status_code == 409
    assert client.get(f"/requests/{req['id']}", headers=auth(EMPLOYEE)).json()["status"] == "approved"


def test_rejection_keeps_comment_and_notifies(client, auth):
    before = client.get("/me", headers=auth(EMPLOYEE)).json()["leave_balance"]
    req = pending_request_of(client, auth, EMPLOYEE)
    r = client.post(f"/team/requests/{req['id']}/decision",
                    json={"decision": "reject", "comment": "Перенеси, пожалуйста, на январь"}, headers=auth(MANAGER))
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "rejected" and body["decision_comment"] == "Перенеси, пожалуйста, на январь"
    assert body["history"][-1]["comment"] == "Перенеси, пожалуйста, на январь"
    notes = client.get("/notifications", headers=auth(EMPLOYEE)).json()["items"]
    assert any(n["type"] == "request_rejected" and n["link"] == f"/requests/{req['id']}" for n in notes)
    after = client.get("/me", headers=auth(EMPLOYEE)).json()["leave_balance"]
    assert after["used_days"] == before["used_days"]
    assert after["pending_days"] == before["pending_days"] - req["days"]


def test_no_automatic_approval_of_old_pending_requests(client, auth, db):
    req = pending_request_of(client, auth, EMPLOYEE)
    row = db.get(LeaveRequest, req["id"])
    row.created_at = row.created_at - timedelta(days=3)
    db.commit()
    for path, email in (("/requests", EMPLOYEE), ("/team/requests", MANAGER), ("/me/dashboard", EMPLOYEE), ("/me/dashboard", HR)):
        assert client.get(path, headers=auth(email)).status_code == 200
    assert client.get(f"/requests/{req['id']}", headers=auth(EMPLOYEE)).json()["status"] == "pending"


def test_employee_can_cancel_only_pending_own_request(client, auth):
    req = pending_request_of(client, auth, EMPLOYEE)
    r = client.post(f"/requests/{req['id']}/cancel", headers=auth(EMPLOYEE))
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    assert client.post(f"/requests/{req['id']}/cancel", headers=auth(EMPLOYEE)).status_code == 409
    assert client.post(f"/team/requests/{req['id']}/decision", json={"decision": "approve"}, headers=auth(MANAGER)).status_code == 409


def test_create_validation(client, auth):
    h = auth(EMPLOYEE)
    assert client.post("/requests", json={"start_date": d(10), "end_date": d(5)}, headers=h).status_code == 422
    assert client.post("/requests", json={"start_date": d(-3), "end_date": d(2)}, headers=h).status_code == 422
    assert client.post("/requests", json={"start_date": d(10), "end_date": d(80)}, headers=h).status_code == 422
    assert client.post("/requests", json={"start_date": d(10), "end_date": d(11), "status": "approved"}, headers=h).status_code == 422
    assert client.post("/requests", json={"start_date": d(10), "end_date": d(11), "type": "bonus"}, headers=h).status_code == 422
    # overlaps the seeded pending request (today+40 .. +46)
    assert client.post("/requests", json={"start_date": d(42), "end_date": d(43)}, headers=h).status_code == 409


def test_cannot_request_more_than_available_balance(client, auth):
    balance = client.get("/me", headers=auth(EMPLOYEE)).json()["leave_balance"]
    too_many = balance["available_days"] + 1
    r = client.post("/requests", json={"start_date": d(120), "end_date": d(120 + too_many - 1)}, headers=auth(EMPLOYEE))
    assert r.status_code == 422 and "Недостаточно" in r.json()["detail"]


def test_dashboard_aggregates_profile_requests_and_notifications(client, auth):
    data = client.get("/me/dashboard", headers=auth(EMPLOYEE)).json()
    p = data["profile"]
    for key in ("full_name", "company", "position", "department", "manager", "hire_date", "leave_balance"):
        assert p[key], key
    assert p["company"] == "Jana Post" and p["manager"]["full_name"].startswith("Абдрахманов")
    assert data["recent_requests"] and data["notifications"]["unread_count"] >= 1
    assert data["team_pending_count"] is None
    assert client.get("/me/dashboard", headers=auth(MANAGER)).json()["team_pending_count"] == 2
    assert client.get("/me/dashboard", headers=auth(HR)).json()["hr_stats"]["employees"] == 10
