"""Append-only owner-scoped workout exercise notes.

Revision ID: 20261023_0001
Revises: 20261009_0003
No performed work, completion snapshot or prior note is rewritten.
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "20261023_0001"
down_revision: str | None = "20261009_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "workout_exercise_note_events",
        sa.Column("note_event_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("owner_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("occurrence_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("canonical_exercise_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("body", sa.String(length=1000), nullable=False),
        sa.Column("created_at_utc", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "accepted_at_utc",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("note_event_id", "owner_user_id"),
        sa.ForeignKeyConstraint(
            ["owner_user_id"], ["application_users.id"], ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["canonical_exercise_id"], ["catalog_exercises.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["occurrence_id", "session_id", "owner_user_id"],
            ["workout_occurrences.id", "workout_occurrences.session_id",
             "workout_occurrences.owner_user_id"],
            ondelete="RESTRICT",
        ),
        sa.CheckConstraint(
            "char_length(body) BETWEEN 1 AND 1000",
            name="ck_workout_exercise_note_events_body_length",
        ),
    )
    op.create_index(
        "ix_workout_notes_owner_exercise_created",
        "workout_exercise_note_events",
        ["owner_user_id", "canonical_exercise_id", "created_at_utc", "note_event_id"],
    )
    op.create_index(
        "ix_workout_notes_owner_session_created",
        "workout_exercise_note_events",
        ["owner_user_id", "session_id", "created_at_utc", "note_event_id"],
    )
    op.execute(
        "ALTER TABLE public.workout_exercise_note_events ENABLE ROW LEVEL SECURITY"
    )
    for role in ("anon", "authenticated", "service_role"):
        op.execute(
            f"DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{role}') "
            "THEN EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE "
            f"public.workout_exercise_note_events FROM {role}'; "
            "END IF; END $$;"
        )


def downgrade() -> None:
    raise NotImplementedError(
        "Immutable exercise notes cannot be dropped; roll forward."
    )
