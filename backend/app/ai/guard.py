"""Pre-retrieval guards: personal data of other people and HR decisions.

These run before anything reaches retrieval or an LLM, so the protections do
not depend on model behaviour.
"""
import re
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.ai.retriever import normalize, words
from app.models import EmployeeProfile, User

# Imperative requests for an HR decision: "одобри", "согласуй", "уволь", ... Only the
# imperative: "какие заявки мне нужно одобрить?" or "одобрили мою заявку?" is a question.
_DECISION = re.compile(
    r"\b(?:одобри|одобрите|согласуй|согласуйте|утверди|утвердите|отклони|отклоните|уволь|увольте|"
    r"повысь|повысьте|назначь|назначьте)\b|\bотмени(?:те)?\s+(?:приказ|отпуск)|\bприми(?:те)?\s+решени",
)
_SENSITIVE = ("зарплат", "оклад", "преми", "телефон", "адрес", "паспорт", "иин", "карт", "больничн",
              "диагноз", "персональн", "личн", "дата рождения", "семейн")
_THIRD_PARTY = ("коллег", "сотрудник", "руководител", "начальник", "директор", "друг", "чуж", "других",
                "его ", "ее ", "её ", "их ", "у него", "у нее", "у неё")
_FIRST_PERSON = ("мой", "моя", "мое", "моё", "мою", "мои", "моего", "моей", "моих", "мне", "у меня", "я ")
# "моего руководителя", "нашего коллеги": a possessive in front of another person is a third party
_POSSESSIVE_OTHER = re.compile(
    r"\b(?:мо[йяеёи]\w*|наш\w*)\s+(?:коллег|руководител|начальник|директор|сотрудник|друг|друз)\w*",
)
# Questions about the access policy itself ("кто видит персональные данные сотрудников?")
# ask for a rule, not for someone's data: they go to the knowledge base.
_ACCESS_POLICY = re.compile(r"\b(?:кто|кому)\b.*\b(?:видит|видят|видно|доступ\w*)|конфиденциальн")


@dataclass
class GuardResult:
    reason: str        # personal_data | hr_decision
    message: str
    link: str | None = None


def _other_people_names(db: Session, user: User) -> set[str]:
    names = set()
    for p in db.query(EmployeeProfile).filter(EmployeeProfile.user_id != user.id):
        for part in (p.last_name, p.first_name):
            if part and len(part) >= 3:
                names.add(normalize(part))
    own = user.profile
    if own:  # never block a question because it contains the asker's own name
        names -= {normalize(own.last_name), normalize(own.first_name)}
    return names


def _name_stem(name: str) -> str:
    """Касымова -> касымов, Динара -> динар: survives Russian declension endings."""
    return name.rstrip("аяоеиыуюь")


def _mentions_name(question_words: list[str], names: set[str]) -> bool:
    for w in question_words:
        for name in names:
            stem = _name_stem(name)
            if w == name or (len(stem) >= 4 and w.startswith(stem) and len(w) - len(stem) <= 3):
                return True
    return False


def check(db: Session, user: User, question: str) -> GuardResult | None:
    text = f" {normalize(question)} "
    if _DECISION.search(text):
        return GuardResult(
            "hr_decision",
            "AI Jana не принимает кадровых решений и не может согласовать, отклонить или изменить заявку. "
            "Решение по заявке принимает ваш руководитель. Статус виден в разделе «Мои заявки».",
            "/requests",
        )
    if _mentions_name(words(question), _other_people_names(db, user)):
        return GuardResult(
            "personal_data",
            "Я не предоставляю информацию о других сотрудниках. Данные о коллегах доступны только "
            "руководителю и HR в рамках их полномочий.",
        )
    sensitive = any(s in text for s in _SENSITIVE)
    third_party = any(t in text for t in _THIRD_PARTY)
    first_person = any(f" {f}" in _POSSESSIVE_OTHER.sub(" ", text) for f in _FIRST_PERSON)
    if sensitive and third_party and not first_person and not _ACCESS_POLICY.search(text):
        return GuardResult(
            "personal_data",
            "Я не раскрываю персональные данные других сотрудников. Если вопрос касается ваших данных, "
            "уточните его или обратитесь в HR.",
        )
    return None
