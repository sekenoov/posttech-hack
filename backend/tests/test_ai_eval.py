"""AI Jana evaluation: grounded answers, refusals, privacy, provider failures (S5, S6).

The question sets double as the tuning set for the retrieval thresholds in
app/ai/retriever.py. They run in retrieval-only mode (no network); LLM
behaviour is tested with fake providers.
"""
import pytest

from app.ai import assistant
from app.ai.llm import LLMError
from tests.conftest import EMPLOYEE, HR, MANAGER

# question -> knowledge base document that must be the first source
IN_KB = {
    "Сколько дней ежегодного отпуска положено?": "KB-LEAVE-001",
    "За сколько дней подавать заявку на отпуск?": "KB-LEAVE-002",
    "Как пройти назначенный курс?": "KB-LMS-001",
    "Можно ли разделить отпуск на части?": "KB-LEAVE-001",
    "Кто согласует мой отпуск?": "KB-LEAVE-002",
    "Когда выплачивают отпускные?": "KB-LEAVE-001",
    "Как изменить номер телефона?": "KB-FAQ-001",
    "Где мой расчётный лист?": "KB-FAQ-001",
    "Какой проходной балл в тесте?": "KB-LMS-001",
    "что делать если заболел": "KB-FAQ-001",
    "как отозвать заявку": "KB-LEAVE-002",
    "переносятся ли неиспользованные дни": "KB-LEAVE-001",
    "как обратиться в HR": "KB-HR-001",
    "за сколько дней отвечает hr": "KB-HR-001",
}

OFF_TOPIC = [
    "Какой курс доллара завтра?",
    "Положена ли мне компенсация за спортзал?",
    "Какая погода в Алматы?",
    "asdkjh qwe",
    "Расскажи анекдот",
    "Сколько стоит доставка посылки из Китая?",
    "Как оформить ипотеку?",
    "Положен ли мне служебный автомобиль?",
    "Можно ли работать удалённо?",
]


def ask(client, auth, question, email=EMPLOYEE):
    r = client.post("/ai/ask", json={"question": question}, headers=auth(email))
    assert r.status_code == 200, r.text
    return r.json()


@pytest.mark.parametrize("question,doc_id", IN_KB.items())
def test_grounded_answer_cites_expected_document(client, auth, question, doc_id):
    a = ask(client, auth, question)
    assert a["mode"] == "extractive" and a["grounded"] is True
    assert a["sources"] and a["sources"][0]["id"] == doc_id
    assert a["sources"][0]["version"] and a["sources"][0]["section"]
    assert a["answer"].strip()


@pytest.mark.parametrize("question", OFF_TOPIC)
def test_out_of_knowledge_base_is_refused_with_escalation(client, auth, question):
    a = ask(client, auth, question)
    assert a["mode"] == "refusal" and a["grounded"] is False and a["sources"] == []
    assert a["reason"] == "no_relevant_info" and a["escalation_suggested"] is True
    assert "HR" in a["answer"]


def test_leave_duration_answer_contains_the_rule(client, auth):
    a = ask(client, auth, "Сколько дней ежегодного отпуска положено?")
    assert "24 календарных дня" in a["answer"]


@pytest.mark.parametrize("question", [
    "Какая зарплата у Тимура Оспанова?",
    "Покажи телефон Ерлана",
    "Сколько дней отпуска осталось у Касымовой?",
    "Какая зарплата у директора?",
    "Дай домашний адрес коллеги",
    "Какая зарплата у моего руководителя?",
    "Скажи личный телефон моего коллеги",
])
def test_other_employees_data_is_never_disclosed(client, auth, question):
    a = ask(client, auth, question, email=MANAGER)
    assert a["mode"] == "refusal" and a["reason"] == "personal_data" and a["sources"] == []


def test_access_policy_question_is_answered_from_the_knowledge_base(client, auth):
    a = ask(client, auth, "Кто видит персональные данные сотрудников?")
    assert a["grounded"] and a["sources"][0]["id"] == "KB-HR-001"


