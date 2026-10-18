from datetime import date, datetime, timezone
from typing import Annotated, Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, PlainSerializer

# DB datetimes are naive UTC; emit them with an explicit offset so browsers
# do not shift them into local time twice.
UTCDateTime = Annotated[
    datetime,
    PlainSerializer(lambda d: (d if d.tzinfo else d.replace(tzinfo=timezone.utc)).isoformat(), return_type=str),
]


class StrictModel(BaseModel):
    """Request bodies reject unknown fields, so e.g. {"manager_id": 3} fails loudly."""

    model_config = ConfigDict(extra="forbid")


# --- auth ---------------------------------------------------------------------

class LoginRequest(StrictModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class Token(BaseModel):
    access_token: str
    token_type: str


# --- people -------------------------------------------------------------------

class DepartmentOut(BaseModel):
    id: int
    code: str
    name: str
    name_kk: Optional[str] = None


class PersonRef(BaseModel):
    id: int
    full_name: str
    position: Optional[str] = None


class LeaveBalanceOut(BaseModel):
    year: int
    total_days: int
    used_days: int
    pending_days: int
    remaining_days: int
    available_days: int  # remaining minus days already requested and pending


class ProfileOut(BaseModel):
    """Official HR record (read-only) plus the editable personal fields."""

    id: int
    email: str
    role: str
    locale: str
    employee_code: str
    full_name: str
    last_name: str
    first_name: str
    middle_name: Optional[str] = None
    company: str
    position: str
    department: Optional[DepartmentOut] = None
    manager: Optional[PersonRef] = None
    hire_date: date
    work_location: Optional[str] = None
    source: str
    synced_at: Optional[UTCDateTime] = None
    personal_phone: Optional[str] = None
    leave_balance: LeaveBalanceOut


class ProfileUpdate(StrictModel):
    personal_phone: Optional[str] = Field(default=None, max_length=32, pattern=r"^[0-9+()\-\s]*$")
    locale: Optional[Literal["ru", "kk"]] = None


class TeamMemberOut(BaseModel):
    """What a manager may see about a direct report: no contacts, no personal fields."""

    id: int
    full_name: str
    position: str
    department: Optional[str] = None
    hire_date: date
    on_leave_today: bool
    leave_balance: LeaveBalanceOut
    pending_requests: int


# --- requests -----------------------------------------------------------------

class LeaveRequestCreate(StrictModel):
    type: Literal["vacation"] = "vacation"
    start_date: date
    end_date: date
    comment: Optional[str] = Field(default=None, max_length=500)


class DecisionIn(StrictModel):
    decision: Literal["approve", "reject"]
    comment: Optional[str] = Field(default=None, max_length=500)


class HistoryEntryOut(BaseModel):
    id: int
    from_status: Optional[str] = None
    to_status: str
    actor: PersonRef
    comment: Optional[str] = None
    created_at: UTCDateTime


class LeaveRequestOut(BaseModel):
    id: int
    type: str
    start_date: date
    end_date: date
    days: int
    comment: Optional[str] = None
    status: str
    employee: PersonRef
    decided_by: Optional[PersonRef] = None
    decided_at: Optional[UTCDateTime] = None
    decision_comment: Optional[str] = None
    docflow_ref: Optional[str] = None
    created_at: UTCDateTime


class LeaveRequestDetailOut(LeaveRequestOut):
    history: list[HistoryEntryOut]
    can_decide: bool
    can_cancel: bool


# --- notifications ------------------------------------------------------------

class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    title: str
    body: Optional[str] = None
    link: Optional[str] = None
    is_read: bool
    created_at: UTCDateTime


class NotificationList(BaseModel):
    items: list[NotificationOut]
    unread_count: int


# --- dashboard ----------------------------------------------------------------

class DashboardOut(BaseModel):
    profile: ProfileOut
    recent_requests: list[LeaveRequestOut]
    notifications: NotificationList
    learning: list[dict] = []  # Jana Academy assignments (AssignmentOut)
    team_pending_count: Optional[int] = None  # manager / HR
    hr_stats: Optional[dict] = None


# --- admin --------------------------------------------------------------------

class EmployeeCreate(StrictModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: Literal["employee", "manager", "hr"]
    last_name: str = Field(min_length=1, max_length=80)
    first_name: str = Field(min_length=1, max_length=80)
    middle_name: Optional[str] = Field(default=None, max_length=80)
    position: str = Field(min_length=1, max_length=120)
    department_id: int
    manager_id: Optional[int] = None
    hire_date: date
    annual_leave_days: int = Field(default=24, ge=0, le=60)


class EmployeeAdminOut(BaseModel):
    id: int
    email: str
    role: str
    is_active: bool
    full_name: str
    position: str
    department: Optional[str] = None
    manager: Optional[PersonRef] = None
    hire_date: date


# --- Jana Academy -------------------------------------------------------------

class LessonOut(BaseModel):
    id: int
    position: int
    title: str
    body_md: str
    completed: bool


class QuestionOut(BaseModel):
    """Quiz question without the answer key."""

    id: int
    position: int
    text: str
    options: list[str]


class AssignmentOut(BaseModel):
    id: int
    course_id: int
    course_title: str
    status: str
    progress_pct: int
    lessons_done: int
    lessons_total: int
    score: Optional[int] = None
    attempts: int
    due_date: Optional[date] = None
    assigned_at: UTCDateTime
    assigned_by: Optional[PersonRef] = None
    completed_at: Optional[UTCDateTime] = None


class CourseSummaryOut(BaseModel):
    id: int
    slug: str
    title: str
    description: Optional[str] = None
    duration_min: int
    pass_score: int
    lessons_total: int
    questions_total: int
    assignment: Optional[AssignmentOut] = None


class CourseDetailOut(CourseSummaryOut):
    lessons: list[LessonOut]
    questions: list[QuestionOut]


class QuizSubmit(StrictModel):
    answers: list[int] = Field(min_length=1, max_length=50)


class QuizResultOut(BaseModel):
    score: int
    passed: bool
    correct: int
    total: int
    pass_score: int
    results: list[bool]
    assignment: AssignmentOut


class AssignCourseIn(StrictModel):
    course_id: int
    user_ids: list[int] = Field(min_length=1, max_length=200)
    due_date: Optional[date] = None


class AssignCourseResult(BaseModel):
    created: list[int]
    skipped: list[int]


class AdminAssignmentOut(AssignmentOut):
    employee: PersonRef
    department: Optional[str] = None


# --- AI Jana & knowledge base ------------------------------------------------

class AskIn(StrictModel):
    question: str = Field(min_length=2, max_length=1000)


class SourceOut(BaseModel):
    id: str
    title: str
    version: str
    section: str
    anchor: str
    snippet: str


class AnswerOut(BaseModel):
    answer: str
    mode: Literal["llm", "extractive", "personal", "refusal"]
    grounded: bool
    sources: list[SourceOut]
    reason: Optional[str] = None
    escalation_suggested: bool = False
    link: Optional[str] = None
    provider: Optional[str] = None
    provider_error: bool = False


class AIStatusOut(BaseModel):
    provider: str
    model: Optional[str] = None
    llm_enabled: bool
    documents: int


class EscalateIn(StrictModel):
    question: str = Field(min_length=2, max_length=1000)


class KnowledgeDocSummary(BaseModel):
    id: str
    title: str
    version: str
    effective_date: Optional[date] = None
    sections: list[str]
    updated_at: Optional[UTCDateTime] = None


class KnowledgeDocOut(KnowledgeDocSummary):
    body_md: str
    updated_by: Optional[PersonRef] = None


class KnowledgeDocUpdate(StrictModel):
    title: str = Field(min_length=3, max_length=200)
    body_md: str = Field(min_length=20, max_length=50000)
