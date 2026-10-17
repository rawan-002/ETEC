import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import (
    DEAN, HEAD, TEAM, Assignment, Course, CourseAnalysis, Document, Question, QuestionMessage, User, now,
)
from ..security import current_user, head_program
from ..services import activity, decisions_ai
from ..services.decisions import head_for, queue_analysis, question_context
from .courses import active_term, can_view_course

router = APIRouter(prefix="/api", tags=["decisions"])

STATUS_AR = {"pending": "بانتظار القرار", "approved": "معتمد", "deferred": "مؤجل"}


def _visible_questions(db: Session, user: User, term_id: int):
    q = select(Question).where(Question.term_id == term_id)
    if user.is_tester:
        return q.where(Question.sandbox.is_(True), Question.assignee_id == user.id)
    q = q.where(Question.sandbox.is_(False))
    if user.role in (DEAN, TEAM):
        return q
    if user.role == HEAD:
        return q.where((Question.course_id.in_(select(Course.id).where(Course.program == head_program(user))))
                       | (Question.assignee_id == user.id))
    mine = select(Assignment.course_id).where(Assignment.user_id == user.id, Assignment.term_id == term_id)
    return q.where((Question.assignee_id == user.id) | Question.course_id.in_(mine))


def _get(db: Session, user: User, qid: int) -> Question:
    term = active_term(db)
    q = db.scalar(_visible_questions(db, user, term.id).where(Question.id == qid))
    if not q:
        raise HTTPException(404, "المسألة غير موجودة")
    return q


def can_decide(user: User, q: Question) -> bool:
    if q.status == "approved":
        return False
    if q.assignee_id == user.id:
        return True
    return not q.sandbox and (user.role == DEAN or (user.role == HEAD and head_program(user) == q.course.program))


def _summary(q: Question, user: User) -> dict:
    return {"id": q.id, "title": q.title, "priority": q.priority, "category": q.category, "status": q.status,
            "status_ar": STATUS_AR[q.status], "escalations": q.escalations,
            "course": {"id": q.course_id, "code": q.course.display_code, "title": q.course.title},
            "assignee": q.assignee.name if q.assignee else None, "assigned_to_me": q.assignee_id == user.id,
            "created_at": q.created_at.isoformat()}


@router.get("/questions")
def list_questions(user: User = Depends(current_user), db: Session = Depends(get_db)):
    term = active_term(db)
    rows = db.scalars(_visible_questions(db, user, term.id).order_by(Question.status != "pending", Question.created_at.desc())).all()
    order = {"high": 0, "medium": 1, "low": 2}
    rows.sort(key=lambda q: (q.status != "pending", q.assignee_id != user.id, order.get(q.priority, 1)))
    return [_summary(q, user) for q in rows]


@router.get("/questions/count")
def count_questions(user: User = Depends(current_user), db: Session = Depends(get_db)):
    term = active_term(db)
    n = db.scalar(select(func.count()).select_from(
        _visible_questions(db, user, term.id).where(Question.status == "pending", Question.assignee_id == user.id).subquery()))
    return {"pending_for_me": n or 0}


