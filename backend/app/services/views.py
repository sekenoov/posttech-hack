"""Builders that turn ORM objects into API schemas. No access checks here."""
from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import LeaveBalance, LeaveRequest, RequestStatus, User
from app.schemas import (
    DepartmentOut, HistoryEntryOut, LeaveBalanceOut, LeaveRequestDetailOut, LeaveRequestOut,
    PersonRef, ProfileOut,
)


def person_ref(user: User | None) -> PersonRef | None:
    if user is None:
        return None
    return PersonRef(
        id=user.id,
        full_name=user.full_name,
        position=user.profile.position if user.profile else None,
    )


def get_or_create_balance(db: Session, user_id: int, year: int | None = None) -> LeaveBalance:
    """Current leave entitlement. One pool per employee in the MVP: per-year
    accounting and carry-over are mastered in 1C:ZUP and arrive via sync."""
    year = year or date.today().year
    balance = db.query(LeaveBalance).filter_by(user_id=user_id, year=year).first()
    if balance is None:
        balance = LeaveBalance(user_id=user_id, year=year, total_days=24, used_days=0)
        db.add(balance)
        db.flush()
    return balance


def pending_days(db: Session, user_id: int) -> int:
    total = (
        db.query(func.coalesce(func.sum(LeaveRequest.days), 0))
        .filter(LeaveRequest.employee_id == user_id, LeaveRequest.status == RequestStatus.PENDING)
        .scalar()
    )
    return int(total or 0)


def balance_out(db: Session, user_id: int) -> LeaveBalanceOut:
    balance = get_or_create_balance(db, user_id)
    pending = pending_days(db, user_id)
    return LeaveBalanceOut(
        year=balance.year,
        total_days=balance.total_days,
        used_days=balance.used_days,
        pending_days=pending,
        remaining_days=balance.remaining_days,
        available_days=max(0, balance.remaining_days - pending),
    )


def profile_out(db: Session, user: User) -> ProfileOut:
    p = user.profile
    dept = user.department
    return ProfileOut(
        id=user.id,
        email=user.email,
        role=user.role,
        locale=user.locale,
        employee_code=p.employee_code,
        full_name=p.full_name,
        last_name=p.last_name,
        first_name=p.first_name,
        middle_name=p.middle_name,
        company=p.company,
        position=p.position,
        department=DepartmentOut(id=dept.id, code=dept.code, name=dept.name, name_kk=dept.name_kk) if dept else None,
        manager=person_ref(user.manager),
        hire_date=p.hire_date,
        work_location=p.work_location,
        source=p.source,
        synced_at=p.synced_at,
        personal_phone=p.personal_phone,
        leave_balance=balance_out(db, user.id),
    )


def request_out(r: LeaveRequest) -> LeaveRequestOut:
    return LeaveRequestOut(
        id=r.id,
        type=r.type,
        start_date=r.start_date,
        end_date=r.end_date,
        days=r.days,
        comment=r.comment,
        status=r.status,
        employee=person_ref(r.employee),
        decided_by=person_ref(r.decided_by),
        decided_at=r.decided_at,
        decision_comment=r.decision_comment,
        docflow_ref=r.docflow_ref,
        created_at=r.created_at,
    )


def request_detail_out(r: LeaveRequest, can_decide: bool, can_cancel: bool) -> LeaveRequestDetailOut:
    return LeaveRequestDetailOut(
        **request_out(r).model_dump(),
        history=[
            HistoryEntryOut(
                id=h.id,
                from_status=h.from_status,
                to_status=h.to_status,
                actor=person_ref(h.actor),
                comment=h.comment,
                created_at=h.created_at,
            )
            for h in r.history
        ],
        can_decide=can_decide,
        can_cancel=can_cancel,
    )
