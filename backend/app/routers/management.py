import io

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import (
    DEAN, FACULTY, HEAD, TEAM, ActivityEvent, Assignment, Course, Department, DistributionApproval, Document,
    Notification,
    User, now,
)
from ..security import can_see_program, current_user, head_program, require
from ..services import activity, settings_store
from ..services.completeness import all_course_completeness
from ..services.reminders import run_reminders
from .courses import _assignments, active_term, course_out

router = APIRouter(prefix="/api", tags=["management"])


# ---------- Department head: distribution of courses ----------

def _check_program(user: User, program: str) -> None:
    if not can_see_program(user, program):
        raise HTTPException(403, "هذا القسم خارج صلاحياتك")


@router.get("/programs/{program}/distribution")
def distribution(program: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _check_program(user, program)
    term = active_term(db)
    courses = db.scalars(select(Course).where(Course.program == program).order_by(Course.sort_order)).all()
    assigned = _assignments(db, term.id, [c.id for c in courses], user)
    approval = db.scalar(select(DistributionApproval).where(DistributionApproval.term_id == term.id,
                                                            DistributionApproval.program == program))
    rows = [course_out(c, assignments=assigned.get(c.id, [])) for c in courses]
    dept_ids = [d.id for d in db.scalars(select(Department).where(Department.program_code == program))]
    pending = db.scalars(select(User).where(User.pending_approval.is_(True), User.department_id.in_(dept_ids))).all()
    return {
        "term": term.code,
        "courses": rows,
        "unassigned": [r for r in rows if not r["teachers"]],
        "without_coordinator": [r for r in rows if r["teachers"] and not any(t["is_coordinator"] for t in r["teachers"])],
        "approved": approval is not None,
        "approved_at": approval.approved_at.isoformat() if approval else None,
        "approved_by": db.get(User, approval.approved_by).name if approval else None,
        "pending_users": [{"id": u.id, "name": u.name, "department": u.department.name if u.department else None}
                          for u in pending],
    }


@router.post("/programs/{program}/distribution/approve")
def approve_distribution(program: str, user: User = Depends(require(HEAD)), db: Session = Depends(get_db)):
    if head_program(user) != program:
        raise HTTPException(403, "يعتمد التوزيع رئيس القسم المختص")
    term = active_term(db)
    if not db.scalar(select(DistributionApproval).where(DistributionApproval.term_id == term.id,
                                                        DistributionApproval.program == program)):
        db.add(DistributionApproval(term_id=term.id, program=program, approved_by=user.id))
        activity.log(db, "approval", f"اعتمد {user.name} توزيع مقررات {program} للفصل {term.code} — تبدأ التذكيرات", user.id, program)
        db.commit()
    return {"ok": True}


class AssignmentPatch(BaseModel):
    is_coordinator: bool


def _head_assignment(db: Session, user: User, assignment_id: int) -> Assignment:
    a = db.get(Assignment, assignment_id)
    if not a:
        raise HTTPException(404, "غير موجود")
    if not (user.role == HEAD and head_program(user) == a.course.program):
        raise HTTPException(403, "يعدّل التوزيع رئيس القسم المختص")
    return a


@router.patch("/assignments/{assignment_id}")
def patch_assignment(assignment_id: int, body: AssignmentPatch, user: User = Depends(current_user), db: Session = Depends(get_db)):
    a = _head_assignment(db, user, assignment_id)
    if body.is_coordinator:
        for other in db.scalars(select(Assignment).where(Assignment.term_id == a.term_id, Assignment.course_id == a.course_id)):
            other.is_coordinator = False
    a.is_coordinator = body.is_coordinator
    activity.log(db, "assignment", f"عيّن {user.name} {a.user.name} {'منسقًا' if body.is_coordinator else 'أستاذًا'} لمقرر {a.course.display_code}",
                 user.id, a.course.program, a.course_id)
    db.commit()
    return {"ok": True}


@router.delete("/assignments/{assignment_id}")
def delete_assignment(assignment_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    a = _head_assignment(db, user, assignment_id)
    activity.log(db, "assignment", f"أزال {user.name} {a.user.name} من مقرر {a.course.display_code}", user.id, a.course.program, a.course_id)
    db.delete(a)
    db.commit()
    return {"ok": True}


@router.post("/users/{user_id}/approve")
def approve_user(user_id: int, user: User = Depends(require(HEAD)), db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if not u or not u.pending_approval:
        raise HTTPException(404, "لا يوجد طلب")
    if not u.department or u.department.program_code != head_program(user):
        raise HTTPException(403, "الطلب لقسم آخر")
    u.pending_approval = False
    activity.log(db, "approval", f"اعتمد {user.name} تسجيل {u.name}", user.id, head_program(user))
    db.commit()
    return {"ok": True}


@router.post("/users/{user_id}/reject")
def reject_user(user_id: int, user: User = Depends(require(HEAD)), db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if not u or not u.pending_approval or not u.department or u.department.program_code != head_program(user):
        raise HTTPException(404, "لا يوجد طلب")
    u.active, u.pending_approval = False, False
    activity.log(db, "approval", f"رفض {user.name} طلب تسجيل {u.name}", user.id, head_program(user))
    db.commit()
    return {"ok": True}


# ---------- Dashboards ----------

@router.get("/dashboard")
def dashboard(user: User = Depends(current_user), db: Session = Depends(get_db)):
    term = active_term(db)
    if user.role == FACULTY:
        programs: list[str] = []
    elif user.role == HEAD:
        programs = [head_program(user)] if head_program(user) else []
    else:
        programs = sorted({p for (p,) in db.execute(select(Course.program).distinct())})

    out = {"term": term.code, "programs": []}
    for program in programs:
        courses = db.scalars(select(Course).where(Course.program == program).order_by(Course.sort_order)).all()
        comp = all_course_completeness(db, courses, term.id)
        assigned = _assignments(db, term.id, [c.id for c in courses])
        rows = [course_out(c, comp[c.id], assigned.get(c.id, [])) for c in courses]
        # Electives not offered this term have no teacher and do not count against completion.
        offered = [c for c in courses if assigned.get(c.id)]
        applicable = sum(comp[c.id].applicable for c in offered)
        present = sum(comp[c.id].present for c in offered)
        approval = db.scalar(select(DistributionApproval).where(DistributionApproval.term_id == term.id,
                                                                DistributionApproval.program == program))
        out["programs"].append({
            "program": program,
            "percent": round(100 * present / applicable) if applicable else 0,
            "courses_total": len(courses),
            "courses_offered": len(offered),
            "courses_complete": sum(1 for c in offered if comp[c.id].percent == 100),
            "courses_unassigned": len(courses) - len(offered),
            "missing_components": sum(len(comp[c.id].missing) for c in offered),
            "review_components": sum(1 for c in offered for s in comp[c.id].components if s.status == "review"),
            "distribution_approved": approval is not None,
            "courses": rows,
        })
    out["review_queue"] = _review_count(db) if user.role in (DEAN, TEAM) else 0
    return out


def _review_count(db: Session) -> int:
    return db.scalar(select(func.count()).select_from(Document).where(
        Document.status.in_(("needs_review", "error")), Document.sandbox.is_(False))) or 0


# ---------- Notifications, reminders, settings ----------

@router.get("/notifications")
def notifications(user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(Notification).order_by(Notification.created_at.desc()).limit(200)
    if user.role not in (DEAN, TEAM):
        q = q.where(Notification.user_id == user.id)
    return [{"id": n.id, "to": n.user.name, "to_email": n.to_email, "kind": n.kind, "subject": n.subject,
             "body": n.body, "status": n.status, "created_at": n.created_at.isoformat(), "read": n.read_at is not None}
            for n in db.scalars(q)]


@router.post("/notifications/read")
def mark_read(user: User = Depends(current_user), db: Session = Depends(get_db)):
    for n in db.scalars(select(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))):
        n.read_at = now()
    db.commit()
    return {"ok": True}


@router.post("/reminders/run")
def reminders_now(user: User = Depends(require(DEAN, TEAM)), db: Session = Depends(get_db)):
    result = run_reminders(db, force=True)
    activity.log(db, "reminder", f"شغّل {user.name} إرسال التذكيرات يدويًا", user.id)
    db.commit()
    return result


class SettingsIn(BaseModel):
    deadline_days: int = Field(ge=1, le=60)
    reminder_every_days: int = Field(ge=1, le=30)
    reminders_enabled: bool


@router.get("/settings")
def get_settings(user: User = Depends(require(DEAN, TEAM)), db: Session = Depends(get_db)):
    return {"deadline_days": settings_store.get_int(db, "deadline_days", 7),
            "reminder_every_days": settings_store.get_int(db, "reminder_every_days", 2),
            "reminders_enabled": settings_store.get(db, "reminders_enabled") == "1"}


@router.put("/settings")
def put_settings(body: SettingsIn, user: User = Depends(require(DEAN, TEAM)), db: Session = Depends(get_db)):
    settings_store.put(db, "deadline_days", str(body.deadline_days))
    settings_store.put(db, "reminder_every_days", str(body.reminder_every_days))
    settings_store.put(db, "reminders_enabled", "1" if body.reminders_enabled else "0")
    activity.log(db, "admin", f"عدّل {user.name} إعدادات التذكير: مهلة {body.deadline_days} أيام، كل {body.reminder_every_days} يوم", user.id)
    db.commit()
    return {"ok": True}


# ---------- Activity log ----------

@router.get("/activity")
def activity_log(kind: str | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(ActivityEvent).where(ActivityEvent.sandbox.is_(False) | (ActivityEvent.actor_id == user.id))         .order_by(ActivityEvent.at.desc()).limit(300)
    if kind:
        q = q.where(ActivityEvent.kind == kind)
    if user.role == HEAD:
        q = q.where((ActivityEvent.program == head_program(user)) | (ActivityEvent.actor_id == user.id))
    elif user.is_tester:
        q = q.where(ActivityEvent.actor_id == user.id)
    elif user.role == FACULTY:
        term = active_term(db)
        mine = select(Assignment.course_id).where(Assignment.user_id == user.id, Assignment.term_id == term.id)
        q = q.where((ActivityEvent.actor_id == user.id) | (ActivityEvent.course_id.in_(mine)))
    return [{"id": e.id, "at": e.at.isoformat(), "kind": e.kind, "message": e.message,
             "actor": e.actor.name if e.actor else "النظام"} for e in db.scalars(q)]


# ---------- Users ----------

@router.get("/users")
def users(user: User = Depends(require(DEAN, TEAM)), db: Session = Depends(get_db)):
    return [{"id": u.id, "name": u.name, "email": u.email, "email_confirmed": u.email_confirmed, "role": u.role,
             "is_tester": u.is_tester, "has_password": u.pin_hash is not None,
             "department": u.department.name if u.department else None, "in_pilot": u.in_pilot,
             "pending": u.pending_approval, "active": u.active}
            for u in db.scalars(select(User).order_by(User.in_pilot.desc(), User.name))]


@router.post("/users/{user_id}/reset-password")
def reset_password(user_id: int, user: User = Depends(require(DEAN, TEAM)), db: Session = Depends(get_db)):
    """Clears a member's password so they choose a new one at their next sign-in."""
    u = db.get(User, user_id)
    if not u or u.is_tester:
        raise HTTPException(404, "غير موجود")
    if u.role == DEAN:
        raise HTTPException(403, "كلمة مرور العميد تُعيَّن من سطر الأوامر")
    u.pin_hash, u.failed_pin_attempts, u.locked_until = None, 0, None
    activity.log(db, "admin", f"أعاد {user.name} تعيين كلمة مرور {u.name}", user.id)
    db.commit()
    return {"ok": True}


@router.post("/admin/import-users")
async def import_users(file: UploadFile = File(...), user: User = Depends(require(DEAN, TEAM)), db: Session = Depends(get_db)):
    """Re-import the users workbook (same layout as المستخدمون_وتوزيع_المقررات_v3.xlsx)."""
    from ..seed_data import import_users_workbook
    counts = import_users_workbook(db, io.BytesIO(await file.read()))
    activity.log(db, "admin", f"استورد {user.name} قائمة المستخدمين: {counts}", user.id)
    db.commit()
    return counts
