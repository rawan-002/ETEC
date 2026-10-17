from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Runtime configuration. Dev defaults run with no external services;
    production points the same code at PostgreSQL, S3/MinIO and SMTP."""

    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", env_prefix="AQ_", extra="ignore")

    database_url: str = f"sqlite:///{BASE_DIR / 'data' / 'aq.db'}"
    secret_key: str = "dev-only-change-me"
    session_days: int = 30

    # Storage: "local" keeps files under data/files; "s3" uses MinIO or any S3-compatible store.
    storage_backend: str = "local"
    local_storage_dir: Path = BASE_DIR / "data" / "files"
    s3_endpoint: str = ""
    s3_bucket: str = "aq-documents"
    s3_access_key: str = ""
    s3_secret_key: str = ""

    # Email: with no SMTP host, reminders are recorded as "simulated" in the outbox.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "quality-platform@bu.edu.sa"

    # Upload limits
    max_upload_mb: int = 200
    max_archive_entries: int = 500
    max_archive_total_mb: int = 1024

    # Dean PIN lockout
    pin_max_attempts: int = 5
    pin_lock_minutes: int = 15

    # Classification below this confidence goes to the project team review queue.
    review_threshold: float = 0.6

    # Background reminder loop (dev); production uses the scheduled worker.
    reminder_loop_minutes: int = 60

    frontend_origin: str = "http://localhost:3000"


settings = Settings()
