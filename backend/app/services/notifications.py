from sqlalchemy.orm import Session

from app.models import Notification


class NotificationType:
    REQUEST_SUBMITTED = "request_submitted"   # to the approver
    REQUEST_APPROVED = "request_approved"
    REQUEST_REJECTED = "request_rejected"
    REQUEST_CANCELLED = "request_cancelled"   # to the approver
    REQUEST_REVOKED = "request_revoked"       # approval withdrawn, to the employee
    COURSE_ASSIGNED = "course_assigned"
    COURSE_COMPLETED = "course_completed"
    HR_ESCALATION = "hr_escalation"


def notify(db: Session, user_id: int, type: str, title: str, body: str | None = None, link: str | None = None) -> Notification:
    """Queue an in-app notification in the caller's transaction (caller commits)."""
    n = Notification(user_id=user_id, type=type, title=title, body=body, link=link)
    db.add(n)
    return n
