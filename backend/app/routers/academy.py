from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Course, CourseAssignment, Role, User
from app.permissions import get_current_user, not_found, require_roles
from app.schemas import (
    AdminAssignmentOut, AssignCourseIn, AssignCourseResult, AssignmentOut, CourseDetailOut,
    CourseSummaryOut, QuizResultOut, QuizSubmit,
)
from app.services import academy as svc

router = APIRouter(prefix="/academy", tags=["academy"])
admin_router = APIRouter(prefix="/admin/academy", tags=["admin"])


def _course(db: Session, course_id: int) -> Course:
    course = db.get(Course, course_id)
    if course is None:
        raise not_found("Курс")
    return course


@router.get("/courses", response_model=list[CourseSummaryOut])
def catalog(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [svc.course_summary(c, svc.get_assignment(db, user, c.id)) for c in db.query(Course).order_by(Course.id)]


@router.get("/my", response_model=list[AssignmentOut])
def my_assignments(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(CourseAssignment).filter_by(user_id=user.id).order_by(CourseAssignment.assigned_at.desc()).all()
    return [svc.assignment_out(a) for a in rows]


@router.get("/courses/{course_id}", response_model=CourseDetailOut)
def course(course_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = _course(db, course_id)
    return svc.course_detail(c, svc.get_assignment(db, user, c.id))


@router.post("/courses/{course_id}/enroll", response_model=CourseDetailOut)
def enroll(course_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = _course(db, course_id)
    return svc.course_detail(c, svc.enroll(db, user, c))


@router.post("/courses/{course_id}/lessons/{lesson_id}/complete", response_model=CourseDetailOut)
def complete_lesson(course_id: int, lesson_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = _course(db, course_id)
    return svc.course_detail(c, svc.complete_lesson(db, user, c, lesson_id))


@router.post("/courses/{course_id}/quiz", response_model=QuizResultOut)
def submit_quiz(course_id: int, body: QuizSubmit, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = _course(db, course_id)
    score, passed, correct, total, results, a = svc.submit_quiz(db, user, c, body.answers)
    return QuizResultOut(score=score, passed=passed, correct=correct, total=total, pass_score=c.pass_score,
                         results=results, assignment=svc.assignment_out(a))


# --- HR -----------------------------------------------------------------------

_hr = require_roles(Role.HR)


@admin_router.get("/assignments", response_model=list[AdminAssignmentOut])
def all_assignments(_: User = Depends(_hr), db: Session = Depends(get_db)):
    rows = db.query(CourseAssignment).order_by(CourseAssignment.assigned_at.desc()).all()
    return [svc.admin_assignment_out(a) for a in rows]


@admin_router.post("/assignments", response_model=AssignCourseResult, status_code=status.HTTP_201_CREATED)
def assign(body: AssignCourseIn, actor: User = Depends(_hr), db: Session = Depends(get_db)):
    created, skipped = svc.assign(db, actor, _course(db, body.course_id), body.user_ids, body.due_date)
    return AssignCourseResult(created=created, skipped=skipped)
