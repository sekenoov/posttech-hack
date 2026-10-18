"""Dates in Russian questions: "с 3 по 7 августа", "03.08-07.08", "на 5 дней", "в августе".

Only what an employee types about their own requests; anything unclear is left
out rather than guessed, and the caller falls back to the latest requests.
"""
import re
from dataclasses import dataclass
from datetime import date

from app.ai.retriever import normalize

# Prefixes in order: "мар" before "ма" so that March is not read as May
_MONTHS = (("янв", 1), ("фев", 2), ("мар", 3), ("апр", 4), ("мая", 5), ("май", 5), ("мае", 5), ("июн", 6),
           ("июл", 7), ("авг", 8), ("сен", 9), ("окт", 10), ("ноя", 11), ("дек", 12))
_MONTH = r"(янв\w*|фев\w*|мар\w*|апр\w*|ма[йяе]|июн\w*|июл\w*|авг\w*|сен\w*|окт\w*|ноя\w*|дек\w*)"
_DASH = r"\s*(?:-|–|—|по|до)\s*"
_YEAR = r"(?:\s+(\d{4}))?"

# "с 3 по 7 августа", "с 28 июля по 3 августа", "3-7 августа 2026"
_WORD_RANGE = re.compile(rf"(\d{{1,2}})(?:\s+{_MONTH})?{_DASH}(\d{{1,2}})\s+{_MONTH}{_YEAR}")
# "03.08-07.08", "03.08.2026 по 07.08.2026"
_NUM_RANGE = re.compile(r"(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?" + _DASH + r"(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?")
# single dates: "с 3 августа", "03.08.2026"
_WORD_DATE = re.compile(rf"(\d{{1,2}})\s+{_MONTH}{_YEAR}")
_NUM_DATE = re.compile(r"(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?")
_DAYS = re.compile(r"(\d{1,3})\s*(?:календарн\w*\s+)?(?:дн\w*|день)\b")
_IN_MONTH = re.compile(rf"\bв\s+{_MONTH}\b")


@dataclass
class DateQuery:
    start: date | None = None
    end: date | None = None
    days: int | None = None
    month: int | None = None
    year_given: bool = False

    @property
    def empty(self) -> bool:
        return self.start is None and self.days is None and self.month is None


def _month(word: str | None) -> int | None:
    if not word:
        return None
    for prefix, number in _MONTHS:
        if word.startswith(prefix):
            return number
    return None


def _year(raw: str | None, today: date) -> int:
    if not raw:
        return today.year
    y = int(raw)
    return y + 2000 if y < 100 else y


def _date(day: str, month: int | None, year: int) -> date | None:
    try:
        return date(year, month, int(day)) if month else None
    except ValueError:
        return None


def parse(question: str, today: date | None = None) -> DateQuery:
    today = today or date.today()
    text = normalize(question)
    q = DateQuery()

    if m := _WORD_RANGE.search(text):
        end_month = _month(m.group(4))
        year = _year(m.group(5), today)
        q.start = _date(m.group(1), _month(m.group(2)) or end_month, year)
        q.end = _date(m.group(3), end_month, year)
        q.year_given = bool(m.group(5))
        text = text.replace(m.group(0), " ")
    elif m := _NUM_RANGE.search(text):
        q.start = _date(m.group(1), int(m.group(2)), _year(m.group(3) or m.group(6), today))
        q.end = _date(m.group(4), int(m.group(5)), _year(m.group(6) or m.group(3), today))
        q.year_given = bool(m.group(3) or m.group(6))
        text = text.replace(m.group(0), " ")
    elif m := _WORD_DATE.search(text):
        q.start = _date(m.group(1), _month(m.group(2)), _year(m.group(3), today))
        q.year_given = bool(m.group(3))
        text = text.replace(m.group(0), " ")
    elif m := _NUM_DATE.search(text):
        q.start = _date(m.group(1), int(m.group(2)), _year(m.group(3), today))
        q.year_given = bool(m.group(3))
        text = text.replace(m.group(0), " ")

    if q.start and q.end and q.end < q.start:
        # "с 28 декабря по 3 января" spans the new year; anything else is unreadable
        crosses = not q.year_given and q.start.month > q.end.month
        q.start, q.end = (q.start.replace(year=q.start.year - 1), q.end) if crosses else (None, None)
    if q.start is None:
        q.end = None
        if m := _IN_MONTH.search(text):
            q.month = _month(m.group(1))

    if m := _DAYS.search(text):
        n = int(m.group(1))
        q.days = n if 0 < n <= 366 else None
    return q
