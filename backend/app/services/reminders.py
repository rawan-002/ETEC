"""Missing-document reminders. They start only after the head approves the program's distribution,
repeat every N days, and stop by themselves once a member's components are complete."""
import logging
import smtplib
from datetime import timedelta
from email.message import EmailMessage

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..models import (
    HEAD, SPEC, Assignment, DistributionApproval, Notification, Term, User, aware, now,
)
from . import activity
from .completeness import all_course_completeness
from .pipeline import COMPONENT_AR
from .settings_store import get_int

log = logging.getLogger("aq.reminders")


def run_reminders(db: Session, force: bool = False) -> dict:
    term = db.scalar(select(Term).where(Term.active.is_(True)))
    if not term:
        return {"sent": 0, "reason": "لا يوجد فصل نشط"}
    every = timedelta(days=get_int(db, "reminder_every_days", 2))
    deadline_days = get_int(db, "deadline_days", 7)
    approved = {a.program for a in db.scalars(select(DistributionApproval).where(DistributionApproval.term_id == term.id))}

    assignments = db.scalars(select(Assignment).where(Assignment.term_id == term.id)).all()
    assignments = [a for a in assignments if a.course.program in approved]
    comp = all_course_completeness(db, list({a.course_id: a.course for a in assignments}.values()), term.id)

    per_user: dict[int, list[tuple]] = {}
    for a in assignments:
        missing = comp[a.course_id].missing
        if not a.is_coordinator:
            missing = [m for m in missing if m != SPEC]  # the specification is the coordinator's
        if missing:
            per_user.setdefault(a.user_id, []).append((a.course, missing))

    sent = 0
    for user_id, items in per_user.items():
        user = db.get(User, user_id)
        last = db.scalar(select(Notification.created_at).where(
            Notification.user_id == user_id, Notification.kind == "missing_reminder"
        ).order_by(Notification.created_at.desc()))
        if last and not force and aware(last) > now() - every:
            continue
        lines = [f"- {c.display_code} {c.title}: {'، '.join(COMPONENT_AR[m] for m in miss)}" for c, miss in items]
        body = (f"السلام عليكم {user.name}،\n\nنأمل استكمال الوثائق التالية خلال {deadline_days} أيام:\n"
                + "\n".join(lines)
                + f"\n\nيمكنكم الرفع مباشرة من المنصة: {settings.frontend_origin}\n"
                  f"يتوقف هذا التذكير تلقائيًا عند اكتمال الوثائق.")
        _send(db, user, "missing_reminder", "تذكير: وثائق ناقصة لمقرراتكم", body)
        sent += 1

    for program in approved:
        heads = db.scalars(select(User).where(User.role == HEAD)).all()
        for head in [h for h in heads if h.department and h.department.program_code == program]:
            late = sorted({a.course.display_code for a in assignments if a.course.program == program and comp[a.course_id].missing})
            if late:
                _send(db, head, "head_summary", f"ملخص المقررات غير المكتملة ({len(late)})",
                      "المقررات التي ما زالت بها وثائق ناقصة:\n" + "، ".join(late), only_if_due=not force, every=every)

    activity.log(db, "reminder", f"أُرسل {sent} تذكير بالوثائق الناقصة")
    db.commit()
    return {"sent": sent}


def _send(db: Session, user: User, kind: str, subject: str, body: str, only_if_due: bool = False,
          every: timedelta | None = None) -> None:
    if only_if_due and every:
        last = db.scalar(select(Notification.created_at).where(Notification.user_id == user.id, Notification.kind == kind)
                         .order_by(Notification.created_at.desc()))
        if last and aware(last) > now() - every:
            return
    status = "skipped"
    if user.email and user.email_confirmed:
        status = _smtp(user.email, subject, body) if settings.smtp_host else "simulated"
    db.add(Notification(user_id=user.id, kind=kind, subject=subject, body=body, to_email=user.email, status=status))


def _smtp(to: str, subject: str, body: str) -> str:
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = settings.smtp_from, to, subject
    msg.set_content(body)
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as s:
            s.starttls()
            if settings.smtp_user:
                s.login(settings.smtp_user, settings.smtp_password)
            s.send_message(msg)
        return "sent"
    except Exception:
        log.exception("SMTP send failed")
        return "failed"
