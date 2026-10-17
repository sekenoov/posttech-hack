from datetime import datetime, timezone

from sqlalchemy import (
    Boolean, Column, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.database import Base


def utcnow() -> datetime:
    # Stored naive (SQLite has no tz); serialized as UTC by app.schemas.
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Role:
    EMPLOYEE = "employee"
    MANAGER = "manager"
    HR = "hr"
    ALL = (EMPLOYEE, MANAGER, HR)


class RequestStatus:
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"
    FINAL = (APPROVED, REJECTED, CANCELLED)


class RequestType:
    VACATION = "vacation"
    ALL = (VACATION,)  # "advance" is the next request type on the roadmap


class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True)
    code = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    name_kk = Column(String, nullable=True)


class User(Base):
    """Account and org-chart position. Credentials live here, HR data in EmployeeProfile."""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    locale = Column(String, nullable=False, default="ru")
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    manager_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=utcnow)

    department = relationship("Department")
    manager = relationship("User", remote_side=[id], backref="direct_reports")
    profile = relationship("EmployeeProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")

    @property
    def full_name(self) -> str:
        return self.profile.full_name if self.profile else self.email


class EmployeeProfile(Base):
    """Official HR record. Read-only for the employee; mastered in 1C:ZUP (mocked)."""

    __tablename__ = "employee_profiles"

    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    employee_code = Column(String, unique=True, nullable=False)
    last_name = Column(String, nullable=False)
    first_name = Column(String, nullable=False)
    middle_name = Column(String, nullable=True)
    company = Column(String, nullable=False)
    position = Column(String, nullable=False)
    hire_date = Column(Date, nullable=False)
    work_location = Column(String, nullable=True)
    source = Column(String, nullable=False, default="1c_zup_mock")
    synced_at = Column(DateTime, default=utcnow)
    # The only fields an employee may edit about themselves.
    personal_phone = Column(String, nullable=True)

    user = relationship("User", back_populates="profile")

    @property
    def full_name(self) -> str:
        return " ".join(p for p in (self.last_name, self.first_name, self.middle_name) if p)


class LeaveBalance(Base):
    __tablename__ = "leave_balances"
    __table_args__ = (UniqueConstraint("user_id", "year"),)

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    year = Column(Integer, nullable=False)
    total_days = Column(Integer, nullable=False, default=24)
    used_days = Column(Integer, nullable=False, default=0)

    @property
    def remaining_days(self) -> int:
        return self.total_days - self.used_days


class LeaveRequest(Base):
    __tablename__ = "leave_requests"

    id = Column(Integer, primary_key=True)
    employee_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    type = Column(String, nullable=False, default=RequestType.VACATION)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    days = Column(Integer, nullable=False)
    comment = Column(Text, nullable=True)
    status = Column(String, nullable=False, default=RequestStatus.PENDING, index=True)
    decided_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    decided_at = Column(DateTime, nullable=True)
    decision_comment = Column(Text, nullable=True)
    docflow_ref = Column(String, nullable=True)  # Documentolog document id (mock)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    employee = relationship("User", foreign_keys=[employee_id])
    decided_by = relationship("User", foreign_keys=[decided_by_id])
    history = relationship(
        "LeaveRequestHistory", back_populates="request",
        order_by="LeaveRequestHistory.id", cascade="all, delete-orphan",
    )


class LeaveRequestHistory(Base):
    __tablename__ = "leave_request_history"

    id = Column(Integer, primary_key=True)
    request_id = Column(Integer, ForeignKey("leave_requests.id"), nullable=False, index=True)
    from_status = Column(String, nullable=True)
    to_status = Column(String, nullable=False)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow)

    request = relationship("LeaveRequest", back_populates="history")
    actor = relationship("User")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    type = Column(String, nullable=False)
    title = Column(String, nullable=False)
    body = Column(Text, nullable=True)
    link = Column(String, nullable=True)
    is_read = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=utcnow)


class IntegrationEvent(Base):
    """Audit log of calls to external systems (1C:ZUP, Documentolog). Mocked in the MVP."""

    __tablename__ = "integration_events"

    id = Column(Integer, primary_key=True)
    system = Column(String, nullable=False)     # 1c_zup, documentolog
    operation = Column(String, nullable=False)
    reference = Column(String, nullable=True)
    payload = Column(Text, nullable=True)       # JSON
    status = Column(String, nullable=False)     # ok, error
    created_at = Column(DateTime, default=utcnow)


class Course(Base):
    __tablename__ = "courses"

    id = Column(Integer, primary_key=True)
    slug = Column(String, unique=True, nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    duration_min = Column(Integer, nullable=False, default=15)
    pass_score = Column(Integer, nullable=False, default=80)  # percent

    lessons = relationship("CourseLesson", order_by="CourseLesson.position", cascade="all, delete-orphan")
    questions = relationship("QuizQuestion", order_by="QuizQuestion.position", cascade="all, delete-orphan")


class CourseLesson(Base):
    __tablename__ = "course_lessons"

    id = Column(Integer, primary_key=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False)
    position = Column(Integer, nullable=False)
    title = Column(String, nullable=False)
    body_md = Column(Text, nullable=False)


class QuizQuestion(Base):
    __tablename__ = "quiz_questions"

    id = Column(Integer, primary_key=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False)
    position = Column(Integer, nullable=False)
    text = Column(Text, nullable=False)
    options = Column(Text, nullable=False)  # JSON list of strings
    correct_index = Column(Integer, nullable=False)  # never sent to the client


class CourseAssignment(Base):
    """Assignment of a course to an employee, including their progress and result."""

    __tablename__ = "course_assignments"
    __table_args__ = (UniqueConstraint("course_id", "user_id"),)

    id = Column(Integer, primary_key=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    assigned_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    assigned_at = Column(DateTime, default=utcnow)
    due_date = Column(Date, nullable=True)
    status = Column(String, nullable=False, default="assigned")  # assigned, in_progress, completed
    completed_lessons = Column(Text, nullable=False, default="[]")  # JSON list of lesson ids
    score = Column(Integer, nullable=True)  # best quiz score, percent
    attempts = Column(Integer, nullable=False, default=0)
    completed_at = Column(DateTime, nullable=True)

    course = relationship("Course")
    user = relationship("User", foreign_keys=[user_id])
    assigned_by = relationship("User", foreign_keys=[assigned_by_id])


class KnowledgeDocument(Base):
    """AI Jana knowledge base document. Seeded from knowledge_base/*.md, editable by HR."""

    __tablename__ = "knowledge_documents"

    id = Column(String, primary_key=True)            # e.g. KB-LEAVE-001
    title = Column(String, nullable=False)
    version = Column(String, nullable=False)         # "1.0", bumped on every HR edit
    effective_date = Column(Date, nullable=True)
    body_md = Column(Text, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    updated_by = relationship("User")