@router.get("/questions/{qid}")
def get_question(qid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = _get(db, user, qid)
    evidence = []
    for e in json.loads(q.evidence_json):
        doc = db.get(Document, e["document_id"]) if e.get("document_id") else None
        evidence.append({**e, "filename": doc.filename if doc else None})
    messages = db.scalars(select(QuestionMessage).where(QuestionMessage.question_id == q.id).order_by(QuestionMessage.id)).all()
    targets = []
    if can_decide(user, q) and not q.sandbox:
        head = head_for(db, q.course.program)
        dean = db.scalar(select(User).where(User.role == DEAN, User.active.is_(True)))
        targets = [{"id": u.id, "name": u.name, "role": "رئيس القسم" if u.role == HEAD else "عميد الكلية"}
                   for u in (head, dean) if u and u.id not in (user.id, q.assignee_id)]
    return {**_summary(q, user), "description": q.description, "options": json.loads(q.options_json),
            "evidence": evidence, "decision": q.decision,
            "decided_at": q.decided_at.isoformat() if q.decided_at else None,
            "can_decide": can_decide(user, q), "escalation_targets": targets,
            "assistant_enabled": decisions_ai.enabled(),
            "messages": [{"id": m.id, "role": m.role, "content": m.content, "at": m.at.isoformat(),
                          "user": m.user.name if m.user else None} for m in messages]}


class DecideIn(BaseModel):
    option: int | None = None
    custom: str | None = Field(default=None, max_length=2000)


@router.post("/questions/{qid}/decide")
def decide(qid: int, body: DecideIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = _get(db, user, qid)
    if not can_decide(user, q):
        raise HTTPException(403, "القرار لصاحب الصلاحية المسند إليه")
    options = json.loads(q.options_json)
    if body.custom and body.custom.strip():
        decision = body.custom.strip()
    elif body.option is not None and 0 <= body.option < len(options):
        decision = options[body.option]
    else:
        raise HTTPException(422, "اختر أحد الخيارات أو اكتب إجابة مخصصة")
    q.status, q.decision, q.decided_by, q.decided_at = "approved", decision, user.id, now()
    db.add(QuestionMessage(question_id=q.id, user_id=user.id, role="event", content=f"اعتمد {user.name} القرار: {decision}"))
    activity.log(db, "decision", f"اعتمد {user.name} قرار «{q.title}» لمقرر {q.course.display_code}: {decision}",
                 user.id, q.course.program, q.course_id, q.sandbox)
    db.commit()
    return {"ok": True}


class NoteIn(BaseModel):
    note: str | None = Field(default=None, max_length=1000)


@router.post("/questions/{qid}/defer")
def defer(qid: int, body: NoteIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = _get(db, user, qid)
    if not can_decide(user, q):
        raise HTTPException(403, "التأجيل لصاحب الصلاحية المسند إليه")
    q.status = "deferred"
    note = f" — {body.note.strip()}" if body.note and body.note.strip() else ""
    db.add(QuestionMessage(question_id=q.id, user_id=user.id, role="event", content=f"أجّل {user.name} القرار{note}"))
    activity.log(db, "decision", f"أجّل {user.name} «{q.title}» لمقرر {q.course.display_code}", user.id,
                 q.course.program, q.course_id, q.sandbox)
    db.commit()
    return {"ok": True}


@router.post("/questions/{qid}/reopen")
def reopen(qid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = _get(db, user, qid)
    if q.status != "deferred" or not can_decide(user, q):
        raise HTTPException(409, "لا يمكن إعادة فتح هذه المسألة")
    q.status = "pending"
    db.add(QuestionMessage(question_id=q.id, user_id=user.id, role="event", content=f"أعاد {user.name} فتح المسألة"))
    db.commit()
    return {"ok": True}


class EscalateIn(BaseModel):
    to_user_id: int
    note: str | None = Field(default=None, max_length=1000)


@router.post("/questions/{qid}/escalate")
def escalate(qid: int, body: EscalateIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = _get(db, user, qid)
    if not can_decide(user, q) or q.sandbox:
        raise HTTPException(403, "التصعيد لصاحب الصلاحية المسند إليه")
    target = db.get(User, body.to_user_id)
    allowed = {u.id for u in (head_for(db, q.course.program), db.scalar(select(User).where(User.role == DEAN))) if u}
    if not target or target.id not in allowed:
        raise HTTPException(422, "التصعيد لرئيس القسم أو العميد فقط")
    q.assignee_id, q.status, q.escalations = target.id, "pending", q.escalations + 1
    note = f" — {body.note.strip()}" if body.note and body.note.strip() else ""
    db.add(QuestionMessage(question_id=q.id, user_id=user.id, role="event", content=f"صعّد {user.name} المسألة إلى {target.name}{note}"))
    activity.log(db, "decision", f"صعّد {user.name} «{q.title}» إلى {target.name}", user.id, q.course.program, q.course_id)
    db.commit()
    return {"ok": True}


class AskIn(BaseModel):
    message: str = Field(min_length=1, max_length=1000)


@router.post("/questions/{qid}/ask")
def ask(qid: int, body: AskIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = _get(db, user, qid)
    if not decisions_ai.enabled():
        raise HTTPException(409, "المساعد الذكي غير مفعّل")
    history = [(m.role, m.content) for m in db.scalars(
        select(QuestionMessage).where(QuestionMessage.question_id == q.id, QuestionMessage.role.in_(("user", "assistant")))
        .order_by(QuestionMessage.id))]
    answer, usage, error = decisions_ai.ask_assistant(context=question_context(db, q), history=history, message=body.message)
    if answer is None:
        raise HTTPException(502, error or "تعذّر الحصول على إجابة")
    db.add(QuestionMessage(question_id=q.id, user_id=user.id, role="user", content=body.message))
    db.add(QuestionMessage(question_id=q.id, role="assistant", content=answer,
                           ai_input_tokens=usage.input_tokens, ai_output_tokens=usage.output_tokens))
    db.commit()
    return {"answer": answer}


# ---------- course analysis ----------

def _can_analyse(db: Session, user: User, course: Course, term_id: int) -> bool:
    if user.role in (DEAN, TEAM) or (user.role == HEAD and head_program(user) == course.program):
        return True
    return db.scalar(select(Assignment.id).where(Assignment.course_id == course.id, Assignment.term_id == term_id,
                                                 Assignment.user_id == user.id)) is not None


@router.post("/courses/{course_id}/analyze")
def analyze(course_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    term = active_term(db)
    course = db.get(Course, course_id)
    if not course or not _can_analyse(db, user, course, term.id):
        raise HTTPException(404, "المقرر غير موجود")
    if not decisions_ai.enabled():
        raise HTTPException(409, "التحليل الذكي غير مفعّل")
    run = queue_analysis(db, course, term.id, user, sandbox=user.is_tester)
    return {"id": run.id, "status": run.status}


@router.get("/courses/{course_id}/analysis")
def latest_analysis(course_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    term = active_term(db)
    course = db.get(Course, course_id)
    if not course or not can_view_course(db, user, course, term.id):
        raise HTTPException(404, "المقرر غير موجود")
    q = select(CourseAnalysis).where(CourseAnalysis.course_id == course_id, CourseAnalysis.term_id == term.id,
                                     CourseAnalysis.sandbox.is_(user.is_tester))
    if user.is_tester:
        q = q.where(CourseAnalysis.requested_by == user.id)
    run = db.scalar(q.order_by(CourseAnalysis.id.desc()))
    open_q = db.scalars(_visible_questions(db, user, term.id).where(Question.course_id == course_id)).all()
    return {"enabled": decisions_ai.enabled(), "can_run": _can_analyse(db, user, course, term.id),
            "run": None if not run else {"status": run.status, "summary": run.summary, "error": run.error,
                                         "questions_created": run.questions_created,
                                         "finished_at": run.finished_at.isoformat() if run.finished_at else None},
            "questions": [_summary(x, user) for x in open_q]}
