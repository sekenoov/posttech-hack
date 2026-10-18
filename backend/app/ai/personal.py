"""Questions about the asker's own data, answered from the database.

"Сколько дней я могу взять в отпуск?", "Что с моей заявкой с 3 по 7 августа?",
"Какие курсы мне назначены?", and for managers "Какие заявки ждут моего
решения?" or "Кто из команды в отпуске?" need the employee's records, not a rule
from the knowledge base. Answers are built here with the same access rules as
the pages that show these records, so personal data never reaches retrieval or
an LLM. Impersonal questions ("сколько дней отпуска положено?", "как пройти
курс?") stay with the knowledge base.
"""
import re
from dataclasses import dataclass, field
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.ai import dates, guard
from app.ai.retriever import normalize, words
from app.models import CourseAssignment, LeaveRequest, RequestStatus, Role, User
from app.services.academy import assignment_out
from app.services.views import balance_out

NEW_REQUEST_LINK = "/requests/new"
MAX_ITEMS = 10
RECENT_REQUESTS = 5
UPCOMING_LEAVE_DAYS = 14

# "отпуск", "отпуска", but not "отпускные" (holiday pay is a knowledge-base question)
_LEAVE = ("отпуск",)
_NOT_LEAVE = ("отпускн",)
# Words that only make sense about a balance: "осталось", "остаток", "доступно", "баланс"
_BALANCE = ("остал", "остат", "доступн", "баланс")
_PRONOUNS = {"я", "мне", "меня", "мной", "мною", "мой", "моя", "мое", "мои", "моего", "моей", "моему", "моим",
             "моих", "мою", "моими", "моем", "могу"}
# How-to and rule questions belong to the knowledge base even when they say "мой"
_RULE_WORDS = {"как", "кто", "когда", "почему", "зачем", "можно", "нужно", "надо", "должен", "должна"}

_REQUEST = ("заявк",)
_REQUEST_STATUS = ("статус", "согласовал", "согласован", "одобрил", "одобрен", "отклонил", "отклонен", "рассмотрел",
                   "рассмотрен", "утвердил", "утвержден", "решени")
_OWN_REQUEST = re.compile(r"\b(?:мо[йяеию]\w*)\s+(?:\w+\s+)?(?:заявк|отпуск)")

_COURSE = ("курс", "обучени", "academy", "академи", "тренинг", "урок")
_ASSIGNED = ("назначен",)

_APPROVER_SELF = re.compile(r"\bмо(?:его|ей|ё|е)\s+(?:решени|согласовани|одобрени|рассмотрени|утверждени|подпис)")
_APPROVER_TODO = re.compile(r"\b(?:мне|я|нам)\b.*\b(?:согласовать|одобрить|утвердить|рассмотреть|подписать)\b")
_TEAM = ("команд", "подчинен", "сотрудник", "отдел", "коллег")
_WAITING = ("ждут", "ждет", "ожида")

_LEAVE_WHEN = ("сейчас", "сегодня", "уход", "уйд", "ближайш", "недел", "завтра", "месяц", "находит", "отдыха",
               "будет", "будут", "планиру")
_LEAVE_RULE = ("согласу", "отозв", "отзыв", "положен", "может", "имеет", "оплач", "решает", "утвержда")

_STATUS_WORD = {
    RequestStatus.PENDING: "на рассмотрении",
    RequestStatus.APPROVED: "согласована",
    RequestStatus.REJECTED: "отклонена",
    RequestStatus.CANCELLED: "отозвана",
}


@dataclass
class Item:
    kind: str       # request | course
    title: str
    subtitle: str
    status: str
    link: str


@dataclass
class Reply:
    text: str
    link: str | None = None
    items: list[Item] = field(default_factory=list)
    refused: bool = False  # someone else's data


# --- recognition ---------------------------------------------------------------

def _has(ws: list[str], stems: tuple[str, ...]) -> bool:
    return any(w.startswith(stems) for w in ws)


def _mentions_leave(ws: list[str]) -> bool:
    return any(w.startswith(_LEAVE) and not w.startswith(_NOT_LEAVE) for w in ws)


def _own(text: str) -> bool:
    """First person, not counting "моего руководителя"-style references to someone else."""
    return bool(set(words(guard._POSSESSIVE_OTHER.sub(" ", text))) & _PRONOUNS)


def _third_party(text: str) -> bool:
    return any(t in text for t in guard._THIRD_PARTY)


def _balance_intent(ws: list[str], text: str) -> str | None:
    if not _mentions_leave(ws):
        return None
    balance = _has(ws, _BALANCE)
    # "За сколько дней подавать заявку" asks about a deadline, not an amount
    how_many = any(w == "сколько" and (i == 0 or ws[i - 1] != "за") for i, w in enumerate(ws))
    if not (balance or how_many):
        return None
    own = _own(text)
    if _third_party(text) and not own:
        # "Сколько дней отпуска осталось у моего руководителя?" is someone's data;
        # "Сколько отпуска положено руководителю?" is a rule for the knowledge base.
        return "balance_other" if balance else None
    return "balance" if own or balance else None


