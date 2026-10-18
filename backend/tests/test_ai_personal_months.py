"""AI Jana personal answers: a leave that crosses the new year is found by either month."""
from datetime import date, timedelta
from types import SimpleNamespace

import pytest

from app.ai.personal import _covers_month
from tests.conftest import EMPLOYEE2
from tests.test_ai_eval import ask


def leave(start: date, end: date):
    return SimpleNamespace(start_date=start, end_date=end)


@pytest.mark.parametrize("month,year,expected", [
    (12, 2026, True), (1, 2027, True), (12, None, True), (1, None, True),
    (1, 2026, False), (11, None, False), (2, None, False),
])
def test_covers_month_across_new_year(month, year, expected):
    assert _covers_month(leave(date(2026, 12, 28), date(2027, 1, 3)), month, year) is expected


def test_covers_month_long_leave_spans_middle_month():
    assert _covers_month(leave(date(2026, 1, 25), date(2026, 3, 5)), 2)


def _next_new_year_leave() -> tuple[date, date]:
    today = date.today()
    start = date(today.year, 12, 28)
    if start <= today:
        start = date(today.year + 1, 12, 28)
    return start, start + timedelta(days=6)


@pytest.mark.parametrize("month_word", ["декабре", "январе"])
def test_new_year_leave_is_found_by_both_months(client, auth, month_word):
    start, end = _next_new_year_leave()
    r = client.post("/requests", json={"start_date": start.isoformat(), "end_date": end.isoformat()},
                    headers=auth(EMPLOYEE2))
    assert r.status_code == 201, r.text

    a = ask(client, auth, f"Что с моей заявкой в {month_word}?", email=EMPLOYEE2)
    assert a["mode"] == "personal"
    assert "нет" not in a["answer"].split(".")[0]  # not "Заявки с такими датами у вас нет"
    assert [i["link"] for i in a["items"]] == [f"/requests/{r.json()['id']}"]
    assert end.strftime("%d.%m.%Y") in a["answer"]
