"""Background work runs on a small in-process thread pool. That is enough for the pilot's volume;
if processing ever needs its own machine, only `submit` changes (e.g. to a Celery queue)."""
import logging
import os
from concurrent.futures import ThreadPoolExecutor

log = logging.getLogger("aq.tasks")
_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="aq-task")
_INLINE = os.environ.get("AQ_TASKS_INLINE") == "1"  # tests run jobs synchronously


def submit(fn, *args) -> None:
    if _INLINE:
        fn(*args)
        return

    def run():
        try:
            fn(*args)
        except Exception:
            log.exception("background task %s failed", getattr(fn, "__name__", fn))

    _pool.submit(run)
