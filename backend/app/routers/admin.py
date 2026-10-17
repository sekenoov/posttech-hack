"""HR administration. Every endpoint requires the hr role."""
import json
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth import get_password_hash
from app.database import get_db
from app.models import Department, EmployeeProfile, IntegrationEvent, LeaveBalance, Role, User
from app.permissions import require_roles
from app.schemas import DepartmentOut, EmployeeAdminOut, EmployeeCreate
from app.services.views import person_ref

router = APIRouter(prefix="/admin", tags=["admin"])

_hr = require_roles(Role.HR)


def _employee_out(u: User) -> EmployeeAdminOut:
    return EmployeeAdminOut(
        id=u.id,
        email=u.email,
        role=u.role,
        is_active=u.is_active,
        full_name=u.full_name,
        position=u.profile.position,
        department=u.department.name if u.department else None,
        manager=person_ref(u.manager),
        hire_date=u.profile.hire_date,
    )


@router.get("/departments", response_model=list[DepartmentOut])
def departments(_: User = Depends(_hr), db: Session = Depends(get_db)):
    return [DepartmentOut(id=d.id, code=d.code, name=d.name, name_kk=d.name_kk)
            for d in db.query(Department).order_by(Department.name).all()]


@router.get("/employees", response_model=list[EmployeeAdminOut])
def employees(_: User = Depends(_hr), db: Session = Depends(get_db)):
    return sorted((_employee_out(u) for u in db.query(User).all()), key=lambda e: e.full_name)


@router.post("/employees", response_model=EmployeeAdminOut, status_code=status.HTTP_201_CREATED)
def create_employee(body: EmployeeCreate, _: User = Depends(_hr), db: Session = Depends(get_db)):
    """Provision an account. In production the HR record arrives from 1C:ZUP;
    this form covers people not yet synced (e.g. on their first day)."""
    email = body.email.lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Пользователь с такой почтой уже существует")
    if db.get(Department, body.department_id) is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Подразделение не найдено")
    if body.manager_id is not None:
        manager = db.get(User, body.manager_id)
        if manager is None or manager.role not in (Role.MANAGER, Role.HR):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Руководитель не найден")

    user = User(
        email=email, password_hash=get_password_hash(body.password), role=body.role,
        department_id=body.department_id, manager_id=body.manager_id,
    )
    db.add(user)
    db.flush()
    user.profile = EmployeeProfile(
        employee_code=f"JP-M{user.id:04d}",
        last_name=body.last_name.strip(), first_name=body.first_name.strip(),
        middle_name=(body.middle_name or "").strip() or None,
        company="Jana Post", position=body.position.strip(), hire_date=body.hire_date,
        source="manual",
    )
    db.add(LeaveBalance(user_id=user.id, year=date.today().year,
                        total_days=body.annual_leave_days, used_days=0))
    db.commit()
    db.refresh(user)
    return _employee_out(user)


@router.get("/integrations")
def integrations(_: User = Depends(_hr), db: Session = Depends(get_db)):
    """Integration ports and their current adapters (mocks in the MVP)."""
    def last(system: str):
        e = db.query(IntegrationEvent).filter_by(system=system).order_by(IntegrationEvent.id.desc()).first()
        return e.created_at.isoformat() + "Z" if e else None

    return [
        {
            "system": "1c_zup", "name": "1С:ЗУП", "port": "HRMasterDataProvider", "adapter": "Mock1CZup",
            "mode": "mock", "direction": "1С:ЗУП → JanaМен (read-only)",
            "data": ["сотрудники и табельные номера", "должности и подразделения", "руководители",
                     "даты приёма", "остатки отпусков"],
            "last_event_at": last("1c_zup"),
        },
        {
            "system": "documentolog", "name": "Documentolog", "port": "DocumentFlowProvider",
            "adapter": "MockDocumentolog", "mode": "mock", "direction": "JanaМен → Documentolog",
            "data": ["приказ на отпуск после согласования", "статус подписания (webhook, план)"],
            "last_event_at": last("documentolog"),
        },
    ]


@router.get("/integration-events")
def integration_events(
    limit: int = Query(50, ge=1, le=200),
    _: User = Depends(_hr),
    db: Session = Depends(get_db),
):
    rows = db.query(IntegrationEvent).order_by(IntegrationEvent.id.desc()).limit(limit).all()
    return [
        {
            "id": e.id, "system": e.system, "operation": e.operation, "reference": e.reference,
            "status": e.status, "payload": json.loads(e.payload) if e.payload else None,
            "created_at": e.created_at.isoformat() + "Z" if e.created_at else None,
        }
        for e in rows
    ]
