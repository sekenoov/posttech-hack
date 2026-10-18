from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import LeaveRequest, RequestStatus, User
from app.permissions import can_decide_request, can_revoke_approval, get_current_user, get_visible_request
from app.schemas import LeaveRequestCreate, LeaveRequestDetailOut, LeaveRequestOut
from app.services import leave as leave_service
from app.services.views import request_detail_out, request_out

router = APIRouter(prefix="/requests", tags=["requests"])


def _detail(actor: User, r: LeaveRequest) -> LeaveRequestDetailOut:
    return request_detail_out(
        r,
        can_decide=r.status == RequestStatus.PENDING and can_decide_request(actor, r),
        can_cancel=r.status == RequestStatus.PENDING and r.employee_id == actor.id,
        can_revoke=can_revoke_approval(actor, r),
    )


@router.get("", response_model=list[LeaveRequestOut])
def my_requests(
    status_filter: Optional[str] = Query(None, alias="status"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The caller's own requests only. Team requests live under /team/requests."""
    q = db.query(LeaveRequest).filter(LeaveRequest.employee_id == user.id)
    if status_filter:
        q = q.filter(LeaveRequest.status == status_filter)
    return [request_out(r) for r in q.order_by(LeaveRequest.created_at.desc(), LeaveRequest.id.desc()).all()]


@router.post("", response_model=LeaveRequestDetailOut, status_code=status.HTTP_201_CREATED)
def create_request(body: LeaveRequestCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = leave_service.create_request(db, user, body.start_date, body.end_date, body.comment)
    return _detail(user, r)


@router.get("/{request_id}", response_model=LeaveRequestDetailOut)
def get_request(request_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _detail(user, get_visible_request(db, user, request_id))


@router.post("/{request_id}/cancel", response_model=LeaveRequestDetailOut)
def cancel_request(request_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = leave_service.cancel(db, user, get_visible_request(db, user, request_id))
    return _detail(user, r)