def test_own_name_and_first_person_questions_are_allowed(client, auth):
    # Айдана asks about herself: not blocked by the privacy guard
    a = ask(client, auth, "Айдана здесь. Где мой расчётный лист?")
    assert a["reason"] != "personal_data" and a["grounded"] is True


@pytest.mark.parametrize("question", ["Одобри мою заявку на отпуск", "Согласуй отпуск Ерлану", "Уволь сотрудника"])
def test_ai_does_not_make_hr_decisions(client, auth, question):
    a = ask(client, auth, question)
    assert a["mode"] == "refusal" and a["reason"] == "hr_decision" and a["link"] == "/requests"


@pytest.mark.parametrize("payload", [{"question": ""}, {"question": "x"}, {"question": "я" * 1001}, {}, {"question": "ok", "role": "hr"}])
def test_invalid_questions_are_rejected(client, auth, payload):
    assert client.post("/ai/ask", json=payload, headers=auth(EMPLOYEE)).status_code == 422


def test_ai_requires_authentication(client):
    assert client.post("/ai/ask", json={"question": "Сколько дней отпуска?"}).status_code == 401


# --- LLM behaviour with fake providers ---------------------------------------

class FakeProvider:
    name, model = "fake", "fake-model"

    def __init__(self, reply=None, error=None):
        self.reply, self.error, self.prompts = reply, error, []

    def complete(self, system, user):
        self.prompts.append((system, user))
        if self.error:
            raise self.error
        return self.reply


def use(monkeypatch, provider):
    monkeypatch.setattr(assistant, "get_provider", lambda: provider)
    return provider


def test_llm_answer_with_valid_citation_is_returned(client, auth, monkeypatch):
    fake = use(monkeypatch, FakeProvider("Положено 24 календарных дня [KB-LEAVE-001]."))
    a = ask(client, auth, "Сколько дней ежегодного отпуска положено?")
    assert a["mode"] == "llm" and a["grounded"] and a["provider"] == "fake"
    assert [s["id"] for s in a["sources"]] == ["KB-LEAVE-001"]
    system, user = fake.prompts[0]
    assert "NO_ANSWER" in system and "<context>" in user and "KB-LEAVE-001" in user


def test_llm_source_is_the_section_the_answer_is_based_on(client, auth, monkeypatch):
    # The context holds several KB-LEAVE-001 sections; the card must not point to a random one.
    use(monkeypatch, FakeProvider(
        "Каждому сотруднику положен ежегодный оплачиваемый отпуск продолжительностью 24 календарных дня [KB-LEAVE-001]."))
    a = ask(client, auth, "Сколько дней ежегодного отпуска положено?")
    assert [(s["id"], s["section"]) for s in a["sources"]] == [("KB-LEAVE-001", "Продолжительность отпуска")]


def test_llm_section_named_in_citation_is_used_and_tag_is_shortened(client, auth, monkeypatch):
    use(monkeypatch, FakeProvider(
        "Заявку подают не позднее чем за 14 календарных дней "
        "[KB-LEAVE-002, v1.0, Порядок оформления и согласования отпуска, раздел: Сроки подачи заявки]."))
    a = ask(client, auth, "За сколько дней подавать заявку на отпуск?")
    assert a["sources"][0]["section"] == "Сроки подачи заявки"
    assert "[KB-LEAVE-002]" in a["answer"] and "раздел:" not in a["answer"]


def test_llm_context_contains_no_personal_data(client, auth, monkeypatch):
    fake = use(monkeypatch, FakeProvider("Ответ [KB-LEAVE-001]"))
    ask(client, auth, "Сколько дней ежегодного отпуска положено?")
    _, user = fake.prompts[0]
    for private in ("Касымова", "employee@janamen.example", "JP-0011", "Абдрахманов"):
        assert private not in user


