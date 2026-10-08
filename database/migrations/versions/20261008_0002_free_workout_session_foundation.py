"""Create private owner-scoped Free Workout sessions and durable START receipts.

Revision ID: 20261008_0002
Revises: 20261008_0001

Additive and forward-only: historical workout sessions and idempotency receipts
must never be dropped by an automatic downgrade. M3 account deletion purges
both personal tables by owner before deleting the external provider identity.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "20261008_0002"
down_revision: str | None = "20261008_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "workout_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("owner_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("origin", sa.String(16), nullable=False),
        sa.Column("lifecycle_state", sa.String(16), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("time_zone", sa.String(64), nullable=False),
        sa.Column("utc_offset_minutes", sa.Integer(), nullable=False),
        sa.Column("local_date", sa.Date(), nullable=False),
        sa.Column("start_prescription", postgresql.JSONB(), nullable=False),
        sa.Column("agenda_revision", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.CheckConstraint("origin = 'free'", name="ck_workout_sessions_workout_session_supported_origin"),
        sa.CheckConstraint("lifecycle_state IN ('active', 'completed', 'cancelled')", name="ck_workout_sessions_workout_session_lifecycle"),
        sa.CheckConstraint("utc_offset_minutes BETWEEN -840 AND 840", name="ck_workout_sessions_workout_session_utc_offset"),
        sa.CheckConstraint("agenda_revision >= 0", name="ck_workout_sessions_workout_session_agenda_revision"),
        sa.ForeignKeyConstraint(["owner_user_id"], ["application_users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id", "owner_user_id", name="uq_workout_sessions_id_owner"),
    )
    op.create_index(
        "ix_workout_sessions_one_active_per_owner",
        "workout_sessions", ["owner_user_id"], unique=True,
        postgresql_where=sa.text("lifecycle_state = 'active'"),
    )
    op.create_index(
        "ix_workout_sessions_owner_started", "workout_sessions",
        ["owner_user_id", "started_at"],
    )
    op.create_table(
        "workout_mutation_receipts",
        sa.Column("mutation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("owner_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("intent_hash", sa.String(64), nullable=False),
        sa.Column("response_payload", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.ForeignKeyConstraint(["owner_user_id"], ["application_users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["session_id", "owner_user_id"],
            ["workout_sessions.id", "workout_sessions.owner_user_id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("mutation_id", "owner_user_id"),
    )
    for table in ("workout_sessions", "workout_mutation_receipts"):
        op.execute(f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY")
        for role in ("anon", "authenticated", "service_role"):
            op.execute(
                f"DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{role}') "
                f"THEN EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public.{table} FROM {role}'; "
                "END IF; END $$;"
            )


def downgrade() -> None:
    raise NotImplementedError(
        "20261008_0002 contains account-owned workout history; roll forward"
    )
