"""Decision center workflow: run the analysis for a course, raise questions, route them to the right person."""
import json
import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import SessionLocal
from ..models import (
    HEAD, SPEC, Assignment, Course, CourseAnalysis, Document, Question, QuestionMessage, User, now,
)
from . import activity, decisions_ai
from .extract import ExtractionError, detect_type, extract_text
from .storage import storage
from .tasks import submit

log = logging.getLogger("aq.decisions")

KIND_AR = {"required": "إجباري", "elective": "اختياري", "college_elective": "اختياري كلية"}
PRACTICAL_AR = {"yes": "له ساعات معمل", "no": "لا ساعات معمل", "unknown": "غير محسوم"}
OTHER_ORDER = {"assessment": 0, "practical": 1, "theory": 2}


def plan_facts(course: Course) -> str:
    """Study-plan facts in Arabic, so evidence quoted from them reads naturally in the decision center."""
    level = f"المستوى {course.level}" if course.level else "غير محدد"
    lines = [
        f"البرنامج: {course.program}",
        f"رمز المقرر في الخطة الدراسية: {course.code or 'لا يوجد (المقرر مدرج في الخطة بدون رمز)'}",
        f"اسم المقرر في الخطة الدراسية: {course.title}",
        f"مستوى المقرر: {level}" + (f" ({course.group_label})" if course.group_label else ""),
        f"نوع المقرر: {KIND_AR.get(course.kind, course.kind)}",
        f"الساعات المعتمدة في الخطة الدراسية: {course.credit_hours if course.credit_hours is not None else 'غير محددة'}",
        f"الجزء العملي: {PRACTICAL_AR.get(course.practical, course.practical)}",
        "قرار الكلية: أُلغي مقرر أساسيات التحول الرقمي وحلّ محله مقرر الذكاء الاصطناعي التطبيقي.",
    ]
    if course.spec_code and course.spec_code != course.code:
        lines.insert(2, f"رمز وُجد في ملفات توصيف سابقة: {course.spec_code}")
    return "\n".join(lines)


def head_for(db: Session, program: str) -> User | None:
    return next((u for u in db.scalars(select(User).where(User.role == HEAD, User.active.is_(True)))
                 if u.department and u.department.program_code == program), None)


def coordinator_for(db: Session, course_id: int, term_id: int) -> User | None:
    rows = db.scalars(select(Assignment).where(Assignment.course_id == course_id, Assignment.term_id == term_id,
                                               Assignment.sandbox.is_(False))).all()
    coord = next((a for a in rows if a.is_coordinator), rows[0] if rows else None)
    return coord.user if coord else None


def queue_analysis(db: Session, course: Course, term_id: int, user: User | None, sandbox: bool = False) -> CourseAnalysis | None:
    """Start an analysis unless one is already running for this course (and sandbox owner)."""
    if not decisions_ai.enabled():
        return None
    running = db.scalar(select(CourseAnalysis).where(
        CourseAnalysis.course_id == course.id, CourseAnalysis.term_id == term_id, CourseAnalysis.status == "running",
        CourseAnalysis.sandbox == sandbox))
    if running:
        return running
    run = CourseAnalysis(term_id=term_id, course_id=course.id, requested_by=user.id if user else None, sandbox=sandbox)
    db.add(run)
    db.commit()
    submit(run_analysis, run.id)
    return run


def run_analysis(run_id: int) -> None:
    db = SessionLocal()
    try:
        run = db.get(CourseAnalysis, run_id)
        if run:
            _run(db, run)
            db.commit()
    except Exception:
        log.exception("analysis %s failed", run_id)
        db.rollback()
        run = db.get(CourseAnalysis, run_id)
        if run:
            run.status, run.error, run.finished_at = "error", "خطأ داخلي أثناء التحليل", now()
            db.commit()
    finally:
        db.close()


def _visible(run: CourseAnalysis):
    if run.sandbox:
        return Document.uploaded_by == run.requested_by
    return Document.sandbox.is_(False)