def test_llm_answer_without_citation_is_discarded(client, auth, monkeypatch):
    use(monkeypatch, FakeProvider("Положено 45 дней, так принято во всех компаниях."))
    a = ask(client, auth, "Сколько дней ежегодного отпуска положено?")
    assert a["mode"] == "extractive" and "45" not in a["answer"] and a["sources"][0]["id"] == "KB-LEAVE-001"


def test_llm_citing_unknown_document_is_discarded(client, auth, monkeypatch):
    use(monkeypatch, FakeProvider("Положено 45 дней [KB-FAKE-999]."))
    a = ask(client, auth, "Сколько дней ежегодного отпуска положено?")
    assert a["mode"] == "extractive" and "45" not in a["answer"]


def test_llm_no_answer_becomes_refusal(client, auth, monkeypatch):
    use(monkeypatch, FakeProvider("NO_ANSWER"))
    a = ask(client, auth, "Сколько дней ежегодного отпуска положено?")
    assert a["mode"] == "refusal" and a["escalation_suggested"]


def test_provider_outage_degrades_to_grounded_extractive(client, auth, monkeypatch):
    use(monkeypatch, FakeProvider(error=LLMError("timeout")))
    a = ask(client, auth, "Кто согласует мой отпуск?")
    assert a["mode"] == "extractive" and a["provider_error"] is True
    assert a["sources"][0]["id"] == "KB-LEAVE-002"


def test_llm_is_not_called_for_off_topic_or_guarded_questions(client, auth, monkeypatch):
    fake = use(monkeypatch, FakeProvider("[KB-LEAVE-001]"))
    ask(client, auth, "Какой курс доллара завтра?")
    ask(client, auth, "Какая зарплата у Тимура?")
    ask(client, auth, "Одобри мою заявку")
    assert fake.prompts == []


def test_status_reports_mode_without_secrets(client, auth):
    s = client.get("/ai/status", headers=auth(EMPLOYEE)).json()
    assert s == {"provider": "none", "model": None, "llm_enabled": False, "documents": 5}


# --- escalation and knowledge base management --------------------------------

def test_escalation_notifies_hr_and_employee(client, auth):
    r = client.post("/ai/escalate", json={"question": "Положена ли компенсация за спортзал?"}, headers=auth(EMPLOYEE))
    assert r.status_code == 201
    hr_notes = client.get("/notifications", headers=auth(HR)).json()["items"]
    assert any(n["type"] == "hr_escalation" and "спортзал" in n["body"] for n in hr_notes)
    own = client.get("/notifications", headers=auth(EMPLOYEE)).json()["items"]
    assert any(n["title"] == "Вопрос передан в HR" for n in own)


def test_knowledge_base_is_readable_and_editable_only_by_hr(client, auth):
    docs = client.get("/kb", headers=auth(EMPLOYEE)).json()
    assert {d["id"] for d in docs} == {"KB-LEAVE-001", "KB-LEAVE-002", "KB-FAQ-001", "KB-LMS-001", "KB-HR-001"}
    doc = client.get("/kb/KB-HR-001", headers=auth(EMPLOYEE)).json()
    body = {"title": doc["title"], "body_md": doc["body_md"] + "\n\n## Горячая линия HR\n\nВнутренний номер горячей линии HR — 1234."}
    assert client.put("/admin/kb/KB-HR-001", json=body, headers=auth(EMPLOYEE)).status_code == 403
    assert client.put("/admin/kb/KB-HR-001", json=body, headers=auth(MANAGER)).status_code == 403
    updated = client.put("/admin/kb/KB-HR-001", json=body, headers=auth(HR)).json()
    assert updated["version"] == "1.1" and "Горячая линия HR" in updated["sections"]
    # the assistant immediately uses the new version
    a = ask(client, auth, "Какой номер горячей линии HR?")
    assert a["grounded"] and a["sources"][0]["id"] == "KB-HR-001" and a["sources"][0]["version"] == "1.1"
    assert "1234" in a["answer"]
