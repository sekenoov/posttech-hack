"""Demo data for JanaМен. All people and data are SYNTHETIC.

    python seed.py          # create schema; seed only if the database is empty
    python seed.py --reset  # DEMO ONLY: drop all tables and seed from scratch
"""
import json
import os
import sys
from pathlib import Path
from datetime import date, datetime, time, timedelta

from sqlalchemy.orm import Session

from app.auth import get_password_hash
from app.database import Base, SessionLocal, engine
from app.integrations import get_hr_provider, log_event
from app.integrations.mock_1c_zup import load_org
from app.ai.knowledge import ensure_seeded
from app.models import (
    Course, CourseAssignment, CourseLesson, Department, EmployeeProfile, LeaveBalance, LeaveRequest,
    LeaveRequestHistory, Notification, QuizQuestion, RequestStatus, User,
)
from app.services.notifications import NotificationType

DEMO_PASSWORD = os.getenv("DEMO_PASSWORD", "JanaDemo2026!")


def _at(d: date, hour: int = 10) -> datetime:
    return datetime.combine(d, time(hour, 0))


def seed_org(db: Session) -> dict[str, User]:
    """Departments and people, as a first sync from 1C:ZUP (mock) + JanaМен accounts."""
    org = load_org()
    departments = {}
    for d in org["departments"]:
        dept = Department(code=d["code"], name=d["name"], name_kk=d.get("name_kk"))
        db.add(dept)
        departments[d["code"]] = dept
    db.flush()

    accounts = {e["code"]: e for e in org["employees"]}
    password_hash = get_password_hash(DEMO_PASSWORD)  # one hash: same demo password for everyone
    provider = get_hr_provider()
    records = provider.list_employees()
    users: dict[str, User] = {}
    year = date.today().year
    for rec in records:
        acc = accounts[rec.employee_code]
        user = User(
            email=acc["email"], password_hash=password_hash, role=acc["role"],
            department_id=departments[rec.department_code].id,
        )
        user.profile = EmployeeProfile(
            employee_code=rec.employee_code, last_name=rec.last_name, first_name=rec.first_name,
            middle_name=rec.middle_name, company=org["company"], position=rec.position,
            hire_date=rec.hire_date, work_location=acc.get("location"), source="1c_zup_mock",
        )
        db.add(user)
        users[rec.employee_code] = user
    db.flush()
    for rec in records:
        if rec.manager_code:
            users[rec.employee_code].manager_id = users[rec.manager_code].id
        db.add(LeaveBalance(user_id=users[rec.employee_code].id, year=year,
                            total_days=rec.annual_leave_days, used_days=0))
    log_event(db, provider.system, "list_employees", "ok", payload={"employees": len(records), "source": "seed"})
    db.flush()
    return users


def _request(db: Session, employee: User, start: date, days: int, comment: str | None,
             created: date, status: str = RequestStatus.PENDING, decider: User | None = None,
             decided: date | None = None, decision_comment: str | None = None) -> LeaveRequest:
    r = LeaveRequest(
        employee_id=employee.id, start_date=start, end_date=start + timedelta(days=days - 1), days=days,
        comment=comment, status=RequestStatus.PENDING, created_at=_at(created, 9),
    )
    db.add(r)
    db.flush()
    db.add(LeaveRequestHistory(request_id=r.id, from_status=None, to_status=RequestStatus.PENDING,
                               actor_id=employee.id, created_at=_at(created, 9)))
    if status != RequestStatus.PENDING:
        r.status = status
        r.decided_by_id = decider.id
        r.decided_at = _at(decided, 15)
        r.decision_comment = decision_comment
        db.add(LeaveRequestHistory(request_id=r.id, from_status=RequestStatus.PENDING, to_status=status,
                                   actor_id=decider.id, comment=decision_comment, created_at=_at(decided, 15)))
        if status == RequestStatus.APPROVED:
            balance = db.query(LeaveBalance).filter_by(user_id=employee.id, year=date.today().year).first()
            if balance:
                balance.used_days += days
            r.docflow_ref = f"DL-{start.year}-{r.id:05d}"
    return r


