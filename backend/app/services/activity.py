from sqlalchemy.orm import Session

from ..models import ActivityEvent


def log(db: Session, kind: str, message: str, actor_id: int | None = None,
        program: str | None = None, course_id: int | None = None, sandbox: bool = False) -> None:
    db.add(ActivityEvent(kind=kind, message=message, actor_id=actor_id, program=program, course_id=course_id,
                         sandbox=sandbox))