def _approvals_intent(ws: list[str], text: str) -> bool:
    if _APPROVER_SELF.search(text) or (_APPROVER_TODO.search(text) and not _has(ws, ("сво",))):
        return True
    if _has(ws, _REQUEST) and not _OWN_REQUEST.search(text):
        team = _has(ws, _TEAM)
        waiting = _has(ws, _WAITING) or "на согласовании" in text or "на рассмотрении" in text
        return waiting and (team or _has(ws, ("решени", "согласован")))
    return False


def _team_leave_intent(ws: list[str]) -> bool:
    return ("кто" in ws and _mentions_leave(ws) and not _has(ws, _LEAVE_RULE)
            and (_has(ws, _LEAVE_WHEN) or _has(ws, _TEAM) or "моих" in ws or "наших" in ws))


def _courses_intent(ws: list[str], text: str) -> bool:
    if not _has(ws, _COURSE) or "как" in ws or _has(ws, ("проходн",)):
        return False
    return _own(text) or _has(ws, _ASSIGNED)


def _requests_intent(ws: list[str], text: str, q: dates.DateQuery) -> bool:
    if not (_has(ws, _REQUEST) or _mentions_leave(ws)) or set(ws) & _RULE_WORDS:
        return False
    own = _own(text)
    if _third_party(text) and not own:
        return False
    if _has(ws, _REQUEST_STATUS):
        return own or not q.empty or _has(ws, ("статус",))
    return bool(_OWN_REQUEST.search(text)) or (_has(ws, _REQUEST) and not q.empty)


def classify(question: str) -> str | None:
    """balance | balance_other | requests | courses | approvals | team_leave, or None."""
    ws = words(question)
    text = f" {normalize(question)} "
    if _approvals_intent(ws, text):
        return "approvals"
    if _team_leave_intent(ws):
        return "team_leave"
    if intent := _balance_intent(ws, text):
        return intent
    if _courses_intent(ws, text):
        return "courses"
    if _requests_intent(ws, text, dates.parse(question)):
        return "requests"
    return None


# --- wording -----------------------------------------------------------------

def _plural(n: int, one: str, few: str, many: str) -> str:
    if n % 10 == 1 and n % 100 != 11:
        return one
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
        return few
    return many


def _days(n: int) -> str:
    return f"{n} {_plural(n, 'день', 'дня', 'дней')}"


def _requests_n(n: int) -> str:
    return f"{n} {_plural(n, 'заявка', 'заявки', 'заявок')}"


def _fmt(d: date) -> str:
    return d.strftime("%d.%m.%Y")


def _period(r: LeaveRequest) -> str:
    return f"{_fmt(r.start_date)}-{_fmt(r.end_date)}"


def _approver(r: LeaveRequest) -> str:
    manager = r.employee.manager
    return f"руководителя ({manager.full_name})" if manager else "HR"


def _request_item(r: LeaveRequest, with_employee: bool = False) -> Item:
    if r.status == RequestStatus.PENDING:
        subtitle = f"Подана {_fmt(r.created_at.date())}" if with_employee else f"На рассмотрении у {_approver(r)}"
    elif r.status == RequestStatus.CANCELLED:
        subtitle = "Отозвана"
    else:
        verb = "Согласовал(а)" if r.status == RequestStatus.APPROVED else "Отклонил(а)"
        who = r.decided_by.full_name if r.decided_by else "руководитель"
        subtitle = f"{verb}: {who}" + (f", {_fmt(r.decided_at.date())}" if r.decided_at else "")
    title = f"{_period(r)}, {_days(r.days)}"
    if with_employee:
        title, subtitle = r.employee.full_name, f"{title}. {subtitle}"
    return Item("request", title, subtitle, r.status, f"/requests/{r.id}")


def _request_detail(r: LeaveRequest) -> str:
    head = f"Заявка на отпуск {_period(r)} ({_days(r.days)}) {_STATUS_WORD.get(r.status, r.status)}."
    if r.status == RequestStatus.PENDING:
        return f"{head} Решение принимает {_approver(r)}, подана {_fmt(r.created_at.date())}."
    if r.status == RequestStatus.CANCELLED:
        return f"{head} Вы отозвали её до решения."
    who = r.decided_by.full_name if r.decided_by else "руководитель"
    when = f" {_fmt(r.decided_at.date())}" if r.decided_at else ""
    tail = f" Комментарий: «{r.decision_comment}»." if r.decision_comment else ""
    return f"{head} Решение принял(а) {who}{when}.{tail}"


