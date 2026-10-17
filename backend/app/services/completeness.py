"""Component status per course and term, using the audit legend:
present ✓, missing ✗, review ? (classification uncertain or applicability unknown), na N/A."""
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import COMPONENTS, PRACTICAL, Course, Document


@dataclass
class ComponentState:
    component: str
    status: str  # present, missing, review, na
    documents: int = 0
    note: str = ""


@dataclass
class CourseCompleteness:
    course_id: int
    components: list[ComponentState] = field(default_factory=list)

    @property
    def applicable(self) -> int:
        return sum(1 for c in self.components if c.status != "na")

    @property
    def present(self) -> int:
        return sum(1 for c in self.components if c.status == "present")

    @property
    def percent(self) -> int:
        return round(100 * self.present / self.applicable) if self.applicable else 100

    @property
    def missing(self) -> list[str]:
        return [c.component for c in self.components if c.status == "missing"]


def visible_docs(viewer_id: int | None):
    """Real documents, plus a tester's own sandbox uploads when the tester is the viewer."""
    if viewer_id is None:
        return Document.sandbox.is_(False)
    return Document.sandbox.is_(False) | (Document.uploaded_by == viewer_id)


def course_completeness(db: Session, course: Course, term_id: int, viewer_id: int | None = None) -> CourseCompleteness:
    docs = db.scalars(select(Document).where(Document.course_id == course.id, Document.term_id == term_id,
                                             visible_docs(viewer_id))).all()
    return completeness_from_docs(course, docs)


def completeness_from_docs(course: Course, docs) -> CourseCompleteness:
    result = CourseCompleteness(course.id)
    pending_review = [d for d in docs if d.status in ("needs_review", "processing")]
    for comp in COMPONENTS:
        present = [d for d in docs if d.status == "classified" and d.component == comp]
        review = [d for d in pending_review if d.component == comp]
        if present:
            result.components.append(ComponentState(comp, "present", len(present)))
        elif review:
            result.components.append(ComponentState(comp, "review", len(review), "ملف قيد المعالجة أو المراجعة"))
        elif comp == PRACTICAL and course.practical == "no":
            result.components.append(ComponentState(comp, "na", 0, "لا يتضمن المقرر ساعات معمل"))
        elif comp == PRACTICAL and course.practical == "unknown":
            result.components.append(ComponentState(comp, "review", 0, "انطباق العملي غير محسوم — يحدده رئيس القسم"))
        else:
            result.components.append(ComponentState(comp, "missing"))
    return result


def all_course_completeness(db: Session, courses: list[Course], term_id: int,
                            viewer_id: int | None = None) -> dict[int, CourseCompleteness]:
    ids = [c.id for c in courses]
    docs = db.scalars(select(Document).where(Document.term_id == term_id, Document.course_id.in_(ids),
                                             visible_docs(viewer_id))).all() if ids else []
    by_course: dict[int, list[Document]] = {}
    for d in docs:
        by_course.setdefault(d.course_id, []).append(d)
    return {c.id: completeness_from_docs(c, by_course.get(c.id, [])) for c in courses}
