import os
import sys
import tempfile
from pathlib import Path

_tmp = tempfile.mkdtemp(prefix="aq-test-")
os.environ["AQ_DATABASE_URL"] = f"sqlite:///{Path(_tmp) / 'test.db'}"
os.environ["AQ_LOCAL_STORAGE_DIR"] = str(Path(_tmp) / "files")
os.environ["AQ_TASKS_INLINE"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import DEAN, FACULTY, HEAD, TEAM, Department, User  # noqa: E402
from app.security import hash_pin  # noqa: E402
from app.seed_data import seed_departments, seed_plan, seed_term  # noqa: E402


@pytest.fixture()
def db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    s = SessionLocal()
    seed_departments(s)
    seed_plan(s)
    seed_term(s)
    cs = s.query(Department).filter_by(program_code="CS").one()
    se = s.query(Department).filter_by(program_code="SE").one()
    s.add_all([
        User(name="العميد", role=DEAN, in_pilot=True, department=cs, pin_hash=hash_pin("123456"), email="dean@bu.edu.sa"),
        User(name="رئيس CS", role=HEAD, in_pilot=True, department=cs, email="head@bu.edu.sa"),
        User(name="رئيس SE", role=HEAD, in_pilot=True, department=se, email="sehead@bu.edu.sa"),
        User(name="أستاذ أ", role=FACULTY, in_pilot=True, department=cs, email="a@bu.edu.sa"),
        User(name="أستاذ ب", role=FACULTY, in_pilot=True, department=cs, email="b@bu.edu.sa"),
        User(name="فريق", role=TEAM, in_pilot=True),
    ])
    s.commit()
    yield s
    s.close()


@pytest.fixture()
def client(db):
    return TestClient(app)


def login(client, db, name, pin=None):
    uid = db.query(User).filter_by(name=name).one().id
    r = client.post("/api/auth/login", json={"user_id": uid, "pin": pin})
    assert r.status_code == 200, r.text
    return client
