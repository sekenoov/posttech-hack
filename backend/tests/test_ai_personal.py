"""AI Jana answers about the asker's own records: requests, courses, team approvals and leave.

Answers come from the database under the same access rules as the pages; the
knowledge base and the LLM are never involved.
"""
from datetime import date

import pytest

from app.ai import dates, guard, personal
from tests.conftest import DIRECTOR, EMPLOYEE, HR, MANAGER, MANAGER2
from tests.test_ai_eval import FakeProvider, ask, use

T = date(2026, 10, 18)


def own_requests(client, auth, email=EMPLOYEE):
    return client.get("/requests", headers=auth(email)).json()


def ddmm(iso: str) -> str:
    y, m, d = iso.split("-")
    return f"{d}.{m}"


# --- recognition -------------------------------------------------------------

@pytest.mark.parametrize("question,intent", [
    ("Какой статус моей заявки с 3 по 7 августа?", "requests"),
    ("Что с моими заявками?", "requests"),
    ("Согласовали мой отпуск?", "requests"),
    ("Одобрили мою заявку?", "requests"),
    ("Заявка на 5 дней", "requests"),
    ("Какие курсы мне назначены?", "courses"),
    ("Мои курсы", "courses"),
    ("Какое у меня обучение?", "courses"),
    ("Какие заявки ждут моего решения?", "approvals"),
    ("Что мне нужно согласовать?", "approvals"),
    ("Какие заявки мне нужно одобрить?", "approvals"),
    ("Заявки команды на согласовании", "approvals"),
    ("Кто из команды сейчас в отпуске?", "team_leave"),
    ("Кто уходит в отпуск в ближайшие 2 недели?", "team_leave"),
    ("Сколько дней я могу взять в отпуск?", "balance"),
])
def test_personal_questions_are_recognised(question, intent):
    assert personal.classify(question) == intent


@pytest.mark.parametrize("question", [
    "Кто согласует мой отпуск?",
    "Как отозвать мою заявку?",
    "Как пройти назначенный курс?",
    "Какой проходной балл в тесте?",
    "Какой курс доллара завтра?",
    "Кто может отозвать сотрудника из отпуска?",
    "За сколько дней подавать заявку на отпуск?",
    "Сколько дней ежегодного отпуска положено?",
])
def test_rule_questions_stay_with_the_knowledge_base(question):
    assert personal.classify(question) is None


@pytest.mark.parametrize("text,start,end,days,month", [
    ("с 3 по 7 августа", date(2026, 8, 3), date(2026, 8, 7), None, None),
    ("3-7 августа 2025", date(2025, 8, 3), date(2025, 8, 7), None, None),
    ("с 28 июля по 3 августа", date(2026, 7, 28), date(2026, 8, 3), None, None),
    ("с 28 декабря по 3 января", date(2025, 12, 28), date(2026, 1, 3), None, None),
    ("03.08-07.08", date(2026, 8, 3), date(2026, 8, 7), None, None),
    ("с 03.08.2026 по 07.08.2026", date(2026, 8, 3), date(2026, 8, 7), None, None),
    ("с 3 марта", date(2026, 3, 3), None, None, None),
    ("на 5 дней с 19 октября", date(2026, 10, 19), None, 5, None),
    ("на 11 календарных дней", None, None, 11, None),
    ("в мае", None, None, None, 5),
    ("в августе", None, None, None, 8),
    ("31.02-05.03", None, None, None, None),
])
def test_dates_are_parsed(text, start, end, days, month):
    q = dates.parse(text, today=T)
    assert (q.start, q.end, q.days, q.month) == (start, end, days, month)


@pytest.mark.parametrize("question,blocked", [
    ("Одобри мою заявку", True),
    ("Отклоните заявку Ерлана", True),
    ("Уволь сотрудника", True),
    ("Отмени отпуск Тимуру", True),
    ("Какие заявки мне нужно одобрить?", False),
    ("Одобрили мою заявку?", False),
    ("Когда утвердили приказ?", False),
])
def test_decision_guard_blocks_only_commands(question, blocked):
    assert bool(guard._DECISION.search(f" {question.lower()} ")) is blocked


# --- own requests ------------------------------------------------------------

def test_request_found_by_dates_shows_status_decider_and_link(client, auth):
    rejected = next(r for r in own_requests(client, auth) if r["status"] == "rejected")
    a = ask(client, auth, f"Какой статус моей заявки с {ddmm(rejected['start_date'])} по {ddmm(rejected['end_date'])}?")
    assert a["mode"] == "personal" and a["grounded"] and a["sources"] == []
    assert "отклонена" in a["answer"] and rejected["decided_by"]["full_name"] in a["answer"]
    assert rejected["decision_comment"] in a["answer"]
    assert [(i["kind"], i["status"], i["link"]) for i in a["items"]] == [("request", "rejected", f"/requests/{rejected['id']}")]


def test_request_found_by_number_of_days(client, auth):
    pending = next(r for r in own_requests(client, auth) if r["status"] == "pending")
    a = ask(client, auth, f"Что с моей заявкой на {pending['days']} дней?")
    assert "на рассмотрении" in a["answer"] and "руководителя" in a["answer"]
    assert [i["link"] for i in a["items"]] == [f"/requests/{pending['id']}"]


