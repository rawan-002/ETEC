from datetime import datetime, timezone

from sqlalchemy import (
    Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def now() -> datetime:
    return datetime.now(timezone.utc)


def aware(dt: datetime) -> datetime:
    """SQLite returns naive datetimes; treat them as UTC."""
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


# Roles
DEAN, HEAD, FACULTY, TEAM = "dean", "head", "faculty", "team"
ROLES = (DEAN, HEAD, FACULTY, TEAM)

# Document components
SPEC, THEORY, PRACTICAL, ASSESSMENT, OTHER = "spec", "theory", "practical", "assessment", "other"
COMPONENTS = (SPEC, THEORY, PRACTICAL, ASSESSMENT)


class Department(Base):
    __tablename__ = "departments"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    program_code: Mapped[str | None] = mapped_column(String(10))  # CS, IS, IT, SE


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    email: Mapped[str | None] = mapped_column(String(200))
    email_confirmed: Mapped[bool] = mapped_column(Boolean, default=True)
    rank: Mapped[str | None] = mapped_column(String(60))
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"))
    role: Mapped[str] = mapped_column(String(20), default=FACULTY)
    in_pilot: Mapped[bool] = mapped_column(Boolean, default=False)
    # Project-team testers act as faculty, but everything they do is sandboxed: invisible to others
    # and never counted in completeness, distribution or reminders.
    is_tester: Mapped[bool] = mapped_column(Boolean, default=False)
    # Self-registered users ("اسمي غير موجود") wait for the department head.
    pending_approval: Mapped[bool] = mapped_column(Boolean, default=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    pin_hash: Mapped[str | None] = mapped_column(String(200))  # scrypt hash of the sign-in password
    failed_pin_attempts: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    department: Mapped[Department | None] = relationship()


class Course(Base):
    __tablename__ = "courses"
    id: Mapped[int] = mapped_column(primary_key=True)
    program: Mapped[str] = mapped_column(String(10))
    code: Mapped[str | None] = mapped_column(String(20))  # plan code; None when the plan gives none
    spec_code: Mapped[str | None] = mapped_column(String(20))  # code found in the specification
    title: Mapped[str] = mapped_column(String(200))
    level: Mapped[int | None] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String(30))  # required, elective, college_elective
    group_label: Mapped[str | None] = mapped_column(String(60))
    credit_hours: Mapped[int | None] = mapped_column(Integer)
    # yes / no / unknown — "no" makes the practical component N/A.
    practical: Mapped[str] = mapped_column(String(10), default="unknown")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    @property
    def display_code(self) -> str:
        return self.code or self.spec_code or "—"


class Term(Base):
    __tablename__ = "terms"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)  # e.g. 1447-1
    active: Mapped[bool] = mapped_column(Boolean, default=False)


