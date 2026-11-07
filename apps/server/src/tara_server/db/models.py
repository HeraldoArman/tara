import uuid
from datetime import UTC, datetime
from typing import Any, cast

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
    func,
    literal_column,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def uid() -> str:
    return str(uuid.uuid4())


def now() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class Record:
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Organization(Record, Base):
    __tablename__ = "organizations"
    name: Mapped[str] = mapped_column(String(200))


class User(Record, Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("org_id", "username"),)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    username: Mapped[str] = mapped_column(String(100), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    password_hash: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(30))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class SOP(Record, Base):
    __tablename__ = "sops"
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    key: Mapped[str] = mapped_column(String(100))
    title: Mapped[str] = mapped_column(String(300))


class SOPDocument(Record, Base):
    __tablename__ = "sop_documents"
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    filename: Mapped[str] = mapped_column(String(300))
    object_key: Mapped[str] = mapped_column(Text)
    sha256: Mapped[str] = mapped_column(String(64))
    sections: Mapped[list] = mapped_column(JSON)


class SOPVersion(Record, Base):
    __tablename__ = "sop_versions"
    __table_args__ = (UniqueConstraint("sop_id", "version_number"),)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    sop_id: Mapped[str] = mapped_column(ForeignKey("sops.id"))
    document_id: Mapped[str | None] = mapped_column(ForeignKey("sop_documents.id"))
    version_number: Mapped[int] = mapped_column(Integer)
    version: Mapped[str] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(20), default="draft")
    definition: Mapped[dict] = mapped_column(JSON)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class SOPChunk(Record, Base):
    __tablename__ = "sop_chunks"
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    version_id: Mapped[str] = mapped_column(ForeignKey("sop_versions.id"), index=True)
    heading: Mapped[str] = mapped_column(Text)
    page: Mapped[int | None] = mapped_column(Integer)
    content: Mapped[str] = mapped_column(Text)
    media_ids: Mapped[list] = mapped_column(JSON, default=list)


Index(
    "sop_chunks_search_idx",
    func.setweight(
        func.to_tsvector(literal_column("'english'::regconfig"), SOPChunk.heading),
        literal_column("'A'"),
    ).op("||")(
        func.setweight(
            func.to_tsvector(literal_column("'english'::regconfig"), SOPChunk.content),
            literal_column("'B'"),
        )
    ),
    postgresql_using="gin",
    _table=cast(Table, SOPChunk.__table__),
).ddl_if(dialect="postgresql")


class WorkOrder(Record, Base):
    __tablename__ = "work_orders"
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    reference: Mapped[str] = mapped_column(String(100))
    title: Mapped[str] = mapped_column(String(300))
    model: Mapped[str] = mapped_column(String(200))
    serial: Mapped[str] = mapped_column(String(200))
    issue: Mapped[str] = mapped_column(Text)
    priority: Mapped[str] = mapped_column(String(20), default="standard")
    status: Mapped[str] = mapped_column(String(30), default="queued")
    assigned_to: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    sop_version_id: Mapped[str] = mapped_column(ForeignKey("sop_versions.id"))
    estimated_minutes: Mapped[int] = mapped_column(Integer, default=20)


class Part(Record, Base):
    __tablename__ = "parts"
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    sku: Mapped[str] = mapped_column(String(100))
    name: Mapped[str] = mapped_column(String(300))
    stock: Mapped[int] = mapped_column(Integer)
    location: Mapped[str] = mapped_column(String(200))
    price_cents: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="USD")


class Run(Record, Base):
    __tablename__ = "runs"
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    work_order_id: Mapped[str] = mapped_column(ForeignKey("work_orders.id"), index=True)
    technician_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    sop_version_id: Mapped[str] = mapped_column(ForeignKey("sop_versions.id"))
    status: Mapped[str] = mapped_column(String(20), default="active")
    version: Mapped[int] = mapped_column(Integer, default=1)
    current_step_id: Mapped[str | None] = mapped_column(String(100))
    interaction_mode: Mapped[str] = mapped_column(String(20), default="silent")
    active_seconds: Mapped[int] = mapped_column(Integer, default=0)
    resumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=now)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __mapper_args__ = {"version_id_col": version, "version_id_generator": False}


Index(
    "one_resumable_run_per_work_order",
    Run.work_order_id,
    unique=True,
    postgresql_where=text("status IN ('active','paused')"),
    sqlite_where=text("status IN ('active','paused')"),
)


class CameraPairing(Record, Base):
    __tablename__ = "camera_pairings"
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id"), index=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    secret_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


Index(
    "one_current_camera_pairing_per_run",
    CameraPairing.run_id,
    unique=True,
    postgresql_where=text("revoked_at IS NULL"),
    sqlite_where=text("revoked_at IS NULL"),
)


