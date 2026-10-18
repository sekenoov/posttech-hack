"""Authentication dependencies and the single place where access rules live.

Every endpoint that touches another person's data must go through one of the
helpers below; the frontend only hides controls for convenience.
"""
from datetime import date

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.auth import decode_token
from app.database import get_db
from app.models import LeaveRequest, RequestStatus, Role, User

_bearer = HTTPBearer(auto_error=False)


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise _unauthorized("Требуется авторизация")
    payload = decode_token(credentials.credentials)
    if payload is None:
        raise _unauthorized("Сессия недействительна или истекла")
    try:
        user_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        raise _unauthorized("Сессия недействительна или истекла")
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise _unauthorized("Пользователь не найден или отключён")
    return user


def require_roles(*roles: str):
    def checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Недостаточно прав для этого раздела")
        return current_user
    return checker


def not_found(what: str = "Объект") -> HTTPException:
    # 404 rather than 403 for other people's objects: do not reveal they exist.
    return HTTPException(status.HTTP_404_NOT_FOUND, f"{what} не найден(а)")


# --- relationship rules -------------------------------------------------------

def is_direct_manager(actor: User, target: User) -> bool:
    return target.manager_id is not None and target.manager_id == actor.id


def can_view_employee(actor: User, target: User) -> bool:
    """Self, the direct manager, or HR."""
    return actor.id == target.id or actor.role == Role.HR or is_direct_manager(actor, target)


def can_view_request(actor: User, request: LeaveRequest) -> bool:
    return can_view_employee(actor, request.employee)


def can_revoke_approval(actor: User, request: LeaveRequest, today: date | None = None) -> bool:
    """Whoever may decide can take an approval back, but only before the leave starts."""
    return (request.status == RequestStatus.APPROVED and can_decide_request(actor, request)
            and request.start_date > (today or date.today()))


def can_decide_request(actor: User, request: LeaveRequest) -> bool:
    """The requester's direct manager, or HR as fallback approver. Never yourself."""
    if request.employee_id == actor.id:
        return False
    if actor.role == Role.HR:
        return True
    return actor.role == Role.MANAGER and is_direct_manager(actor, request.employee)


def get_visible_request(db: Session, actor: User, request_id: int) -> LeaveRequest:
    request = db.get(LeaveRequest, request_id)
    if request is None or not can_view_request(actor, request):
        raise not_found("Заявка")
    return request
