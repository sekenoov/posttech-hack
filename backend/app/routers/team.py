"""Manager (and HR) view of their people. Managers see direct reports only."""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import LeaveRequest, RequestStatus, Role, User
from app.permissions import get_visible_request, not_found, require_roles
from app.routers.requests import _detail
from app.schemas import DecisionIn, LeaveRequestDetailOut, LeaveRequestOut, RevokeIn, TeamMemberOut
from app.services import leave as leave_service
from app.services.views import balance_out, request_out

router = APIRouter(prefix="/team", tags=["team"])

_team_lead = require_roles(Role.MANAGER, Role.HR)


def _team_query(db: Session, actor: User):
    q = db.query(User).filter(User.is_active.is_(True), User.id != actor.id)
    if actor.role == Role.MANAGER:
        q = q.filter(User.manager_id == actor.id)
    return q


def _member_out(db: Session, u: User) -> TeamMemberOut:
    today = date.today()
    on_leave = db.query(LeaveRequest).filter(
        LeaveRequest.employee_id == u.id, LeaveRequest.status == RequestStatus.APPROVED,
        LeaveRequest.start_date <= today, LeaveRequest.end_date >= today,
    ).first() is not None
    pending = db.query(LeaveRequest).filter(
        LeaveRequest.employee_id == u.id, LeaveRequest.status == RequestStatus.PENDING,
    ).count()
    return TeamMemberOut(
        id=u.id,
        full_name=u.full_name,
        position=u.profile.position,
        department=u.department.name if u.department else None,
        hire_date=u.profile.hire_date,
        on_leave_today=on_leave,
        leave_balance=balance_out(db, u.id),
        pending_requests=pending,
    )


@router.get("/members", response_model=list[TeamMemberOut])
def members(actor: User = Depends(_team_lead), db: Session = Depends(get_db)):
    people = sorted(_team_query(db, actor).all(), key=lambda u: u.full_name)
    return [_member_out(db, u) for u in people]


@router.get("/members/{user_id}", response_model=TeamMemberOut)
def member(user_id: int, actor: User = Depends(_team_lead), db: Session = Depends(get_db)):
    u = _team_query(db, actor).filter(User.id == user_id).first()
    if u is None:
        raise not_found("Сотрудник")
    return _member_out(db, u)


@router.get("/requests", response_model=list[LeaveRequestOut])
def team_requests(
    status_filter: Optional[str] = Query(None, alias="status"),
    actor: User = Depends(_team_lead),
    db: Session = Depends(get_db),
):
    q = db.query(LeaveRequest).join(User, LeaveRequest.employee_id == User.id).filter(
        LeaveRequest.employee_id != actor.id,
    )
    if actor.role == Role.MANAGER:
        q = q.filter(User.manager_id == actor.id)
    if status_filter:
        q = q.filter(LeaveRequest.status == status_filter)
    rows = q.order_by(LeaveRequest.created_at.desc(), LeaveRequest.id.desc()).all()
    return [request_out(r) for r in rows]


@router.post("/requests/{request_id}/decision", response_model=LeaveRequestDetailOut)
def decide(
    request_id: int,
    body: DecisionIn,
    actor: User = Depends(_team_lead),
    db: Session = Depends(get_db),
):
    r = get_visible_request(db, actor, request_id)
    r = leave_service.decide(db, actor, r, body.decision, body.comment)
    return _detail(actor, r)


@router.post("/requests/{request_id}/revoke", response_model=LeaveRequestDetailOut)
def revoke(
    request_id: int,
    body: RevokeIn,
    actor: User = Depends(_team_lead),
    db: Session = Depends(get_db),
):
    """Take an approval back before the leave starts: the request is pending again."""
    r = get_visible_request(db, actor, request_id)
    r = leave_service.revoke_approval(db, actor, r, body.comment)
    return _detail(actor, r)