class Assignment(Base):
    """A faculty member teaching a course in a term (chosen by the member, approved by the head)."""
    __tablename__ = "assignments"
    __table_args__ = (UniqueConstraint("term_id", "course_id", "user_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    term_id: Mapped[int] = mapped_column(ForeignKey("terms.id"))
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    is_coordinator: Mapped[bool] = mapped_column(Boolean, default=False)
    sandbox: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

    course: Mapped[Course] = relationship()
    user: Mapped[User] = relationship()


class SelectionSubmitted(Base):
    """A member has answered the course-selection screen for a term (possibly with no courses)."""
    __tablename__ = "selection_submitted"
    __table_args__ = (UniqueConstraint("term_id", "user_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    term_id: Mapped[int] = mapped_column(ForeignKey("terms.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class DistributionApproval(Base):
    __tablename__ = "distribution_approvals"
    __table_args__ = (UniqueConstraint("term_id", "program"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    term_id: Mapped[int] = mapped_column(ForeignKey("terms.id"))
    program: Mapped[str] = mapped_column(String(10))
    approved_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    approved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Document(Base):
    """One uploaded version. Files are never edited or deleted; a new upload is a new row."""
    __tablename__ = "documents"
    id: Mapped[int] = mapped_column(primary_key=True)
    term_id: Mapped[int] = mapped_column(ForeignKey("terms.id"))
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"))
    uploaded_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    filename: Mapped[str] = mapped_column(String(400))
    archive_path: Mapped[str | None] = mapped_column(String(600))  # path inside an uploaded archive
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    size: Mapped[int] = mapped_column(Integer)
    storage_key: Mapped[str] = mapped_column(String(300))
    detected_type: Mapped[str | None] = mapped_column(String(20))
    # processing -> classified | needs_review | error | duplicate
    status: Mapped[str] = mapped_column(String(20), default="processing")
    component: Mapped[str | None] = mapped_column(String(20))
    confidence: Mapped[float | None] = mapped_column(Float)
    classified_by: Mapped[str | None] = mapped_column(String(20))  # rules, ai, human
    reason: Mapped[str | None] = mapped_column(Text)
    text_excerpt: Mapped[str | None] = mapped_column(Text)
    error: Mapped[str | None] = mapped_column(Text)
    duplicate_of: Mapped[int | None] = mapped_column(ForeignKey("documents.id"))
    ai_input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    ai_output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    sandbox: Mapped[bool] = mapped_column(Boolean, default=False)

    course: Mapped[Course] = relationship()
    uploader: Mapped[User] = relationship()


class Finding(Base):
    """A document observation such as a code mismatch inside a specification."""
    __tablename__ = "findings"
    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id"))
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"))
    kind: Mapped[str] = mapped_column(String(40))
    message: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    kind: Mapped[str] = mapped_column(String(40))  # missing_reminder, head_summary
    subject: Mapped[str] = mapped_column(String(300))
    body: Mapped[str] = mapped_column(Text)
    to_email: Mapped[str | None] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20))  # sent, simulated, failed, skipped
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship()


class Setting(Base):
    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    value: Mapped[str] = mapped_column(String(300))


class ActivityEvent(Base):
    """Append-only activity log."""
    __tablename__ = "activity"
    id: Mapped[int] = mapped_column(primary_key=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    kind: Mapped[str] = mapped_column(String(40))  # login, upload, classify, review, assignment, approval, reminder, admin
    message: Mapped[str] = mapped_column(Text)
    program: Mapped[str | None] = mapped_column(String(10))
    course_id: Mapped[int | None] = mapped_column(ForeignKey("courses.id"))
    sandbox: Mapped[bool] = mapped_column(Boolean, default=False)

    actor: Mapped[User | None] = relationship()


# ---------- Decision center ----------

PRIORITIES = ("high", "medium", "low")


class Question(Base):
    """A document inconsistency that needs a human decision, raised by the analysis."""
    __tablename__ = "questions"
    id: Mapped[int] = mapped_column(primary_key=True)
    term_id: Mapped[int] = mapped_column(ForeignKey("terms.id"))
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"))
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text)
    priority: Mapped[str] = mapped_column(String(10), default="medium")
    category: Mapped[str] = mapped_column(String(40))
    evidence_json: Mapped[str] = mapped_column(Text, default="[]")  # [{"document_id", "source", "quote"}]
    options_json: Mapped[str] = mapped_column(Text, default="[]")  # ["option", ...]
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    # pending -> approved | deferred ; escalation keeps it pending with a new assignee
    status: Mapped[str] = mapped_column(String(20), default="pending")
    decision: Mapped[str | None] = mapped_column(Text)
    decided_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    escalations: Mapped[int] = mapped_column(Integer, default=0)
    sandbox: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    ai_input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    ai_output_tokens: Mapped[int] = mapped_column(Integer, default=0)

    course: Mapped[Course] = relationship()
    assignee: Mapped[User | None] = relationship(foreign_keys=[assignee_id])


class QuestionMessage(Base):
    """The question's history: assistant chat turns and decision events, in order."""
    __tablename__ = "question_messages"
    id: Mapped[int] = mapped_column(primary_key=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id"), index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    role: Mapped[str] = mapped_column(String(20))  # user, assistant, event
    content: Mapped[str] = mapped_column(Text)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    ai_input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    ai_output_tokens: Mapped[int] = mapped_column(Integer, default=0)

    user: Mapped[User | None] = relationship()


class CourseAnalysis(Base):
    """One run of the consistency analysis for a course (what was read, what it cost)."""
    __tablename__ = "course_analyses"
    id: Mapped[int] = mapped_column(primary_key=True)
    term_id: Mapped[int] = mapped_column(ForeignKey("terms.id"))
    course_id: Mapped[int] = mapped_column(ForeignKey("courses.id"))
    requested_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(20), default="running")  # running, done, error
    summary: Mapped[str | None] = mapped_column(Text)
    error: Mapped[str | None] = mapped_column(Text)
    questions_created: Mapped[int] = mapped_column(Integer, default=0)
    sandbox: Mapped[bool] = mapped_column(Boolean, default=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ai_input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    ai_output_tokens: Mapped[int] = mapped_column(Integer, default=0)
