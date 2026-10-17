from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import DEAN, FACULTY, HEAD, Department, SelectionSubmitted, Term, User, aware, now
from ..security import COOKIE, current_user, issue_session, verify_pin
from ..services import activity

router = APIRouter(prefix="/api/auth", tags=["auth"])

ROLE_AR = {"dean": "عميد الكلية", "head": "رئيس القسم", "faculty": "عضو هيئة تدريس", "team": "فريق المشروع"}


@router.get("/users")
def login_list(db: Session = Depends(get_db)):
    users = db.scalars(select(User).where(User.active.is_(True), User.pending_approval.is_(False), User.in_pilot.is_(True),
                                          User.is_tester.is_(False))
                       .order_by(User.role != DEAN, User.role != HEAD, User.name)).all()
    return [{"id": u.id, "name": u.name, "role": u.role, "role_ar": role_ar(u),
             "department": u.department.name if u.department else None, "needs_pin": _needs_pin(u)} for u in users]


def role_ar(u: User) -> str:
    return "فريق المشروع (وضع تجريبي)" if u.is_tester else ROLE_AR[u.role]


def _needs_pin(u: User) -> bool:
    return u.role == DEAN or bool(u.pin_hash)


class LoginIn(BaseModel):
    user_id: int
    pin: str | None = Field(default=None, max_length=12)


@router.post("/login")
def login(body: LoginIn, response: Response, db: Session = Depends(get_db)):
    user = db.get(User, body.user_id)
    if not user or not user.active or user.pending_approval or not user.in_pilot or user.is_tester:
        raise HTTPException(404, "المستخدم غير موجود")
    if _needs_pin(user):
        if user.locked_until and aware(user.locked_until) > now():
            mins = int((aware(user.locked_until) - now()).total_seconds() // 60) + 1
            raise HTTPException(423, f"الحساب مقفل مؤقتًا. حاول بعد {mins} دقيقة")
        if not user.pin_hash:
            raise HTTPException(409, "لم يُعيَّن رمز الدخول لهذا الحساب بعد")
        if not body.pin or not verify_pin(body.pin, user.pin_hash):
            user.failed_pin_attempts += 1
            left = settings.pin_max_attempts - user.failed_pin_attempts
            if left <= 0:
                user.locked_until = now() + timedelta(minutes=settings.pin_lock_minutes)
                user.failed_pin_attempts = 0
                activity.log(db, "login", f"قُفل الدخول باسم {user.name} بعد محاولات رمز خاطئة", None)
                db.commit()
                raise HTTPException(423, f"الحساب مقفل {settings.pin_lock_minutes} دقيقة بعد {settings.pin_max_attempts} محاولات خاطئة")
            db.commit()
            raise HTTPException(401, f"الرمز غير صحيح. المحاولات المتبقية: {left}")
        user.failed_pin_attempts, user.locked_until = 0, None
    return _start_session(db, user, response)


class AliasIn(BaseModel):
    word: str = Field(max_length=40)


@router.post("/alias")
def alias_login(body: AliasIn, response: Response, db: Session = Depends(get_db)):
    """Hidden sign-in for sandbox testers: the word typed in the login search box."""
    word = body.word.strip().lower()
    user = db.scalar(select(User).where(User.login_alias == word, User.is_tester.is_(True), User.active.is_(True))) if word else None
    if not user:
        raise HTTPException(404, "لا يوجد اسم مطابق")
    return _start_session(db, user, response)


def _start_session(db: Session, user: User, response: Response) -> dict:
    activity.log(db, "login", f"دخل {user.name} ({role_ar(user)})", user.id, sandbox=user.is_tester)
    db.commit()
    response.set_cookie(COOKIE, issue_session(user.id), httponly=True, samesite="lax",
                        max_age=settings.session_days * 86400, secure=settings.frontend_origin.startswith("https"))
    return {"ok": True}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE)
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    term = db.scalar(select(Term).where(Term.active.is_(True)))
    submitted = term is not None and db.scalar(select(SelectionSubmitted.id).where(
        SelectionSubmitted.user_id == user.id, SelectionSubmitted.term_id == term.id)) is not None
    return {"id": user.id, "name": user.name, "role": user.role, "role_ar": role_ar(user), "is_tester": user.is_tester,
            "department": user.department.name if user.department else None,
            "program": user.department.program_code if user.department else None,
            "term": term.code if term else None,
            # Only faculty are sent to the selection screen; a head may choose courses from the menu.
            "needs_course_selection": user.role == FACULTY and term is not None and not submitted}


class RegisterIn(BaseModel):
    name: str = Field(min_length=6, max_length=200)
    department_id: int


@router.post("/register-request")
def register_request(body: RegisterIn, db: Session = Depends(get_db)):
    """'اسمي غير موجود' — the head approves the request before the name appears in the list."""
    name = " ".join(body.name.split())
    if db.scalar(select(User).where(User.name == name)):
        raise HTTPException(409, "الاسم موجود مسبقًا؛ اطلب من فريق المشروع إضافته للتجربة")
    if not db.get(Department, body.department_id):
        raise HTTPException(404, "القسم غير موجود")
    db.add(User(name=name, department_id=body.department_id, role=FACULTY, pending_approval=True, in_pilot=True,
                email_confirmed=False))
    activity.log(db, "assignment", f"طلب تسجيل جديد: {name}")
    db.commit()
    return {"ok": True, "message": "أُرسل طلبك لرئيس القسم للاعتماد"}


@router.get("/departments")
def departments(db: Session = Depends(get_db)):
    return [{"id": d.id, "name": d.name, "program": d.program_code} for d in db.scalars(select(Department).order_by(Department.name))]
