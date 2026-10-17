from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import (
    COMPONENTS, DEAN, FACULTY, HEAD, TEAM, Assignment, Course, Document, Finding, SelectionSubmitted, Term, User,
)
from ..security import can_see_program, current_user, head_program
from ..services import activity
from ..services.completeness import all_course_completeness, course_completeness, visible_docs
from ..services.pipeline import COMPONENT_AR, ingest
from ..services.storage import storage

router = APIRouter(prefix="/api", tags=["courses"])


def active_term(db: Session) -> Term:
    term = db.scalar(select(Term).where(Term.active.is_(True)))
    if not term:
        raise HTTPException(409, "لا يوجد فصل دراسي نشط")
    return term


def course_out(c: Course, comp=None, assignments=None) -> dict:
    out = {"id": c.id, "program": c.program, "code": c.display_code, "plan_code": c.code, "spec_code": c.spec_code,
           "title": c.title, "level": c.level, "kind": c.kind, "group": c.group_label, "credit_hours": c.credit_hours,
           "practical": c.practical}
    if comp is not None:
        out["percent"] = comp.percent
        out["components"] = [{"component": s.component, "label": COMPONENT_AR[s.component], "status": s.status,
                              "documents": s.documents, "note": s.note} for s in comp.components]
    if assignments is not None:
        out["teachers"] = [{"assignment_id": a.id, "user_id": a.user_id, "name": a.user.name,
                            "is_coordinator": a.is_coordinator} for a in assignments]
    return out


def _assignments(db: Session, term_id: int, course_ids: list[int] | None = None,
                 viewer: User | None = None) -> dict[int, list[Assignment]]:
    """Real assignments; a tester also sees their own sandbox ones."""
    visible = Assignment.sandbox.is_(False)
    if viewer is not None and viewer.is_tester:
        visible = visible | (Assignment.user_id == viewer.id)
    q = select(Assignment).where(Assignment.term_id == term_id, visible)
    if course_ids is not None:
        q = q.where(Assignment.course_id.in_(course_ids))
    out: dict[int, list[Assignment]] = {}
    for a in db.scalars(q):
        out.setdefault(a.course_id, []).append(a)
    return out


def can_view_course(db: Session, user: User, course: Course, term_id: int) -> bool:
    if can_see_program(user, course.program):
        return True
    return db.scalar(select(Assignment.id).where(Assignment.term_id == term_id, Assignment.course_id == course.id,
                                                 Assignment.user_id == user.id)) is not None


