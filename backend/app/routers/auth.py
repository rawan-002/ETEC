"""Sign-in by university email and password.

1. lookup: the email is checked against the pilot users and the member's name is shown back.
   A sandbox tester's email signs in straight away (hidden project-team access).
2. First visit: the member chooses a password (setup). The dean's first password is set by an
   administrator from the command line, since that account approves reports.
3. Later visits: email + password (login), with a temporary lock after repeated failures.
"""
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models import DEAN, FACULTY, Department, SelectionSubmitted, Term, User, aware, now
from ..security import COOKIE, current_user, hash_pin, issue_session, verify_pin
from ..services import activity

router = APIRouter(prefix="/api/auth", tags=["auth"])

ROLE_AR = {"dean": "عميد الكلية", "head": "رئيس القسم", "faculty": "عضو هيئة تدريس", "team": "فريق المشروع"}
MIN_PASSWORD = 8


def role_ar(u: User) -> str:
    return "فريق المشروع (وضع تجريبي)" if u.is_tester else ROLE_AR[u.role]


def _find(db: Session, email: str) -> User:
    email = email.strip().lower()
    user = db.scalar(select(User).where(func.lower(User.email) == email)) if email else None
    if not user or not user.active or user.pending_approval or not user.in_pilot:
        raise HTTPException(404, "البريد غير مسجّل في التجربة. تأكد من كتابته أو اطلب الإضافة.")
    return user


class EmailIn(BaseModel):
    email: str = Field(max_length=200)


@router.post("/lookup")
def lookup(body: EmailIn, response: Response, db: Session = Depends(get_db)):
    user = _find(db, body.email)
    if user.is_tester:
        _start_session(db, user, response)
        return {"signed_in": True}
    return {"signed_in": False, "name": user.name, "role_ar": role_ar(user),
            "needs_setup": user.pin_hash is None, "can_self_setup": user.role != DEAN}


class LoginIn(BaseModel):
    email: str = Field(max_length=200)
    password: str = Field(max_length=128)


@router.post("/login")
def login(body: LoginIn, response: Response, db: Session = Depends(get_db)):
    user = _find(db, body.email)
    if user.is_tester:
        return _start_session(db, user, response)
    if user.locked_until and aware(user.locked_until) > now():
        mins = int((aware(user.locked_until) - now()).total_seconds() // 60) + 1
        raise HTTPException(423, f"الحساب مقفل مؤقتًا. حاول بعد {mins} دقيقة")
    if not user.pin_hash:
        raise HTTPException(409, "لم تُعيَّن كلمة مرور لهذا الحساب بعد")
    if not verify_pin(body.password, user.pin_hash):
        user.failed_pin_attempts += 1
        left = settings.pin_max_attempts - user.failed_pin_attempts
        if left <= 0:
            user.locked_until = now() + timedelta(minutes=settings.pin_lock_minutes)
            user.failed_pin_attempts = 0
            activity.log(db, "login", f"قُفل الدخول بحساب {user.name} بعد محاولات خاطئة", None)
            db.commit()
            raise HTTPException(423, f"الحساب مقفل {settings.pin_lock_minutes} دقيقة بعد {settings.pin_max_attempts} محاولات خاطئة")
        db.commit()
        raise HTTPException(401, f"كلمة المرور غير صحيحة. المحاولات المتبقية: {left}")
    user.failed_pin_attempts, user.locked_until = 0, None
    return _start_session(db, user, response)


class SetupIn(BaseModel):
    email: str = Field(max_length=200)
    password: str = Field(max_length=128)


@router.post("/setup")
def setup(body: SetupIn, response: Response, db: Session = Depends(get_db)):
    """First sign-in: the member chooses a password."""
    user = _find(db, body.email)
    if user.pin_hash is not None:
        raise HTTPException(409, "كلمة المرور معيّنة مسبقًا")
    if user.role == DEAN:
        raise HTTPException(403, "كلمة مرور العميد يعيّنها فريق المشروع")
    if len(body.password) < MIN_PASSWORD:
        raise HTTPException(422, f"كلمة المرور {MIN_PASSWORD} أحرف على الأقل")
    user.pin_hash = hash_pin(body.password)
    activity.log(db, "login", f"عيّن {user.name} كلمة المرور لأول مرة", user.id)
    return _start_session(db, user, response)


class ChangePasswordIn(BaseModel):
    current: str = Field(max_length=128)
    new: str = Field(max_length=128)


@router.post("/change-password")
def change_password(body: ChangePasswordIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.is_tester or not user.pin_hash:
        raise HTTPException(409, "هذا الحساب لا يستخدم كلمة مرور")
    if not verify_pin(body.current, user.pin_hash):
        raise HTTPException(401, "كلمة المرور الحالية غير صحيحة")
    if len(body.new) < MIN_PASSWORD:
        raise HTTPException(422, f"كلمة المرور {MIN_PASSWORD} أحرف على الأقل")
    if body.new == body.current:
        raise HTTPException(422, "اختر كلمة مرور مختلفة عن الحالية")
    user.pin_hash = hash_pin(body.new)
    activity.log(db, "login", f"غيّر {user.name} كلمة المرور", user.id)
    db.commit()
    return {"ok": True}


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
    email: str = Field(max_length=200)
    department_id: int


@router.post("/register-request")
def register_request(body: RegisterIn, db: Session = Depends(get_db)):
    """'بريدي غير موجود' — the head approves the request before the account can sign in."""
    name = " ".join(body.name.split())
    email = body.email.strip().lower()
    if not email.endswith("@bu.edu.sa"):
        raise HTTPException(422, "استخدم البريد الجامعي (@bu.edu.sa)")
    existing = db.scalar(select(User).where((User.name == name) | (func.lower(User.email) == email)))
    if existing:
        raise HTTPException(409, "الاسم أو البريد موجود مسبقًا؛ اطلب من فريق المشروع إضافته للتجربة")
    if not db.get(Department, body.department_id):
        raise HTTPException(404, "القسم غير موجود")
    db.add(User(name=name, email=email, department_id=body.department_id, role=FACULTY, pending_approval=True,
                in_pilot=True, email_confirmed=False))
    activity.log(db, "assignment", f"طلب تسجيل جديد: {name}")
    db.commit()
    return {"ok": True, "message": "أُرسل طلبك لرئيس القسم للاعتماد"}


@router.get("/departments")
def departments(db: Session = Depends(get_db)):
    return [{"id": d.id, "name": d.name, "program": d.program_code} for d in db.scalars(select(Department).order_by(Department.name))]