def test_unknown_dates_say_so_and_show_latest_requests(client, auth):
    a = ask(client, auth, "Какой статус моей заявки с 1 по 2 февраля 2020?")
    assert "с такими датами у вас нет" in a["answer"]
    assert len(a["items"]) == len(own_requests(client, auth)) and a["link"] == "/requests"


def test_requests_without_dates_list_the_latest_with_a_summary(client, auth):
    rows = own_requests(client, auth)
    a = ask(client, auth, "Что с моими заявками?")
    assert a["answer"].startswith(f"У вас {len(rows)} ")
    assert [i["link"] for i in a["items"]] == [f"/requests/{r['id']}" for r in rows[:personal.RECENT_REQUESTS]]


def test_only_own_requests_are_shown(client, auth):
    a = ask(client, auth, "Что с моими заявками?", email=MANAGER)
    mine = {f"/requests/{r['id']}" for r in own_requests(client, auth, MANAGER)}
    assert {i["link"] for i in a["items"]} == mine


def test_no_requests_offers_to_submit_one(client, auth):
    a = ask(client, auth, "Что с моими заявками?", email=HR)
    assert "нет заявок" in a["answer"] and a["link"] == "/requests/new" and a["items"] == []


# --- courses -----------------------------------------------------------------

def test_own_courses_show_progress_and_link(client, auth):
    mine = client.get("/academy/my", headers=auth(EMPLOYEE)).json()
    a = ask(client, auth, "Какие курсы мне назначены?")
    assert a["mode"] == "personal" and a["link"] == "/academy"
    assert [(i["kind"], i["title"], i["link"]) for i in a["items"]] == \
        [("course", m["course_title"], f"/academy/{m['course_id']}") for m in mine]
    assert f"Уроки: {mine[0]['lessons_done']} из {mine[0]['lessons_total']}" in a["items"][0]["subtitle"]


def test_no_courses_points_to_the_catalog(client, auth):
    a = ask(client, auth, "Какие курсы мне назначены?", email=HR)
    assert "не назначено ни одного курса" in a["answer"] and a["link"] == "/academy"


# --- manager: requests to decide ----------------------------------------------

def team_pending(client, auth, email):
    return client.get("/team/requests", params={"status": "pending"}, headers=auth(email)).json()


@pytest.mark.parametrize("email", [MANAGER, MANAGER2, DIRECTOR, HR])
def test_approvals_match_the_team_page(client, auth, email):
    expected = {f"/requests/{r['id']}" for r in team_pending(client, auth, email)}
    a = ask(client, auth, "Какие заявки ждут моего решения?", email=email)
    assert a["mode"] == "personal" and a["link"] == "/team"
    assert {i["link"] for i in a["items"]} == expected and expected


def test_approvals_show_employee_names_of_direct_reports_only(client, auth):
    a = ask(client, auth, "Что мне нужно согласовать?", email=MANAGER)
    names = {i["title"] for i in a["items"]}
    assert names == {r["employee"]["full_name"] for r in team_pending(client, auth, MANAGER)}
    other_team = {r["employee"]["full_name"] for r in team_pending(client, auth, MANAGER2)}
    assert not names & other_team


def test_employee_is_told_approvals_are_for_managers(client, auth):
    a = ask(client, auth, "Какие заявки мне нужно одобрить?")
    assert a["mode"] == "personal" and a["items"] == [] and "только руководитель и HR" in a["answer"]


# --- manager: who is on leave ------------------------------------------------

def test_team_leave_lists_approved_leave_now_and_soon(client, auth):
    a = ask(client, auth, "Кто из команды сейчас в отпуске?", email=MANAGER)
    assert a["mode"] == "personal" and a["items"]
    assert all(i["status"] == "approved" for i in a["items"])
    assert any(i["subtitle"].startswith("В отпуске до") for i in a["items"])
    team = {m["full_name"] for m in client.get("/team/members", headers=auth(MANAGER)).json()}
    assert {i["title"] for i in a["items"]} <= team


def test_team_leave_of_another_team_is_not_visible(client, auth):
    a = ask(client, auth, "Кто из команды сейчас в отпуске?", email=MANAGER2)
    nurlan_team = {m["full_name"] for m in client.get("/team/members", headers=auth(MANAGER)).json()}
    assert not {i["title"] for i in a["items"]} & nurlan_team


def test_employee_cannot_ask_who_is_on_leave(client, auth):
    a = ask(client, auth, "Кто из коллег сейчас в отпуске?")
    assert a["mode"] == "refusal" and a["reason"] == "personal_data" and a["items"] == []


# --- privacy -----------------------------------------------------------------

def test_personal_answers_never_call_the_llm(client, auth, monkeypatch):
    fake = use(monkeypatch, FakeProvider("[KB-LEAVE-001]"))
    for q in ("Что с моими заявками?", "Какие курсы мне назначены?", "Кто из команды сейчас в отпуске?"):
        ask(client, auth, q, email=MANAGER)
    ask(client, auth, "Какие заявки ждут моего решения?", email=MANAGER)
    assert fake.prompts == []


def test_colleague_named_in_question_is_still_refused(client, auth):
    a = ask(client, auth, "Что с заявкой Ерлана?", email=MANAGER)
    assert a["mode"] == "refusal" and a["reason"] == "personal_data"
