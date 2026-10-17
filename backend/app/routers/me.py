from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import CourseAssignment, LeaveRequest, Notification, RequestStatus, Role, User
from app.permissions import get_current_user
from app.schemas import DashboardOut, NotificationList, NotificationOut, ProfileOut, ProfileUpdate
from app.services.academy import assignment_out
from app.services.views import profile_out, request_out

router = APIRouter(prefix="/me", tags=["me"])


@router.get("", response_model=ProfileOut)
def get_me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return profile_out(db, user)


@router.patch("", response_model=ProfileOut)
def update_me(body: ProfileUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Only personal fields. Official HR data (name, position, manager, ...) comes
    from 1C:ZUP and is rejected by the schema (extra fields -> 422)."""
    data = body.model_dump(exclude_unset=True)
    if "personal_phone" in data:
        user.profile.personal_phone = (data["personal_phone"] or "").strip() or None
    if data.get("locale"):
        user.locale = data["locale"]
    db.commit()
    db.refresh(user)
    return profile_out(db, user)


def notification_list(db: Session, user: User, limit: int = 50, unread_only: bool = False) -> NotificationList:
    q = db.query(Notification).filter(Notification.user_id == user.id)
    unread = q.filter(Notification.is_read.is_(False)).count()
    if unread_only:
        q = q.filter(Notification.is_read.is_(False))
    items = q.order_by(Notification.created_at.desc(), Notification.id.desc()).limit(limit).all()
    return NotificationList(items=[NotificationOut.model_validate(n) for n in items], unread_count=unread)


def _team_pending_count(db: Session, user: User) -> int | None:
    q = db.query(LeaveRequest).join(User, LeaveRequest.employee_id == User.id).filter(
        LeaveRequest.status == RequestStatus.PENDING, LeaveRequest.employee_id != user.id,
    )
    if user.role == Role.MANAGER:
        return q.filter(User.manager_id == user.id).count()
    if user.role == Role.HR:
        return q.count()
    return None


def _hr_stats(db: Session) -> dict:
    today = date.today()
    return {
        "employees": db.query(User).filter(User.is_active.is_(True)).count(),
        "pending_requests": db.query(LeaveRequest).filter(LeaveRequest.status == RequestStatus.PENDING).count(),
        "on_leave_today": db.query(LeaveRequest).filter(
            LeaveRequest.status == RequestStatus.APPROVED,
            LeaveRequest.start_date <= today, LeaveRequest.end_date >= today,
        ).count(),
    }


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    recent = (
        db.query(LeaveRequest).filter(LeaveRequest.employee_id == user.id)
        .order_by(LeaveRequest.created_at.desc(), LeaveRequest.id.desc()).limit(5).all()
    )
    return DashboardOut(
        profile=profile_out(db, user),
        recent_requests=[request_out(r) for r in recent],
        notifications=notification_list(db, user, limit=5),
        learning=[assignment_out(a).model_dump(mode="json") for a in
                  db.query(CourseAssignment).filter_by(user_id=user.id).order_by(CourseAssignment.assigned_at.desc())],
        team_pending_count=_team_pending_count(db, user),
        hr_stats=_hr_stats(db) if user.role == Role.HR else None,
    )
