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
    # Self-registered users ("اسمي غير موجود") wait for the department head.
    pending_approval: Mapped[bool] = mapped_column(Boolean, default=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    pin_hash: Mapped[str | None] = mapped_column(String(200))
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

    actor: Mapped[User | None] = relationship()