class RunStep(Record, Base):
    __tablename__ = "run_steps"
    __table_args__ = (UniqueConstraint("run_id", "step_id"),)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id"), index=True)
    step_id: Mapped[str] = mapped_column(String(100))
    display_order: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(30), default="locked")
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class StepAttempt(Record, Base):
    __tablename__ = "step_attempts"
    __table_args__ = (UniqueConstraint("run_step_id", "number"),)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id"), index=True)
    run_step_id: Mapped[str] = mapped_column(ForeignKey("run_steps.id"))
    number: Mapped[int] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String(30))
    outcome: Mapped[str] = mapped_column(String(30))
    result: Mapped[dict] = mapped_column(JSON)
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))


class Evidence(Record, Base):
    __tablename__ = "evidence"
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id"), index=True)
    step_id: Mapped[str] = mapped_column(String(100))
    attempt_id: Mapped[str] = mapped_column(ForeignKey("step_attempts.id"))
    object_key: Mapped[str] = mapped_column(Text)
    sha256: Mapped[str] = mapped_column(String(64))
    media_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(Integer)
    accepted: Mapped[bool] = mapped_column(Boolean)
    source: Mapped[str] = mapped_column(String(40), default="live_camera")
    model: Mapped[str] = mapped_column(String(100))
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    assessment_id: Mapped[str | None] = mapped_column(String(200))
    correlation_id: Mapped[str | None] = mapped_column(String(100))
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Deviation(Record, Base):
    __tablename__ = "deviations"
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id"), index=True)
    step_id: Mapped[str | None] = mapped_column(String(100))
    attempt_id: Mapped[str | None] = mapped_column(ForeignKey("step_attempts.id"))
    kind: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(20), default="warning")
    status: Mapped[str] = mapped_column(String(30), default="open")
    resolution: Mapped[str | None] = mapped_column(Text)


class Escalation(Record, Base):
    __tablename__ = "escalations"
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id"), index=True)
    step_id: Mapped[str | None] = mapped_column(String(100))
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), default="open")
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    resolved_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    resolution: Mapped[str | None] = mapped_column(Text)


class AuditEvent(Record, Base):
    __tablename__ = "audit_events"
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    run_id: Mapped[str | None] = mapped_column(ForeignKey("runs.id"), index=True)
    event_type: Mapped[str] = mapped_column(String(100))
    actor_id: Mapped[str] = mapped_column(String(100))
    actor_role: Mapped[str] = mapped_column(String(30))
    payload: Mapped[dict] = mapped_column(JSON)
    correlation_id: Mapped[str] = mapped_column(String(100), default=uid)


class Alert(Record, Base):
    __tablename__ = "alerts"
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id"), index=True)
    event_id: Mapped[str] = mapped_column(ForeignKey("audit_events.id"))
    step_id: Mapped[str | None] = mapped_column(String(100))
    attempt_id: Mapped[str | None] = mapped_column(ForeignKey("step_attempts.id"))
    message: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(30), default="pending")
    fingerprint: Mapped[str] = mapped_column(String(100))


class IdempotencyRecord(Record, Base):
    __tablename__ = "idempotency_records"
    __table_args__ = (UniqueConstraint("run_id", "key"),)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id"))
    key: Mapped[str] = mapped_column(String(100))
    command_hash: Mapped[str] = mapped_column(String(64))
    response: Mapped[dict] = mapped_column(JSON)


class Report(Record, Base):
    __tablename__ = "reports"
    __table_args__ = (UniqueConstraint("run_id", "revision"),)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id"), index=True)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    outcome: Mapped[str] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(30), default="submitted")
    snapshot: Mapped[dict] = mapped_column(JSON)
    digest: Mapped[str] = mapped_column(String(64))


class ReportReview(Record, Base):
    __tablename__ = "report_reviews"
    report_id: Mapped[str] = mapped_column(ForeignKey("reports.id"), index=True)
    reviewer_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    decision: Mapped[str] = mapped_column(String(30))
    note: Mapped[str] = mapped_column(Text)


class TranscriptTurn(Record, Base):
    __tablename__ = "transcript_turns"
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id"), index=True)
    role: Mapped[str] = mapped_column(String(30))
    content: Mapped[str] = mapped_column(Text)
    mode: Mapped[str] = mapped_column(String(30))
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)


class ToolCall(Record, Base):
    __tablename__ = "tool_calls"
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    duration_ms: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(30))
    sanitized_arguments: Mapped[dict] = mapped_column(JSON, default=dict)
    result: Mapped[dict] = mapped_column(JSON, default=dict)


class AgentOutput(Record, Base):
    __tablename__ = "agent_outputs"
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id"), index=True)
    mode: Mapped[str] = mapped_column(String(30))
    alert_id: Mapped[str | None] = mapped_column(ForeignKey("alerts.id"))
    content: Mapped[str] = mapped_column(Text)
    speech_status: Mapped[str] = mapped_column(String(30))
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class SOPMedia(Record, Base):
    __tablename__ = "sop_media"
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    version_id: Mapped[str] = mapped_column(ForeignKey("sop_versions.id"), index=True)
    title: Mapped[str] = mapped_column(String(300))
    heading: Mapped[str] = mapped_column(String(300))
    page: Mapped[int | None] = mapped_column(Integer)
    object_key: Mapped[str] = mapped_column(Text)
    sha256: Mapped[str] = mapped_column(String(64))
    media_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(Integer)
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
