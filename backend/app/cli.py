"""Admin commands:
  python -m app.cli init <users.xlsx>      create tables, load the CS plan, departments, term and users
  python -m app.cli set-password "<name or email>"  set a sign-in password (prompted, not echoed); needed for the dean
  python -m app.cli add-team "<name>"      add a project-team member to the pilot
  python -m app.cli add-tester "<name>" <email>   sandboxed tester; entering this email signs in directly
  python -m app.cli remind                 run the reminder job once
  python -m app.cli copy-from-sqlite [data\\aq.db]   copy a local SQLite database into the configured (empty) database
  python -m app.cli copy-files [data\\files]          upload locally stored files to the configured S3/R2 storage
"""
import getpass
import sys
from pathlib import Path

from sqlalchemy import create_engine, func, select, text

from .db import Base, SessionLocal, create_schema, engine
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
        elif cmd == "set-password":
            # An email also works: Windows consoles can reverse Arabic text typed or pasted into them.
            key = args[0].strip()
            user = db.scalar(select(User).where(User.email == key.lower() if "@" in key else User.name == key))
            if not user:
                sys.exit(f"no user named {args[0]!r}")
            pw = getpass.getpass("Password (8+ characters): ")
            if len(pw) < 8 or pw != getpass.getpass("Repeat: "):
                sys.exit("password must be 8+ characters, the same twice")
            user.pin_hash, user.failed_pin_attempts, user.locked_until = hash_pin(pw), 0, None
            print("password set for", user.name)
        elif cmd == "add-team":
            user = db.scalar(select(User).where(User.name == args[0])) or User(name=args[0])
            user.role, user.in_pilot, user.active = TEAM, True, True
            db.add(user)
            print("team member:", user.name)
        elif cmd == "add-tester":
            user = db.scalar(select(User).where(User.name == args[0])) or User(name=args[0])
            user.role, user.is_tester, user.in_pilot, user.active = FACULTY, True, True, True
            user.email = args[1].strip().lower()
            user.pin_hash = None
            db.add(user)
            print("tester:", user.name)
        elif cmd == "remind":
            print(run_reminders(db))
        elif cmd == "copy-from-sqlite":
            copy_from_sqlite(Path(args[0]) if args else Path(__file__).resolve().parent.parent / "data" / "aq.db")
        elif cmd == "copy-files":
            copy_files(Path(args[0]) if args else Path(__file__).resolve().parent.parent / "data" / "files")
        else:
            print(__doc__)
            return
        db.commit()
    finally:
        db.close()


def copy_from_sqlite(src_path: Path) -> None:
    """Row-for-row copy, parents before children; ids are kept so links between tables survive."""
    if not src_path.exists():
        sys.exit(f"no such file: {src_path}")
    src = create_engine(f"sqlite:///{src_path}")
    if engine.url.drivername.startswith("sqlite") and Path(engine.url.database).resolve() == src_path.resolve():
        sys.exit("the configured database is the source itself; set AQ_DATABASE_URL to the target first")
    tables = Base.metadata.sorted_tables
    with engine.connect() as dst:
        if any(dst.scalar(select(func.count()).select_from(t)) for t in tables):
            sys.exit("the target database already has data; copy only into an empty database")
    with src.connect() as s, engine.begin() as dst:
        for t in tables:
            rows = [dict(r._mapping) for r in s.execute(select(t))]
            if rows:
                dst.execute(t.insert(), rows)
            print(f"{t.name}: {len(rows)}")
        if engine.dialect.name == "postgresql":
            # Rows were inserted with explicit ids, so move each id sequence past the highest copied id.
            for t in tables:
                if "id" in t.c:
                    dst.execute(text(f"SELECT setval(pg_get_serial_sequence('{t.name}', 'id'), "
                                     f"COALESCE((SELECT MAX(id) FROM {t.name}), 0) + 1, false)"))


def copy_files(root: Path) -> None:
    """Keys are the paths under data/files (content-addressed), so the same key works in either store."""
    from .config import settings
    from .services.storage import storage

    if settings.storage_backend != "s3":
        sys.exit("set AQ_STORAGE_BACKEND=s3 and the AQ_S3_* settings first")
    paths = [p for p in root.rglob("*") if p.is_file()]
    for i, p in enumerate(paths, 1):
        storage.put(p.relative_to(root).as_posix(), p.read_bytes())
        print(f"{i}/{len(paths)} {p.relative_to(root).as_posix()}")


if __name__ == "__main__":
    main(sys.argv[1:])
