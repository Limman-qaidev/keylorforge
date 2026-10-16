"""Immutable, owner-scoped completed Free Workout snapshots.

Revision ID: 20261009_0003
Revises: 20261009_0002

Additive migration, never modifies existing session or performed-set rows.
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "20261009_0003"
down_revision: str | None = "20261009_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "workout_completion_snapshots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("owner_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("finish_mutation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("final_agenda", postgresql.JSONB(), nullable=False),
        sa.ForeignKeyConstraint(
            ["session_id", "owner_user_id"],
            ["workout_sessions.id", "workout_sessions.owner_user_id"],
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint("session_id"),
        sa.UniqueConstraint(
            "owner_user_id", "finish_mutation_id",
            name="uq_workout_completion_owner_finish_mutation",
        ),
    )
    op.create_index(
        "ix_workout_completion_owner_finished",
        "workout_completion_snapshots",
        ["owner_user_id", "finished_at"],
    )
    # Personal workout data may only be accessed through authenticated FastAPI.
    op.execute(
        "ALTER TABLE public.workout_completion_snapshots ENABLE ROW LEVEL SECURITY"
    )
    for role in ("anon", "authenticated", "service_role"):
        op.execute(
            f"DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{role}') "
            "THEN EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "
            f"public.workout_completion_snapshots FROM {role}'; "
            "END IF; END $$;"
        )


def downgrade() -> None:
    raise NotImplementedError(
        "20261009_0003 contains account-owned workout completion history; roll forward"
    )