def seed_requests(db: Session, u: dict[str, User], today: date) -> None:
    director, hr, nurlan, aidana, erlan, maria, kairat, dinara, timur, aliya = (
        u[c] for c in ("JP-0001", "JP-0002", "JP-0010", "JP-0011", "JP-0012", "JP-0013",
                       "JP-0014", "JP-0020", "JP-0021", "JP-0022")
    )
    T = today
    # Айдана (main demo employee): approved in the past, rejected, and one pending.
    past = _request(db, aidana, T - timedelta(days=75), 5, "Семейная поездка", T - timedelta(days=100),
                    RequestStatus.APPROVED, nurlan, T - timedelta(days=99))
    rejected = _request(db, aidana, T + timedelta(days=20), 3, "Личные дела", T - timedelta(days=6),
                        RequestStatus.REJECTED, nurlan, T - timedelta(days=5),
                        "Пиковая неделя отгрузок — давай перенесём на декабрь")
    _request(db, aidana, T + timedelta(days=40), 7, "Ежегодный отпуск", T - timedelta(days=1))
    # Rest of Нурлан's team
    _request(db, erlan, T + timedelta(days=14), 5, None, T - timedelta(days=2))
    _request(db, maria, T - timedelta(days=2), 7, "Отпуск по графику", T - timedelta(days=30),
             RequestStatus.APPROVED, nurlan, T - timedelta(days=29))
    _request(db, kairat, T + timedelta(days=60), 14, "Ежегодный отпуск", T - timedelta(days=12),
             RequestStatus.APPROVED, nurlan, T - timedelta(days=11))
    # Нурлан himself — decided by the operations director, never by himself.
    _request(db, nurlan, T + timedelta(days=50), 10, "Ежегодный отпуск", T - timedelta(days=3))
    # Динара's team: invisible to Нурлан.
    _request(db, timur, T + timedelta(days=25), 5, "Свадьба брата", T - timedelta(days=1))
    _request(db, aliya, T - timedelta(days=40), 5, None, T - timedelta(days=60),
             RequestStatus.APPROVED, dinara, T - timedelta(days=59))
    db.flush()

    db.add_all([
        Notification(user_id=aidana.id, type=NotificationType.REQUEST_APPROVED, is_read=True,
                     title="Заявка на отпуск согласована",
                     body=f"Согласовал(а): {nurlan.full_name}", link=f"/requests/{past.id}",
                     created_at=_at(T - timedelta(days=99), 15)),
        Notification(user_id=aidana.id, type=NotificationType.REQUEST_REJECTED, is_read=False,
                     title="Заявка на отпуск отклонена",
                     body="Комментарий: Пиковая неделя отгрузок — давай перенесём на декабрь",
                     link=f"/requests/{rejected.id}", created_at=_at(T - timedelta(days=5), 15)),
    ])
    for approver, emp, req_days in ((nurlan, aidana, 7), (nurlan, erlan, 5), (director, nurlan, 10), (dinara, timur, 5)):
        db.add(Notification(user_id=approver.id, type=NotificationType.REQUEST_SUBMITTED,
                            title="Новая заявка на отпуск", body=f"{emp.full_name}: {req_days} дн.",
                            link="/team", created_at=_at(T - timedelta(days=1), 9)))


def seed_courses(db: Session) -> dict[str, Course]:
    data = json.loads((Path(__file__).parent / "seed_data" / "courses.json").read_text(encoding="utf-8"))
    courses = {}
    for c in data["courses"]:
        course = Course(slug=c["slug"], title=c["title"], description=c["description"],
                        duration_min=c["duration_min"], pass_score=c["pass_score"])
        course.lessons = [CourseLesson(position=i + 1, title=l["title"], body_md=l["body_md"])
                          for i, l in enumerate(c["lessons"])]
        course.questions = [QuizQuestion(position=i + 1, text=q["text"], options=json.dumps(q["options"], ensure_ascii=False),
                                         correct_index=q["correct"]) for i, q in enumerate(c["questions"])]
        db.add(course)
        courses[c["slug"]] = course
    db.flush()
    return courses


def seed_assignments(db: Session, u: dict[str, User], courses: dict[str, Course], today: date) -> None:
    hr = u["JP-0002"]
    welcome, infosec = courses["welcome-to-jana-post"], courses["information-security-basics"]
    assigned = _at(today - timedelta(days=20), 11)

    def add(code, course, status, lessons=0, score=None, due_days=30):
        user = u[code]
        lesson_ids = [l.id for l in course.lessons[:lessons]]
        db.add(CourseAssignment(
            course_id=course.id, user_id=user.id, assigned_by_id=hr.id, assigned_at=assigned,
            due_date=today + timedelta(days=due_days), status=status, completed_lessons=json.dumps(lesson_ids),
            score=score, attempts=1 if score is not None else 0,
            completed_at=_at(today - timedelta(days=5), 16) if status == "completed" else None,
        ))
        db.add(Notification(user_id=user.id, type=NotificationType.COURSE_ASSIGNED, title="Вам назначен курс",
                            body=f"«{course.title}», {course.duration_min} мин.", link=f"/academy/{course.id}",
                            is_read=status != "assigned" or code != "JP-0011", created_at=assigned))

    # Айдана: welcome course started; infosec is assigned live by HR during the demo
    add("JP-0011", welcome, "in_progress", lessons=1)
    add("JP-0012", welcome, "completed", lessons=3, score=100)
    add("JP-0013", welcome, "assigned")
    add("JP-0021", welcome, "completed", lessons=3, score=80)
    add("JP-0014", infosec, "in_progress", lessons=2, due_days=10)
    add("JP-0022", infosec, "completed", lessons=3, score=100)


def seed(db: Session, today: date | None = None) -> None:
    today = today or date.today()
    users = seed_org(db)
    seed_requests(db, users, today)
    seed_assignments(db, users, seed_courses(db), today)
    db.commit()
    ensure_seeded(db)


def main() -> None:
    reset = "--reset" in sys.argv
    if reset:
        print("!! --reset: dropping all JanaМен tables (demo environment only)")
        Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(User).count() > 0:
            print("Database already seeded, skipping")
            return
        seed(db)
        print(f"Seeded {db.query(User).count()} synthetic users. Demo password: {DEMO_PASSWORD}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
