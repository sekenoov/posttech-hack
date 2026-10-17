"""Jana Academy: S4 at the API level plus access rules."""
from app.models import QuizQuestion
from tests.conftest import EMPLOYEE, EMPLOYEE2, HR, MANAGER

INFOSEC = "information-security-basics"


def course_id(client, auth, slug=INFOSEC, email=EMPLOYEE):
    return next(c["id"] for c in client.get("/academy/courses", headers=auth(email)).json() if c["slug"] == slug)


def answers_key(db, cid):
    return [q.correct_index for q in db.query(QuizQuestion).filter_by(course_id=cid).order_by(QuizQuestion.position)]


def test_course_payload_never_contains_answer_key(client, auth):
    cid = course_id(client, auth)
    detail = client.get(f"/academy/courses/{cid}", headers=auth(EMPLOYEE)).json()
    assert detail["questions"] and all(set(q) == {"id", "position", "text", "options"} for q in detail["questions"])
    assert "correct" not in str(detail)


def test_only_hr_can_assign_courses(client, auth, user_id):
    cid = course_id(client, auth)
    body = {"course_id": cid, "user_ids": [user_id(EMPLOYEE)]}
    assert client.post("/admin/academy/assignments", json=body, headers=auth(EMPLOYEE)).status_code == 403
    assert client.post("/admin/academy/assignments", json=body, headers=auth(MANAGER)).status_code == 403
    assert client.get("/admin/academy/assignments", headers=auth(MANAGER)).status_code == 403


def test_full_learning_flow_hr_assigns_employee_completes(client, auth, user_id, db):
    cid = course_id(client, auth)
    r = client.post("/admin/academy/assignments", json={"course_id": cid, "user_ids": [user_id(EMPLOYEE)], "due_date": "2030-01-01"},
                    headers=auth(HR))
    assert r.status_code == 201 and r.json()["created"] == [user_id(EMPLOYEE)]
    # repeated assignment is skipped, not duplicated
    assert client.post("/admin/academy/assignments", json={"course_id": cid, "user_ids": [user_id(EMPLOYEE)]},
                       headers=auth(HR)).json()["skipped"] == [user_id(EMPLOYEE)]

    notes = client.get("/notifications", headers=auth(EMPLOYEE)).json()["items"]
    assert any(n["type"] == "course_assigned" and n["link"] == f"/academy/{cid}" for n in notes)

    course = client.get(f"/academy/courses/{cid}", headers=auth(EMPLOYEE)).json()
    assert course["assignment"]["status"] == "assigned"

    # quiz is locked until every lesson is done
    assert client.post(f"/academy/courses/{cid}/quiz", json={"answers": [0] * 5}, headers=auth(EMPLOYEE)).status_code == 409

    for lesson in course["lessons"]:
        r = client.post(f"/academy/courses/{cid}/lessons/{lesson['id']}/complete", headers=auth(EMPLOYEE))
        assert r.status_code == 200
    progress = client.get("/academy/my", headers=auth(EMPLOYEE)).json()
    infosec = next(a for a in progress if a["course_id"] == cid)
    assert infosec["status"] == "in_progress" and infosec["lessons_done"] == infosec["lessons_total"] == 3
    assert infosec["progress_pct"] == 80  # persisted server-side, survives reload

    key = answers_key(db, cid)
    wrong = [(k + 1) % 4 for k in key]
    failed = client.post(f"/academy/courses/{cid}/quiz", json={"answers": wrong}, headers=auth(EMPLOYEE)).json()
    assert failed["passed"] is False and failed["score"] == 0 and failed["assignment"]["status"] == "in_progress"

    passed = client.post(f"/academy/courses/{cid}/quiz", json={"answers": key}, headers=auth(EMPLOYEE)).json()
    assert passed["passed"] is True and passed["score"] == 100 and passed["results"] == [True] * 5
    assert passed["assignment"]["status"] == "completed" and passed["assignment"]["attempts"] == 2

    assert any(n["type"] == "course_completed" for n in client.get("/notifications", headers=auth(EMPLOYEE)).json()["items"])
    assert any(n["type"] == "course_completed" for n in client.get("/notifications", headers=auth(HR)).json()["items"])

    # visible on the dashboard and in the HR overview
    learning = client.get("/me/dashboard", headers=auth(EMPLOYEE)).json()["learning"]
    assert any(a["course_id"] == cid and a["status"] == "completed" for a in learning)
    hr_rows = client.get("/admin/academy/assignments", headers=auth(HR)).json()
    assert any(a["course_id"] == cid and a["employee"]["id"] == user_id(EMPLOYEE) and a["score"] == 100 for a in hr_rows)


def test_progress_is_per_user_and_requires_assignment(client, auth, user_id):
    cid = course_id(client, auth)
    client.post("/admin/academy/assignments", json={"course_id": cid, "user_ids": [user_id(EMPLOYEE)]}, headers=auth(HR))
    lesson = client.get(f"/academy/courses/{cid}", headers=auth(EMPLOYEE)).json()["lessons"][0]
    client.post(f"/academy/courses/{cid}/lessons/{lesson['id']}/complete", headers=auth(EMPLOYEE))

    # a colleague without an assignment can neither progress nor see Айдана's progress
    other = client.get(f"/academy/courses/{cid}", headers=auth(EMPLOYEE2)).json()
    assert other["assignment"] is None and not any(l["completed"] for l in other["lessons"])
    assert client.post(f"/academy/courses/{cid}/lessons/{lesson['id']}/complete", headers=auth(EMPLOYEE2)).status_code == 404


def test_quiz_validation(client, auth, user_id):
    cid = course_id(client, auth)
    client.post("/admin/academy/assignments", json={"course_id": cid, "user_ids": [user_id(EMPLOYEE)]}, headers=auth(HR))
    for lesson in client.get(f"/academy/courses/{cid}", headers=auth(EMPLOYEE)).json()["lessons"]:
        client.post(f"/academy/courses/{cid}/lessons/{lesson['id']}/complete", headers=auth(EMPLOYEE))
    assert client.post(f"/academy/courses/{cid}/quiz", json={"answers": [0, 1]}, headers=auth(EMPLOYEE)).status_code == 422
    assert client.post(f"/academy/courses/{cid}/quiz", json={"answers": []}, headers=auth(EMPLOYEE)).status_code == 422
    assert client.post(f"/academy/courses/{cid}/lessons/999999/complete", headers=auth(EMPLOYEE)).status_code == 404
    assert client.get("/academy/courses/999999", headers=auth(EMPLOYEE)).status_code == 404


def test_self_enrollment_from_catalog(client, auth):
    cid = course_id(client, auth, email=EMPLOYEE2)
    r = client.post(f"/academy/courses/{cid}/enroll", headers=auth(EMPLOYEE2))
    assert r.status_code == 200 and r.json()["assignment"]["status"] == "assigned"
