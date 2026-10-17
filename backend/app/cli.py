"""Admin commands:
  python -m app.cli init <users.xlsx>      create tables, load the CS plan, departments, term and users
  python -m app.cli set-pin "<name>"       set a 6-digit PIN (prompted, not echoed)
  python -m app.cli add-team "<name>"      add a project-team member to the pilot
  python -m app.cli add-tester "<name>" <email>   sandboxed project-team tester (faculty view, PIN prompted)
  python -m app.cli remind                 run the reminder job once
"""
import getpass
import sys

from sqlalchemy import select

from .db import SessionLocal, create_schema
from .models import FACULTY, TEAM, User
from .security import hash_pin
from .seed_data import import_users_workbook, seed_departments, seed_plan, seed_term
from .services.reminders import run_reminders


def main(argv: list[str]) -> None:
    if not argv:
        print(__doc__)
        return
    cmd, args = argv[0], argv[1:]
    create_schema()
    db = SessionLocal()
    try:
        if cmd == "init":
            seed_departments(db)
            print("courses added:", seed_plan(db))
            print("active term:", seed_term(db).code)
            if args:
                print("users:", import_users_workbook(db, args[0]))
        elif cmd == "set-pin":
            user = db.scalar(select(User).where(User.name == args[0]))
            if not user:
                sys.exit(f"no user named {args[0]!r}")
            pin = getpass.getpass("PIN (6 digits): ")
            if not (pin.isdigit() and len(pin) == 6) or pin != getpass.getpass("Repeat: "):
                sys.exit("PIN must be the same 6 digits twice")
            user.pin_hash, user.failed_pin_attempts, user.locked_until = hash_pin(pin), 0, None
            print("PIN set for", user.name)
        elif cmd == "add-team":
            user = db.scalar(select(User).where(User.name == args[0])) or User(name=args[0])
            user.role, user.in_pilot, user.active = TEAM, True, True
            db.add(user)
            print("team member:", user.name)
        elif cmd == "add-tester":
            user = db.scalar(select(User).where(User.name == args[0])) or User(name=args[0])
            pin = getpass.getpass("Code (4-12 characters): ")
            if not 4 <= len(pin) <= 12 or pin != getpass.getpass("Repeat: "):
                sys.exit("code must be 4-12 characters, the same twice")
            user.role, user.is_tester, user.in_pilot, user.active = FACULTY, True, True, True
            user.email = args[1] if len(args) > 1 else user.email
            user.pin_hash, user.failed_pin_attempts, user.locked_until = hash_pin(pin), 0, None
            db.add(user)
            print("tester:", user.name)
        elif cmd == "remind":
            print(run_reminders(db))
        else:
            print(__doc__)
            return
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main(sys.argv[1:])
