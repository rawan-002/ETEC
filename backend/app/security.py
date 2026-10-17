import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import DEAN, HEAD, TEAM, User

COOKIE = "aq_session"


def hash_pin(pin: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(pin.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_pin(pin: str, stored: str) -> bool:
    try:
        _, salt_hex, digest_hex = stored.split("$")
    except ValueError:
        return False
    digest = hashlib.scrypt(pin.encode(), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1)
    return hmac.compare_digest(digest.hex(), digest_hex)


def issue_session(user_id: int) -> str:
    exp = datetime.now(timezone.utc) + timedelta(days=settings.session_days)
    return jwt.encode({"uid": user_id, "exp": exp}, settings.secret_key, algorithm="HS256")


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(401, "غير مسجل الدخول")
    try:
        uid = jwt.decode(token, settings.secret_key, algorithms=["HS256"])["uid"]
    except jwt.PyJWTError:
        raise HTTPException(401, "انتهت الجلسة")
    user = db.get(User, uid)
    if not user or not user.active or user.pending_approval:
        raise HTTPException(401, "الحساب غير مفعّل")
    return user


def require(*roles: str):
    def dep(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(403, "غير مصرح لهذا الدور")
        return user
    return dep


def head_program(user: User) -> str | None:
    """The program a department head is responsible for."""
    return user.department.program_code if user.role == HEAD and user.department else None


def can_see_program(user: User, program: str) -> bool:
    if user.role in (DEAN, TEAM):
        return True
    return user.role == HEAD and head_program(user) == program