def _status_summary(rows: list[LeaveRequest]) -> str:
    counts = {s: sum(r.status == s for r in rows) for s in _STATUS_WORD}
    parts = [f"{_STATUS_WORD[s]}: {n}" for s, n in counts.items() if n]
    return ", ".join(parts)


# --- answers -----------------------------------------------------------------

def _balance(db: Session, user: User) -> Reply:
    b = balance_out(db, user.id)
    breakdown = f"Положено на {b.year} год: {_days(b.total_days)}. Использовано: {_days(b.used_days)}."
    if b.pending_days:
        breakdown += f" На согласовании: {_days(b.pending_days)}."

    if b.available_days > 0:
        n = b.available_days
        head = f"Сейчас вы можете взять {n} {_plural(n, 'календарный день', 'календарных дня', 'календарных дней')} отпуска."
        return Reply(f"{head}\n\n{breakdown}", NEW_REQUEST_LINK)

    if b.pending_days and b.remaining_days > 0:
        why = f"Остаток ({_days(b.remaining_days)}) занят заявками, которые ждут решения руководителя."
    else:
        why = f"Все дни отпуска на {b.year} год уже использованы."
    return Reply(f"Сейчас свободных дней отпуска нет. {why}\n\n{breakdown}")


def _covers_month(r: LeaveRequest, month: int, year: int | None = None) -> bool:
    """True if any day of the leave falls in the month (and year, if given).

    Walks the months from start to end, so a leave from 28 December to
    3 January belongs to both December and January.
    """
    y, m = r.start_date.year, r.start_date.month
    while (y, m) <= (r.end_date.year, r.end_date.month):
        if m == month and (year is None or y == year):
            return True
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return False


def _matches(rows: list[LeaveRequest], q: dates.DateQuery, today: date) -> list[LeaveRequest]:
    def same_day(a: date, b: date) -> bool:
        return a == b if q.year_given else (a.month, a.day) == (b.month, b.day)

    found = rows
    if q.start:
        if q.end:
            exact = [r for r in found if same_day(r.start_date, q.start) and same_day(r.end_date, q.end)]
            found = exact or [r for r in found if r.start_date <= q.end and r.end_date >= q.start]
        else:
            exact = [r for r in found if same_day(r.start_date, q.start)]
            found = exact or [r for r in found if r.start_date <= q.start <= r.end_date]
    elif q.month:
        in_year = [r for r in found if _covers_month(r, q.month, today.year)]
        found = in_year or [r for r in found if _covers_month(r, q.month)]
    if q.days:
        found = [r for r in found if r.days == q.days]
    return found


def _requests(db: Session, user: User, question: str, today: date) -> Reply:
    rows = (db.query(LeaveRequest).filter(LeaveRequest.employee_id == user.id)
            .order_by(LeaveRequest.created_at.desc(), LeaveRequest.id.desc()).all())
    if not rows:
        return Reply("У вас пока нет заявок на отпуск.", NEW_REQUEST_LINK)

    q = dates.parse(question, today)
    if not q.empty:
        found = _matches(rows, q, today)
        if len(found) == 1:
            return Reply(_request_detail(found[0]), items=[_request_item(found[0])])
        if found:
            shown = found[:MAX_ITEMS]
            return Reply(f"Нашла {_requests_n(len(found))} по вашему запросу: {_status_summary(found)}.",
                         "/requests", [_request_item(r) for r in shown])
        recent = rows[:RECENT_REQUESTS]
        return Reply("Заявки с такими датами у вас нет. Вот ваши последние заявки.",
                     "/requests", [_request_item(r) for r in recent])

    recent = rows[:RECENT_REQUESTS]
    if len(rows) == 1:
        return Reply(_request_detail(rows[0]), items=[_request_item(rows[0])])
    text = f"У вас {_requests_n(len(rows))}: {_status_summary(rows)}."
    if len(rows) > len(recent):
        text += f" Ниже последние {len(recent)}."
    return Reply(text, "/requests", [_request_item(r) for r in recent])


def _course_item(a: CourseAssignment) -> Item:
    out = assignment_out(a)
    if out.status == "completed":
        subtitle = f"Пройден, результат {out.score}%" if out.score is not None else "Пройден"
    else:
        subtitle = f"Уроки: {out.lessons_done} из {out.lessons_total}, прогресс {out.progress_pct}%"
        if out.due_date:
            subtitle += f", срок до {_fmt(out.due_date)}"
    return Item("course", out.course_title, subtitle, out.status, f"/academy/{out.course_id}")


