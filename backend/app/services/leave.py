"""Vacation request workflow: pending -> approved | rejected | cancelled.

All state transitions go through this module so that history, balance,
notifications and the Documentolog hand-off can never be skipped.
"""
from datetime import date, timedelta

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.integrations import get_docflow_provider, log_event
from app.models import LeaveRequest, LeaveRequestHistory, RequestStatus, User, utcnow
from app.permissions import can_decide_request
from app.services.notifications import NotificationType, notify
from app.services.views import get_or_create_balance, pending_days

MAX_REQUEST_DAYS = 60
MAX_DAYS_AHEAD = 365


def _error(code: int, detail: str) -> HTTPException:
    return HTTPException(status_code=code, detail=detail)


def _fmt(d: date) -> str:
    return d.strftime("%d.%m.%Y")


def _approver_id(employee: User, db: Session) -> int | None:
    """Direct manager; employees without one are routed to HR (first active HR)."""
    if employee.manager_id:
        return employee.manager_id
    hr = db.query(User).filter(User.role == "hr", User.is_active.is_(True), User.id != employee.id).first()
    return hr.id if hr else None


def _log(db: Session, request: LeaveRequest, from_status: str | None, to_status: str,
         actor: User, comment: str | None = None) -> None:
    db.add(LeaveRequestHistory(
        request=request, from_status=from_status, to_status=to_status,
        actor_id=actor.id, comment=comment,
    ))


def create_request(db: Session, employee: User, start_date: date, end_date: date,
                   comment: str | None, today: date | None = None) -> LeaveRequest:
    today = today or date.today()
    if end_date < start_date:
        raise _error(422, "Дата окончания раньше даты начала")
    if start_date < today:
        raise _error(422, "Нельзя подать заявку на прошедшие даты")
    if start_date > today + timedelta(days=MAX_DAYS_AHEAD):
        raise _error(422, "Заявку можно подать не более чем на год вперёд")
    days = (end_date - start_date).days + 1  # calendar days
    if days > MAX_REQUEST_DAYS:
        raise _error(422, f"Один отпуск не может быть длиннее {MAX_REQUEST_DAYS} дней")

    overlap = db.query(LeaveRequest).filter(
        LeaveRequest.employee_id == employee.id,
        LeaveRequest.status.in_([RequestStatus.PENDING, RequestStatus.APPROVED]),
        LeaveRequest.start_date <= end_date,
        LeaveRequest.end_date >= start_date,
    ).first()
    if overlap:
        raise _error(409, f"Даты пересекаются с заявкой №{overlap.id} ({_fmt(overlap.start_date)}–{_fmt(overlap.end_date)})")

    balance = get_or_create_balance(db, employee.id)
    available = balance.remaining_days - pending_days(db, employee.id)
    if days > available:
        raise _error(422, f"Недостаточно дней отпуска: запрошено {days}, доступно {max(available, 0)}")

    request = LeaveRequest(
        employee_id=employee.id, start_date=start_date, end_date=end_date, days=days,
        comment=(comment or "").strip() or None, status=RequestStatus.PENDING,
    )
    db.add(request)
    _log(db, request, None, RequestStatus.PENDING, employee)
    db.flush()

    approver_id = _approver_id(employee, db)
    if approver_id:
        notify(
            db, approver_id, NotificationType.REQUEST_SUBMITTED,
            title="Новая заявка на отпуск",
            body=f"{employee.full_name}: {_fmt(start_date)}–{_fmt(end_date)}, {days} дн.",
            link=f"/requests/{request.id}",
        )
    db.commit()
    db.refresh(request)
    return request


def decide(db: Session, actor: User, request: LeaveRequest, decision: str, comment: str | None) -> LeaveRequest:
    if not can_decide_request(actor, request):
        if request.employee_id == actor.id:
            raise _error(403, "Нельзя согласовать собственную заявку")
        raise _error(403, "Согласовать заявку может только непосредственный руководитель сотрудника")
    if request.status != RequestStatus.PENDING:
        raise _error(409, "Заявка уже рассмотрена — повторное решение невозможно")

    comment = (comment or "").strip() or None
    new_status = RequestStatus.APPROVED if decision == "approve" else RequestStatus.REJECTED
    previous = request.status
    request.status = new_status
    request.decided_by_id = actor.id
    request.decided_at = utcnow()
    request.decision_comment = comment
    _log(db, request, previous, new_status, actor, comment)

    period = f"{_fmt(request.start_date)}–{_fmt(request.end_date)}"
    if new_status == RequestStatus.APPROVED:
        balance = get_or_create_balance(db, request.employee_id)
        balance.used_days += request.days
        _send_to_docflow(db, request)
        notify(db, request.employee_id, NotificationType.REQUEST_APPROVED,
               title="Заявка на отпуск согласована",
               body=f"{period}, {request.days} дн. Согласовал(а): {actor.full_name}",
               link=f"/requests/{request.id}")
    else:
        notify(db, request.employee_id, NotificationType.REQUEST_REJECTED,
               title="Заявка на отпуск отклонена",
               body=f"{period}. " + (f"Комментарий: {comment}" if comment else "Комментарий не указан"),
               link=f"/requests/{request.id}")
    db.commit()
    db.refresh(request)
    return request


def cancel(db: Session, actor: User, request: LeaveRequest) -> LeaveRequest:
    if request.employee_id != actor.id:
        raise _error(403, "Отозвать можно только собственную заявку")
    if request.status != RequestStatus.PENDING:
        raise _error(409, "Отозвать можно только заявку на рассмотрении")
    request.status = RequestStatus.CANCELLED
    _log(db, request, RequestStatus.PENDING, RequestStatus.CANCELLED, actor)
    approver_id = _approver_id(actor, db)
    if approver_id:
        notify(db, approver_id, NotificationType.REQUEST_CANCELLED,
               title="Заявка на отпуск отозвана",
               body=f"{actor.full_name}: {_fmt(request.start_date)}–{_fmt(request.end_date)}",
               link=f"/requests/{request.id}")
    db.commit()
    db.refresh(request)
    return request


def _send_to_docflow(db: Session, request: LeaveRequest) -> None:
    provider = get_docflow_provider()
    payload = {
        "request_id": request.id,
        "employee_code": request.employee.profile.employee_code,
        "start_date": request.start_date, "end_date": request.end_date, "days": request.days,
    }
    try:
        result = provider.submit_leave_order(
            request_id=request.id,
            employee_code=request.employee.profile.employee_code,
            full_name=request.employee.full_name,
            start_date=request.start_date, end_date=request.end_date, days=request.days,
        )
        request.docflow_ref = result.document_id
        log_event(db, provider.system, "submit_leave_order", "ok", result.document_id, payload)
    except Exception as exc:  # docflow outage must not block the approval itself
        log_event(db, provider.system, "submit_leave_order", "error", None, {**payload, "error": str(exc)})
