"""Questions about the asker's own leave balance, answered from the database.

"Сколько дней я могу взять в отпуск?" needs the employee's numbers, not a rule
from the knowledge base. The answer is built here from the same balance the
profile shows, so personal data never reaches retrieval or an LLM. Impersonal
questions ("сколько дней отпуска положено?") stay with the knowledge base.
"""
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.ai import guard
from app.ai.retriever import normalize, words
from app.models import User
from app.services.views import balance_out

# "отпуск", "отпуска", but not "отпускные" (holiday pay is a knowledge-base question)
_LEAVE = ("отпуск",)
_NOT_LEAVE = ("отпускн",)
# Words that only make sense about a balance: "осталось", "остаток", "доступно", "баланс"
_BALANCE = ("остал", "остат", "доступн", "баланс")
_PRONOUNS = {"я", "мне", "меня", "мной", "мною", "мой", "моя", "мое", "мои", "моего", "моей", "моему", "моим",
             "моих", "мою", "могу"}

NEW_REQUEST_LINK = "/requests/new"


@dataclass
class BalanceAnswer:
    text: str
    link: str | None


def _starts(word: str, stems: tuple[str, ...]) -> bool:
    return word.startswith(stems)


def classify(question: str) -> str | None:
    """'own' for the asker's balance, 'other' for someone else's, None otherwise."""
    ws = words(question)
    if not any(_starts(w, _LEAVE) and not _starts(w, _NOT_LEAVE) for w in ws):
        return None
    balance = any(_starts(w, _BALANCE) for w in ws)
    # "За сколько дней подавать заявку" asks about a deadline, not an amount
    how_many = any(w == "сколько" and (i == 0 or ws[i - 1] != "за") for i, w in enumerate(ws))
    if not (balance or how_many):
        return None

    text = f" {normalize(question)} "
    own_words = set(words(guard._POSSESSIVE_OTHER.sub(" ", text)))
    own = bool(own_words & _PRONOUNS)
    if any(t in text for t in guard._THIRD_PARTY) and not own:
        # "Сколько дней отпуска осталось у моего руководителя?" is someone's data;
        # "Сколько отпуска положено руководителю?" is a rule for the knowledge base.
        return "other" if balance else None
    return "own" if own or balance else None


def _plural(n: int, one: str, few: str, many: str) -> str:
    if n % 10 == 1 and n % 100 != 11:
        return one
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
        return few
    return many


def _days(n: int) -> str:
    return f"{n} {_plural(n, 'день', 'дня', 'дней')}"


def answer(db: Session, user: User) -> BalanceAnswer:
    b = balance_out(db, user.id)
    breakdown = f"Положено на {b.year} год: {_days(b.total_days)}. Использовано: {_days(b.used_days)}."
    if b.pending_days:
        breakdown += f" На согласовании: {_days(b.pending_days)}."

    if b.available_days > 0:
        n = b.available_days
        head = f"Сейчас вы можете взять {n} {_plural(n, 'календарный день', 'календарных дня', 'календарных дней')} отпуска."
        return BalanceAnswer(f"{head}\n\n{breakdown}", NEW_REQUEST_LINK)

    if b.pending_days and b.remaining_days > 0:
        why = f"Остаток ({_days(b.remaining_days)}) занят заявками, которые ждут решения руководителя."
    else:
        why = f"Все дни отпуска на {b.year} год уже использованы."
    return BalanceAnswer(f"Сейчас свободных дней отпуска нет. {why}\n\n{breakdown}", None)