def _courses(db: Session, user: User) -> Reply:
    rows = (db.query(CourseAssignment).filter(CourseAssignment.user_id == user.id)
            .order_by(CourseAssignment.assigned_at.desc(), CourseAssignment.id.desc()).all())
    if not rows:
        return Reply("Вам пока не назначено ни одного курса. Каталог курсов доступен в Jana Academy.", "/academy")
    done = sum(a.status == "completed" for a in rows)
    text = f"Вам {_plural(len(rows), 'назначен', 'назначено', 'назначено')} {len(rows)} " \
           f"{_plural(len(rows), 'курс', 'курса', 'курсов')}, завершено: {done}."
    open_due = sorted((a for a in rows if a.status != "completed" and a.due_date), key=lambda a: a.due_date)
    if open_due:
        text += f" Ближайший срок: «{open_due[0].course.title}» до {_fmt(open_due[0].due_date)}."
    return Reply(text, "/academy", [_course_item(a) for a in rows[:MAX_ITEMS]])


def _team(db: Session, user: User):
    """The people whose requests the user decides on: direct reports, or everyone for HR."""
    q = db.query(User).filter(User.is_active.is_(True), User.id != user.id)
    return q.filter(User.manager_id == user.id) if user.role == Role.MANAGER else q


def _team_section(user: User) -> str:
    return "«Заявки сотрудников»" if user.role == Role.HR else "«Команда»"


def _approvals(db: Session, user: User) -> Reply:
    if user.role not in (Role.MANAGER, Role.HR):
        return Reply("Согласовывать заявки могут только руководитель и HR. Чтобы узнать статус своих заявок, "
                     "спросите, например: «Что с моими заявками?».", "/requests")
    team_ids = [u.id for u in _team(db, user)]
    rows = (db.query(LeaveRequest)
            .filter(LeaveRequest.status == RequestStatus.PENDING, LeaveRequest.employee_id.in_(team_ids))
            .order_by(LeaveRequest.start_date, LeaveRequest.id).all())
    whose = "в компании" if user.role == Role.HR else "от вашей команды"
    if not rows:
        return Reply(f"Заявок, которые ждут вашего решения, {whose} нет.", "/team")
    text = f"Вашего решения ждут {_requests_n(len(rows))} {whose}."
    if len(rows) > MAX_ITEMS:
        text += f" Ниже ближайшие {MAX_ITEMS}, остальные в разделе {_team_section(user)}."
    return Reply(text, "/team", [_request_item(r, with_employee=True) for r in rows[:MAX_ITEMS]])


def _team_leave(db: Session, user: User, today: date) -> Reply:
    if user.role not in (Role.MANAGER, Role.HR):
        return Reply("Сведения об отпусках коллег доступны только руководителю и HR в рамках их полномочий.",
                     refused=True)
    team_ids = [u.id for u in _team(db, user)]
    horizon = today + timedelta(days=UPCOMING_LEAVE_DAYS)
    rows = (db.query(LeaveRequest)
            .filter(LeaveRequest.status == RequestStatus.APPROVED, LeaveRequest.employee_id.in_(team_ids),
                    LeaveRequest.start_date <= horizon, LeaveRequest.end_date >= today)
            .order_by(LeaveRequest.start_date, LeaveRequest.id).all())
    who = "в компании" if user.role == Role.HR else "из вашей команды"
    if not rows:
        return Reply(f"Сейчас никто {who} не в отпуске, и в ближайшие {UPCOMING_LEAVE_DAYS} дней "
                     "согласованных отпусков нет.", "/team")
    now = [r for r in rows if r.start_date <= today]
    soon = [r for r in rows if r.start_date > today]
    text = f"Сейчас в отпуске {who}: {len(now)}. Уходят в ближайшие {UPCOMING_LEAVE_DAYS} дней: {len(soon)}."
    items = []
    for r in rows[:MAX_ITEMS]:
        when = f"В отпуске до {_fmt(r.end_date)}" if r.start_date <= today \
            else f"С {_fmt(r.start_date)} по {_fmt(r.end_date)}, {_days(r.days)}"
        items.append(Item("request", r.employee.full_name, when, r.status, f"/requests/{r.id}"))
    if len(rows) > MAX_ITEMS:
        text += f" Ниже первые {MAX_ITEMS}, остальные в разделе {_team_section(user)}."
    return Reply(text, "/team", items)


def answer(db: Session, user: User, question: str, today: date | None = None) -> Reply | None:
    """The answer from the user's own records, or None when the question is not about them."""
    today = today or date.today()
    intent = classify(question)
    if intent == "balance_other":
        return Reply("Я не предоставляю информацию об отпусках других сотрудников. Данные о коллегах "
                     "доступны только руководителю и HR в рамках их полномочий.", refused=True)
    if intent == "balance":
        return _balance(db, user)
    if intent == "requests":
        return _requests(db, user, question, today)
    if intent == "courses":
        return _courses(db, user)
    if intent == "approvals":
        return _approvals(db, user)
    if intent == "team_leave":
        return _team_leave(db, user, today)
    return None
