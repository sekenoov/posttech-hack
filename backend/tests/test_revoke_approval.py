"""Revoking an approval: approved -> pending before the leave starts.

The direct manager or HR can take an approval back; days return to the balance,
the Documentolog order is withdrawn, and the request can be decided again.
"""
from datetime import date

import pytest

from app.models import IntegrationEvent
from app.services import leave as leave_service
from tests.conftest import DIRECTOR, EMPLOYEE, HR, MANAGER, MANAGER2

KAIRAT = "kairat@janamen.example"   # Нурлан's report, approved leave in two months
MARIA = "maria@janamen.example"     # Нурлан's report, on approved leave right now


def approved_of(client, auth, email):
    rows = client.get("/requests", params={"status": "approved"}, headers=auth(email)).json()
    return {r["id"]: r for r in rows}


def future_approved(client, auth, email=KAIRAT):
    today = date.today().isoformat()
    return next(r for r in approved_of(client, auth, email).values() if r["start_date"] > today)


def balance(client, auth, email):
    return client.get("/me", headers=auth(email)).json()["leave_balance"]


def revoke(client, auth, request_id, email, comment=None):
    return client.post(f"/team/requests/{request_id}/revoke", json={"comment": comment}, headers=auth(email))


def test_manager_revokes_approval_and_request_is_pending_again(client, auth, db):
    req = future_approved(client, auth)
    before = balance(client, auth, KAIRAT)
    assert client.get(f"/requests/{req['id']}", headers=auth(MANAGER)).json()["can_revoke"] is True
    assert client.get(f"/requests/{req['id']}", headers=auth(KAIRAT)).json()["can_revoke"] is False

    r = revoke(client, auth, req["id"], MANAGER, "Изменился график отгрузок")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "pending" and body["can_decide"] and not body["can_revoke"]
    assert body["decided_by"] is None and body["decided_at"] is None and body["docflow_ref"] is None
    last = body["history"][-1]
    assert (last["from_status"], last["to_status"], last["comment"]) == ("approved", "pending", "Изменился график отгрузок")
    assert last["actor"]["full_name"].startswith("Абдрахманов")

    after = balance(client, auth, KAIRAT)
    assert after["used_days"] == before["used_days"] - req["days"]
    assert after["pending_days"] == before["pending_days"] + req["days"]
    assert after["available_days"] == before["available_days"]

    notes = client.get("/notifications", headers=auth(KAIRAT)).json()["items"]
    note = next(n for n in notes if n["type"] == "request_revoked")
    assert note["link"] == f"/requests/{req['id']}" and "Изменился график отгрузок" in note["body"]

    event = db.query(IntegrationEvent).filter_by(operation="cancel_leave_order").one()
    assert event.status == "ok" and event.reference == req["docflow_ref"]

    # the request can be decided again: a new order goes to Documentolog
    again = client.post(f"/team/requests/{req['id']}/decision", json={"decision": "approve"}, headers=auth(MANAGER))
    assert again.status_code == 200 and again.json()["status"] == "approved" and again.json()["docflow_ref"]
    assert balance(client, auth, KAIRAT)["used_days"] == before["used_days"]


def test_hr_revokes_a_manager_approval_and_the_manager_is_told(client, auth):
    req = future_approved(client, auth)
    assert revoke(client, auth, req["id"], HR).status_code == 200
    notes = client.get("/notifications", headers=auth(MANAGER)).json()["items"]
    assert any(n["type"] == "request_revoked" and n["title"] == "Ваше согласование отозвано" for n in notes)
    employee_note = next(n for n in client.get("/notifications", headers=auth(KAIRAT)).json()["items"]
                         if n["type"] == "request_revoked")
    assert "Причина" not in employee_note["body"]


def test_employee_and_other_teams_cannot_revoke(client, auth):
    req = future_approved(client, auth)
    assert revoke(client, auth, req["id"], KAIRAT).status_code == 403   # not a team lead at all
    assert revoke(client, auth, req["id"], EMPLOYEE).status_code == 403
    assert revoke(client, auth, req["id"], MANAGER2).status_code == 404  # someone else's team is invisible
    assert client.get(f"/requests/{req['id']}", headers=auth(KAIRAT)).json()["status"] == "approved"


def test_manager_cannot_revoke_approval_of_own_request(client, auth):
    own = client.get("/requests", params={"status": "pending"}, headers=auth(MANAGER)).json()[0]
    assert client.post(f"/team/requests/{own['id']}/decision", json={"decision": "approve"},
                       headers=auth(DIRECTOR)).status_code == 200
    r = revoke(client, auth, own["id"], MANAGER)
    assert r.status_code == 403 and "собственной" in r.json()["detail"]
    assert revoke(client, auth, own["id"], DIRECTOR).status_code == 200


@pytest.mark.parametrize("email", [MARIA, EMPLOYEE])
def test_started_or_past_leave_cannot_be_revoked(client, auth, email):
    today = date.today().isoformat()
    started = next(r for r in approved_of(client, auth, email).values() if r["start_date"] <= today)
    assert client.get(f"/requests/{started['id']}", headers=auth(MANAGER)).json()["can_revoke"] is False
    r = revoke(client, auth, started["id"], MANAGER)
    assert r.status_code == 409 and "уже начался" in r.json()["detail"]


def test_only_approved_requests_can_be_revoked(client, auth):
    pending = client.get("/requests", params={"status": "pending"}, headers=auth(EMPLOYEE)).json()[0]
    r = revoke(client, auth, pending["id"], MANAGER)
    assert r.status_code == 409 and "только согласованную" in r.json()["detail"]


def test_docflow_outage_does_not_block_revocation(client, auth, db, monkeypatch):
    class Broken:
        system = "documentolog"

        def cancel_leave_order(self, **_):
            raise RuntimeError("documentolog is down")

    monkeypatch.setattr(leave_service, "get_docflow_provider", lambda: Broken())
    req = future_approved(client, auth)
    assert revoke(client, auth, req["id"], MANAGER).json()["status"] == "pending"
    event = db.query(IntegrationEvent).filter_by(operation="cancel_leave_order").one()
    assert event.status == "error"


def test_comment_is_limited(client, auth):
    req = future_approved(client, auth)
    assert revoke(client, auth, req["id"], MANAGER, "x" * 501).status_code == 422
