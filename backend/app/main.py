import logging
import threading
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI

from .config import settings
from .db import SessionLocal, create_schema
from .routers import auth, courses, management
from .services import settings_store
from .services.reminders import run_reminders

log = logging.getLogger("aq")


def _reminder_loop(stop: threading.Event) -> None:
    """Hourly check; run_reminders itself decides who is due (every N days, stops when complete)."""
    while not stop.wait(settings.reminder_loop_minutes * 60):
        db = SessionLocal()
        try:
            if settings_store.get(db, "reminders_enabled") == "1":
                run_reminders(db)
        except Exception:
            log.exception("reminder loop failed")
        finally:
            db.close()


@asynccontextmanager
async def lifespan(_: FastAPI):
    create_schema()
    stop = threading.Event()
    threading.Thread(target=_reminder_loop, args=(stop,), daemon=True).start()
    yield
    stop.set()


app = FastAPI(title="منصة الجودة الأكاديمية الذكية", lifespan=lifespan)
app.include_router(auth.router)
app.include_router(courses.router)
app.include_router(management.router)


@app.get("/api/health")
def health():
    return {"ok": True, "time": time.time()}
