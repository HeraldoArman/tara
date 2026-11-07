"""Durable capability-scoped phone cameras.

Revision ID: 0003_camera_pairings
Revises: 0002_media_evidence
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0003_camera_pairings"
down_revision: str | Sequence[str] | None = "0002_media_evidence"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "camera_pairings",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("org_id", sa.String(36), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("run_id", sa.String(36), sa.ForeignKey("runs.id"), nullable=False),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("secret_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_camera_pairings_org_id", "camera_pairings", ["org_id"])
    op.create_index("ix_camera_pairings_run_id", "camera_pairings", ["run_id"])
    op.create_index(
        "one_current_camera_pairing_per_run",
        "camera_pairings",
        ["run_id"],
        unique=True,
        postgresql_where=sa.text("revoked_at IS NULL"),
        sqlite_where=sa.text("revoked_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("one_current_camera_pairing_per_run", table_name="camera_pairings")
    op.drop_index("ix_camera_pairings_run_id", table_name="camera_pairings")
    op.drop_index("ix_camera_pairings_org_id", table_name="camera_pairings")
    op.drop_table("camera_pairings")