@router.get("/courses")
def list_courses(program: str = "CS", user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Plan courses for course selection; shows who already teaches or coordinates each one."""
    term = active_term(db)
    courses = db.scalars(select(Course).where(Course.program == program).order_by(Course.sort_order)).all()
    assigned = _assignments(db, term.id, [c.id for c in courses], user)
    return [course_out(c, assignments=assigned.get(c.id, [])) for c in courses]


class SelectionItem(BaseModel):
    course_id: int
    is_coordinator: bool = False


class SelectionIn(BaseModel):
    items: list[SelectionItem]


@router.get("/me/selection")
def my_selection(user: User = Depends(current_user), db: Session = Depends(get_db)):
    term = active_term(db)
    rows = db.scalars(select(Assignment).where(Assignment.term_id == term.id, Assignment.user_id == user.id)).all()
    if not rows:
        # Pre-select last term's courses so only changes need attention.
        prev = db.scalar(select(Term).where(Term.id != term.id).order_by(Term.id.desc()))
        if prev:
            rows = db.scalars(select(Assignment).where(Assignment.term_id == prev.id, Assignment.user_id == user.id)).all()
    return {"term": term.code, "items": [{"course_id": a.course_id, "is_coordinator": a.is_coordinator} for a in rows]}


@router.put("/me/selection")
def save_selection(body: SelectionIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role not in (FACULTY, HEAD):
        raise HTTPException(403, "اختيار المقررات لأعضاء هيئة التدريس")
    term = active_term(db)
    wanted = {i.course_id: i.is_coordinator for i in body.items}
    existing = {a.course_id: a for a in db.scalars(select(Assignment).where(Assignment.term_id == term.id, Assignment.user_id == user.id))}
    conflicts = []
    for course_id, a in existing.items():
        if course_id not in wanted:
            db.delete(a)
    for course_id, coord in wanted.items():
        course = db.get(Course, course_id)
        if not course:
            raise HTTPException(404, f"المقرر {course_id} غير موجود")
        if coord:
            other = db.scalar(select(Assignment).where(Assignment.term_id == term.id, Assignment.course_id == course_id,
                                                       Assignment.is_coordinator.is_(True), Assignment.user_id != user.id,
                                                       Assignment.sandbox.is_(False)))
            if other:
                conflicts.append({"course": f"{course.display_code} {course.title}", "coordinator": other.user.name})
                coord = False
        if course_id in existing:
            existing[course_id].is_coordinator = coord
        else:
            db.add(Assignment(term_id=term.id, course_id=course_id, user_id=user.id, is_coordinator=coord,
                              sandbox=user.is_tester))
    if not db.scalar(select(SelectionSubmitted.id).where(SelectionSubmitted.term_id == term.id, SelectionSubmitted.user_id == user.id)):
        db.add(SelectionSubmitted(term_id=term.id, user_id=user.id))
    msg = f"اختار {user.name} {len(wanted)} مقررات للفصل {term.code}" if wanted else f"أفاد {user.name} أنه لا يدرّس مقررات في الفصل {term.code}"
    activity.log(db, "assignment", msg, user.id, "CS", sandbox=user.is_tester)
    db.commit()
    return {"ok": True, "conflicts": conflicts}


@router.get("/me/courses")
def my_courses(user: User = Depends(current_user), db: Session = Depends(get_db)):
    term = active_term(db)
    rows = db.scalars(select(Assignment).where(Assignment.term_id == term.id, Assignment.user_id == user.id)).all()
    courses = [a.course for a in rows]
    comp = all_course_completeness(db, courses, term.id, user.id)
    assigned = _assignments(db, term.id, [c.id for c in courses], user)
    out = []
    for a in rows:
        item = course_out(a.course, comp[a.course_id], assigned.get(a.course_id, []))
        item["is_coordinator"] = a.is_coordinator
        out.append(item)
    return out


@router.get("/courses/{course_id}")
def course_detail(course_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    term = active_term(db)
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(404, "المقرر غير موجود")
    if not can_view_course(db, user, course, term.id):
        raise HTTPException(403, "هذا المقرر خارج صلاحياتك")
    assigned = _assignments(db, term.id, [course.id], user).get(course.id, [])
    docs = db.scalars(select(Document).where(Document.course_id == course.id, Document.term_id == term.id,
                                             visible_docs(user.id)).order_by(Document.uploaded_at.desc())).all()
    findings = db.scalars(select(Finding).join(Document, Finding.document_id == Document.id)
                          .where(Finding.course_id == course.id, visible_docs(user.id))).all()
    mine = next((a for a in assigned if a.user_id == user.id), None)
    out = course_out(course, course_completeness(db, course, term.id, user.id), assigned)
    out["documents"] = [doc_out(d) for d in docs]
    out["findings"] = [{"kind": f.kind, "message": f.message} for f in findings]
    out["can_upload"] = mine is not None
    out["is_coordinator"] = bool(mine and mine.is_coordinator)
    out["can_set_practical"] = user.role == HEAD and head_program(user) == course.program
    return out


def doc_out(d: Document) -> dict:
    return {"id": d.id, "filename": d.filename, "archive_path": d.archive_path, "component": d.component,
            "component_label": COMPONENT_AR.get(d.component or "other"), "status": d.status, "confidence": d.confidence,
            "reason": d.reason, "error": d.error, "size": d.size, "uploaded_at": d.uploaded_at.isoformat(),
            "uploader": d.uploader.name, "classified_by": d.classified_by, "course_id": d.course_id,
            "course": f"{d.course.display_code} {d.course.title}"}


@router.post("/courses/{course_id}/upload")
async def upload(course_id: int, files: list[UploadFile] = File(...), component: str | None = Form(None),
                 user: User = Depends(current_user), db: Session = Depends(get_db)):
    term = active_term(db)
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(404, "المقرر غير موجود")
    if not db.scalar(select(Assignment.id).where(Assignment.term_id == term.id, Assignment.course_id == course_id,
                                                 Assignment.user_id == user.id)):
        raise HTTPException(403, "الرفع متاح لأساتذة المقرر فقط")
    if component and component not in COMPONENTS:
        raise HTTPException(422, "نوع وثيقة غير معروف")
    created = []
    for f in files:
        data = await f.read()
        if len(data) > settings.max_upload_mb * 1024 * 1024:
            raise HTTPException(413, f"الملف {f.filename} أكبر من {settings.max_upload_mb} ميجابايت")
        created += ingest(db, data=data, filename=f.filename or "file", course=course, term_id=term.id, user=user,
                          component_hint=component)
    return {"documents": [d.id for d in created]}


@router.get("/documents/{doc_id}/download")
def download(doc_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    doc = db.get(Document, doc_id)
    if not doc or (doc.sandbox and doc.uploaded_by != user.id) or not can_view_course(db, user, doc.course, doc.term_id):
        raise HTTPException(404, "الملف غير موجود")
    return Response(storage.get(doc.storage_key), media_type="application/octet-stream",
                    headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(doc.filename)}"})


class PracticalIn(BaseModel):
    practical: str


@router.patch("/courses/{course_id}/practical")
def set_practical(course_id: int, body: PracticalIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(404, "المقرر غير موجود")
    if not (user.role == HEAD and head_program(user) == course.program) and user.role != DEAN:
        raise HTTPException(403, "يحدده رئيس القسم")
    if body.practical not in ("yes", "no", "unknown"):
        raise HTTPException(422, "قيمة غير صحيحة")
    course.practical = body.practical
    label = {"yes": "مطلوب", "no": "غير منطبق", "unknown": "غير محسوم"}[body.practical]
    activity.log(db, "approval", f"حدّد {user.name} الجزء العملي لمقرر {course.display_code} كـ«{label}»", user.id, course.program, course.id)
    db.commit()
    return {"ok": True}


@router.get("/review")
def review_queue(user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role not in (TEAM, DEAN):
        raise HTTPException(403, "لفريق المشروع")
    docs = db.scalars(select(Document).where(Document.status.in_(("needs_review", "error")), Document.sandbox.is_(False))
                      .order_by(Document.uploaded_at.desc())).all()
    return [doc_out(d) for d in docs]


class ReviewIn(BaseModel):
    component: str


@router.post("/documents/{doc_id}/review")
def review_document(doc_id: int, body: ReviewIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.role != TEAM:
        raise HTTPException(403, "لفريق المشروع")
    doc = db.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "الملف غير موجود")
    if body.component not in (*COMPONENTS, "other"):
        raise HTTPException(422, "نوع وثيقة غير معروف")
    doc.component, doc.status, doc.classified_by, doc.confidence = body.component, "classified", "human", 1.0
    if body.component == "other":
        doc.status = "excluded"
    doc.reason = f"حسمه {user.name}"
    activity.log(db, "review", f"حسم {user.name} تصنيف «{doc.filename}» كـ{COMPONENT_AR[body.component]}",
                 user.id, doc.course.program, doc.course_id)
    db.commit()
    return {"ok": True}
