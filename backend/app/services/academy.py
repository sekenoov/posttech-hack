"""Jana Academy: assignments, lesson progress and server-side quiz scoring."""
import json
from datetime import date

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import Course, CourseAssignment, User, utcnow
from app.services.notifications import NotificationType, notify
from app.services.views import person_ref
from app.schemas import (
    AdminAssignmentOut, AssignmentOut, CourseDetailOut, CourseSummaryOut, LessonOut, QuestionOut,
)


def completed_ids(a: CourseAssignment | None) -> set[int]:
    if a is None:
        return set()
    try:
        return set(json.loads(a.completed_lessons or "[]"))
    except (TypeError, ValueError):
        return set()


def assignment_out(a: CourseAssignment) -> AssignmentOut:
    total = len(a.course.lessons)
    done = len(completed_ids(a) & {l.id for l in a.course.lessons})
    # lessons are 80% of progress, the passed quiz the last 20%
    pct = 100 if a.status == "completed" else int(80 * done / total) if total else 0
    return AssignmentOut(
        id=a.id, course_id=a.course_id, course_title=a.course.title, status=a.status,
        progress_pct=pct, lessons_done=done, lessons_total=total, score=a.score, attempts=a.attempts,
        due_date=a.due_date, assigned_at=a.assigned_at, assigned_by=person_ref(a.assigned_by),
        completed_at=a.completed_at,
    )


def admin_assignment_out(a: CourseAssignment) -> AdminAssignmentOut:
    return AdminAssignmentOut(
        **assignment_out(a).model_dump(),
        employee=person_ref(a.user),
        department=a.user.department.name if a.user.department else None,
    )


def get_assignment(db: Session, user: User, course_id: int) -> CourseAssignment | None:
    return db.query(CourseAssignment).filter_by(course_id=course_id, user_id=user.id).first()


def course_summary(c: Course, a: CourseAssignment | None) -> CourseSummaryOut:
    return CourseSummaryOut(
        id=c.id, slug=c.slug, title=c.title, description=c.description, duration_min=c.duration_min,
        pass_score=c.pass_score, lessons_total=len(c.lessons), questions_total=len(c.questions),
        assignment=assignment_out(a) if a else None,
    )


def course_detail(c: Course, a: CourseAssignment | None) -> CourseDetailOut:
    done = completed_ids(a)
    return CourseDetailOut(
        **course_summary(c, a).model_dump(),
        lessons=[LessonOut(id=l.id, position=l.position, title=l.title, body_md=l.body_md, completed=l.id in done)
                 for l in c.lessons],
        questions=[QuestionOut(id=q.id, position=q.position, text=q.text, options=json.loads(q.options))
                   for q in c.questions],
    )


def _require_assignment(db: Session, user: User, course: Course) -> CourseAssignment:
    a = get_assignment(db, user, course.id)
    if a is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Курс вам не назначен. Запишитесь на курс в каталоге.")
    return a


def enroll(db: Session, user: User, course: Course) -> CourseAssignment:
    a = get_assignment(db, user, course.id)
    if a:
        return a
    a = CourseAssignment(course_id=course.id, user_id=user.id, assigned_by_id=user.id)
    db.add(a)
    db.commit()
    db.refresh(a)
    return a


def complete_lesson(db: Session, user: User, course: Course, lesson_id: int) -> CourseAssignment:
    a = _require_assignment(db, user, course)
    if lesson_id not in {l.id for l in course.lessons}:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Урок не найден")
    done = completed_ids(a) | {lesson_id}
    a.completed_lessons = json.dumps(sorted(done))
    if a.status == "assigned":
        a.status = "in_progress"
    db.commit()
    db.refresh(a)
    return a


def submit_quiz(db: Session, user: User, course: Course, answers: list[int]):
    a = _require_assignment(db, user, course)
    lesson_ids = {l.id for l in course.lessons}
    if not lesson_ids <= completed_ids(a):
        raise HTTPException(status.HTTP_409_CONFLICT, "Сначала пройдите все уроки курса")
    questions = course.questions
    if len(answers) != len(questions):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Нужно ответить на все вопросы: {len(questions)}")

    results = [answer == q.correct_index for answer, q in zip(answers, questions)]
    correct = sum(results)
    score = round(100 * correct / len(questions)) if questions else 0
    passed = score >= course.pass_score
    a.attempts += 1
    a.score = max(a.score or 0, score)
    if a.status != "completed":
        a.status = "completed" if passed else "in_progress"
        if passed:
            a.completed_at = utcnow()
            notify(db, user.id, NotificationType.COURSE_COMPLETED, title="Курс завершён",
                   body=f"«{course.title}»: результат {score}%", link=f"/academy/{course.id}")
            if a.assigned_by_id and a.assigned_by_id != user.id:
                notify(db, a.assigned_by_id, NotificationType.COURSE_COMPLETED,
                       title="Сотрудник завершил курс",
                       body=f"{user.full_name}: «{course.title}», результат {score}%",
                       link="/admin/academy")
    db.commit()
    db.refresh(a)
    return score, passed, correct, len(questions), results, a


def assign(db: Session, actor: User, course: Course, user_ids: list[int], due_date: date | None):
    created, skipped = [], []
    for uid in dict.fromkeys(user_ids):  # dedupe, keep order
        target = db.get(User, uid)
        if target is None or not target.is_active or get_assignment(db, target, course.id):
            skipped.append(uid)
            continue
        db.add(CourseAssignment(course_id=course.id, user_id=uid, assigned_by_id=actor.id, due_date=due_date))
        due = f" Срок: до {due_date.strftime('%d.%m.%Y')}." if due_date else ""
        notify(db, uid, NotificationType.COURSE_ASSIGNED, title="Вам назначен курс",
               body=f"«{course.title}», {course.duration_min} мин.{due}", link=f"/academy/{course.id}")
        created.append(uid)
    db.commit()
    return created, skipped