def _text(doc: Document) -> str:
    data = storage.get(doc.storage_key)
    try:
        return extract_text(data, detect_type(data, doc.filename))
    except ExtractionError:
        return doc.text_excerpt or ""


def _run(db: Session, run: CourseAnalysis) -> None:
    course = db.get(Course, run.course_id)
    docs = db.scalars(select(Document).where(Document.course_id == course.id, Document.term_id == run.term_id,
                                             Document.status == "classified", _visible(run))
                      .order_by(Document.uploaded_at.desc())).all()
    spec_doc = next((d for d in docs if d.component == SPEC), None)
    if not spec_doc:
        run.status, run.finished_at = "done", now()
        run.summary = "لا يوجد توصيف مقرر مرفوع بعد؛ يبدأ التحليل بعد رفعه."
        return
    others = sorted((d for d in docs if d.component in OTHER_ORDER), key=lambda d: OTHER_ORDER[d.component])
    open_q = db.scalars(select(Question).where(Question.course_id == course.id, Question.term_id == run.term_id,
                                               Question.status == "pending", Question.sandbox == run.sandbox)).all()

    result, usage, error, sources = decisions_ai.analyse_course(
        plan_facts=plan_facts(course),
        spec=(spec_doc.id, spec_doc.filename, _text(spec_doc)),
        others=[(d.id, d.component, d.filename, _text(d)) for d in others[:decisions_ai.MAX_OTHER_DOCS]],
        open_titles=[q.title for q in open_q],
    )
    run.ai_input_tokens, run.ai_output_tokens, run.finished_at = usage.input_tokens, usage.output_tokens, now()
    if result is None:
        run.status, run.error = "error", error
        return

    requester = db.get(User, run.requested_by) if run.requested_by else None
    for issue in result.issues:
        if run.sandbox:
            assignee = requester
        elif issue.assignee == "head":
            assignee = head_for(db, course.program) or coordinator_for(db, course.id, run.term_id)
        else:
            assignee = coordinator_for(db, course.id, run.term_id) or head_for(db, course.program)
        q = Question(term_id=run.term_id, course_id=course.id, title=issue.title_ar, description=issue.description_ar,
                     priority=issue.priority, category=issue.category,
                     evidence_json=decisions_ai.evidence_json(issue, sources),
                     options_json=json.dumps(issue.options_ar, ensure_ascii=False),
                     assignee_id=assignee.id if assignee else None, sandbox=run.sandbox)
        db.add(q)
        db.flush()
        db.add(QuestionMessage(question_id=q.id, role="event",
                               content=f"رصد التحليل الذكي المسألة وأسندها إلى {assignee.name if assignee else 'غير محدد'}"))
    run.status, run.summary, run.questions_created = "done", result.summary_ar, len(result.issues)
    activity.log(db, "decision",
                 f"حلّل التحليل الذكي ملف مقرر {course.display_code} {course.title} ورصد {len(result.issues)} مسألة تحتاج قرارًا",
                 run.requested_by if run.sandbox else None, course.program, course.id, run.sandbox)


def question_context(db: Session, q: Question) -> str:
    """What the assistant may talk about: the issue, its options and the quoted documents."""
    course = q.course
    lines = [f"Course: {course.display_code} {course.title}", f"Issue: {q.title}", f"Description: {q.description}",
             "Options:"] + [f"- {o}" for o in json.loads(q.options_json)] + ["Evidence:"]
    for e in json.loads(q.evidence_json):
        lines.append(f'- [{e["source"]}] "{e["quote"]}"')
    lines.append(f"\nStudy plan facts:\n{plan_facts(course)}")
    seen = set()
    for e in json.loads(q.evidence_json):
        did = e.get("document_id")
        if did and did not in seen:
            seen.add(did)
            doc = db.get(Document, did)
            if doc:
                lines.append(f'\n<document name="{doc.filename}">\n{_text(doc)[:8000]}\n</document>')
    if q.status != "pending":
        lines.append(f"\nCurrent status: {q.status}. Decision recorded: {q.decision or '-'}")
    return "\n".join(lines)
