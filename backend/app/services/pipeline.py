"""Upload -> type check -> archive expansion -> text extraction -> classification -> completeness."""
import hashlib

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import SessionLocal
from ..models import OTHER, SPEC, Course, Document, Finding, User
from . import activity
from .classify import classify
from .extract import ExtractionError, detect_type, expand_zip, extract_text
from .storage import make_key, storage
from .tasks import submit

COMPONENT_AR = {"spec": "توصيف المقرر", "theory": "المادة النظرية", "practical": "المادة العملية",
                "assessment": "التقييمات", "other": "غير مصنّف"}


def ingest(db: Session, *, data: bytes, filename: str, course: Course, term_id: int, user: User,
           component_hint: str | None = None) -> list[Document]:
    """Store the upload and queue processing. Archives become one document per inner file."""
    kind = detect_type(data, filename)
    docs: list[Document] = []
    if kind == "zip":
        expanded = expand_zip(data)
        for entry in expanded.entries:
            docs.append(_store(db, entry.data, entry.path.split("/")[-1], course, term_id, user, archive_path=f"{filename}/{entry.path}"))
        if expanded.skipped:
            activity.log(db, "upload", f"تُجاهلت {len(expanded.skipped)} ملفات مؤقتة أو تتجاوز الحد داخل {filename}",
                         user.id, course.program, course.id)
    else:
        docs.append(_store(db, data, filename, course, term_id, user))
    activity.log(db, "upload", f"رفع {len(docs)} ملف لمقرر {course.display_code} {course.title}",
                 user.id, course.program, course.id)
    db.commit()
    for d in docs:
        submit(process_document, d.id, component_hint)
    return docs


def _store(db: Session, data: bytes, filename: str, course: Course, term_id: int, user: User,
           archive_path: str | None = None) -> Document:
    sha = hashlib.sha256(data).hexdigest()
    key = make_key(sha)
    storage.put(key, data)
    doc = Document(term_id=term_id, course_id=course.id, uploaded_by=user.id, filename=filename,
                   archive_path=archive_path, sha256=sha, size=len(data), storage_key=key)
    db.add(doc)
    db.flush()
    return doc


def process_document(doc_id: int, component_hint: str | None = None) -> None:
    db = SessionLocal()
    try:
        doc = db.get(Document, doc_id)
        if doc is None:
            return
        _process(db, doc, component_hint)
        db.commit()
    finally:
        db.close()


def _process(db: Session, doc: Document, component_hint: str | None) -> None:
    data = storage.get(doc.storage_key)
    kind = detect_type(data, doc.filename)
    doc.detected_type = kind

    earlier = db.scalar(select(Document).where(
        Document.course_id == doc.course_id, Document.term_id == doc.term_id,
        Document.sha256 == doc.sha256, Document.id < doc.id, Document.status != "duplicate"))
    if earlier:
        doc.status, doc.duplicate_of = "duplicate", earlier.id
        doc.component = earlier.component
        doc.reason = f"نسخة مطابقة للملف «{earlier.filename}»"
        return

    if kind == "empty":
        doc.status, doc.error = "error", "الملف فارغ أو تالف (بايتات صفرية)"
        _log_problem(db, doc)
        return
    if kind == "rar":
        doc.status, doc.error = "needs_review", "أرشيف RAR: يحتاج فك ضغط من فريق المشروع"
        _log_problem(db, doc)
        return

    text = ""
    try:
        text = extract_text(data, kind)
    except ExtractionError as exc:
        doc.error = f"تعذّر استخراج النص: {exc}"
    doc.text_excerpt = text[:2000] if text else None

    path = doc.archive_path or doc.filename
    if kind != "pdf" and doc.filename.lower().endswith(".pdf"):
        _finding(db, doc, "wrong_extension", f"الملف «{doc.filename}» امتداده PDF لكنه فعليًا {kind}")

    result = classify(path, text, kind)
    if component_hint and component_hint != result.component:
        # The member chose the slot; content disagreeing lowers confidence but the choice stands.
        doc.component = component_hint
        doc.confidence = 0.9 if result.component == OTHER else 0.65
        doc.reason = f"اختاره العضو كـ{COMPONENT_AR[component_hint]}؛ التحليل رجّح {COMPONENT_AR[result.component]}"
    else:
        doc.component = result.component
        doc.confidence = max(result.confidence, 0.9) if component_hint else result.confidence
        doc.reason = result.reason
    doc.classified_by = "rules"
    doc.status = "classified" if doc.confidence >= settings.review_threshold and doc.component != OTHER else "needs_review"

    course = doc.course
    if doc.component == SPEC and result.codes_in_text and course.code:
        if course.code not in result.codes_in_text:
            _finding(db, doc, "code_mismatch",
                     f"رمز المقرر في التوصيف ({'، '.join(result.codes_in_text[:3])}) يختلف عن رمز الخطة {course.code}")

    activity.log(db, "classify",
                 f"صُنّف «{doc.filename}» كـ{COMPONENT_AR[doc.component]} (ثقة {int(doc.confidence * 100)}%)"
                 + (" — أُحيل لفريق المشروع" if doc.status == "needs_review" else ""),
                 None, course.program, course.id)


def _finding(db: Session, doc: Document, kind: str, message: str) -> None:
    db.add(Finding(document_id=doc.id, course_id=doc.course_id, kind=kind, message=message))


def _log_problem(db: Session, doc: Document) -> None:
    activity.log(db, "classify", f"تعذّرت معالجة «{doc.filename}»: {doc.error}", None,
                 doc.course.program, doc.course_id)
