from sqlalchemy.orm import Session

from ..models import Setting

DEFAULTS = {"deadline_days": "7", "reminder_every_days": "2", "reminders_enabled": "1"}


def get(db: Session, key: str) -> str:
    row = db.get(Setting, key)
    return row.value if row else DEFAULTS[key]


def get_int(db: Session, key: str, default: int) -> int:
    try:
        return int(get(db, key))
    except (KeyError, ValueError):
        return default


def put(db: Session, key: str, value: str) -> None:
    row = db.get(Setting, key)
    if row:
        row.value = value
    else:
        db.add(Setting(key=key, value=value))
