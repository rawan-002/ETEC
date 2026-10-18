from pathlib import Path

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Runtime configuration. Dev defaults run with no external services;
    production points the same code at PostgreSQL, S3/MinIO and SMTP."""

    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", env_prefix="AQ_", extra="ignore")

    database_url: str = f"sqlite:///{BASE_DIR / 'data' / 'aq.db'}"
    secret_key: str = "dev-only-change-me"
    session_days: int = 30

    @field_validator("database_url")
    @classmethod
    def _psycopg_driver(cls, v: str) -> str:
        # Hosted Postgres (e.g. Neon) hands out postgres:// or postgresql:// URLs; SQLAlchemy needs the driver named.
        for prefix in ("postgres://", "postgresql://"):
            if v.startswith(prefix):
                return "postgresql+psycopg://" + v[len(prefix):]
        return v

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

    # Claude second opinion for files the rules cannot settle. Read from ANTHROPIC_API_KEY.
    anthropic_api_key: str = Field(default="", validation_alias=AliasChoices("ANTHROPIC_API_KEY", "AQ_ANTHROPIC_API_KEY"))
    ai_enabled: bool = True
    ai_model: str = "claude-opus-5-5"
    ai_accept_confidence: float = 0.7


settings = Settings()
