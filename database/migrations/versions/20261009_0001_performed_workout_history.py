"""Add owner-scoped performed occurrences and sets without changing START data.

Revision ID: 20261009_0001
Revises: 20261008_0002

The actual history is client-ID based. Its first occurrence and first confirmed
set are committed atomically by the API transaction, not by an agenda selection.
Historical data is never dropped by an automated downgrade.
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "20261009_0001"
down_revision: str | None = "20261008_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "workout_occurrences",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("owner_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("canonical_exercise_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("agenda_item_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("actual_order", sa.Integer(), nullable=False),
        sa.Column("first_set_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.CheckConstraint("actual_order >= 0", name="ck_workout_occurrences_actual_order"),
        sa.ForeignKeyConstraint(
            ["session_id", "owner_user_id"],
            ["workout_sessions.id", "workout_sessions.owner_user_id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["canonical_exercise_id"],
            ["catalog_exercises.id"],
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint(
            "id", "session_id", "owner_user_id",
            name="uq_workout_occurrences_identity_session_owner",
        ),
        sa.UniqueConstraint(
            "owner_user_id", "first_set_id",
            name="uq_workout_occurrences_owner_first_set",
        ),
    )
    op.create_index(
        "ix_workout_occurrences_owner_session",
        "workout_occurrences", ["owner_user_id", "session_id"],
    )

    op.create_table(
        "workout_sets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("owner_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("occurrence_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("mutation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("set_role", sa.String(16), nullable=False),
        sa.Column("measurement_type", sa.String(16), nullable=False),
        sa.Column("reps", sa.Integer(), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("distance_value", sa.Numeric(12, 3), nullable=True),
        sa.Column("distance_unit", sa.String(4), nullable=True),
        sa.Column("load_value", sa.Numeric(12, 3), nullable=True),
        sa.Column("load_unit", sa.String(2), nullable=True),
        sa.Column("load_entry_semantics", sa.String(24), nullable=True),
        sa.Column("machine_profile_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("machine_configuration_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("machine_snapshot", postgresql.JSONB(), nullable=True),
        sa.Column("target_at_confirmation", postgresql.JSONB(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "set_role IN ('WARMUP', 'WORKING')",
            name="ck_workout_sets_role",
        ),
        sa.CheckConstraint(
            "(measurement_type = 'reps' AND reps > 0 AND duration_seconds IS NULL "
            "AND distance_value IS NULL AND distance_unit IS NULL) OR "
            "(measurement_type = 'time' AND reps IS NULL AND duration_seconds > 0 "
            "AND distance_value IS NULL AND distance_unit IS NULL) OR "
            "(measurement_type = 'distance' AND reps IS NULL AND duration_seconds IS NULL "
            "AND distance_value > 0 AND distance_unit IN ('m', 'km', 'mi'))",
            name="ck_workout_sets_measurement",
        ),
        sa.CheckConstraint(
            "(load_value IS NULL AND load_unit IS NULL AND load_entry_semantics IS NULL) "
            "OR (load_value >= 0 AND load_unit IN ('kg', 'lb') AND "
            "load_entry_semantics IN ('total', 'per_implement', 'machine_display', 'assistance'))",
            name="ck_workout_sets_load",
        ),
        sa.CheckConstraint(
            "(machine_profile_id IS NOT NULL OR machine_configuration_id IS NULL)",
            name="ck_workout_sets_configuration_needs_profile",
        ),
        sa.ForeignKeyConstraint(
            ["occurrence_id", "session_id", "owner_user_id"],
            ["workout_occurrences.id", "workout_occurrences.session_id",
             "workout_occurrences.owner_user_id"],
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint(
            "owner_user_id", "mutation_id",
            name="uq_workout_sets_owner_mutation",
        ),
    )
    op.create_index(
        "ix_workout_sets_owner_occurrence_completed",
        "workout_sets",
        ["owner_user_id", "occurrence_id", "completed_at"],
    )

    # Match START-session privacy: never publish workout history through Supabase
    # PostgREST roles; the JWT-authorized FastAPI service is the only writer.
    for table in ("workout_occurrences", "workout_sets"):
        op.execute(f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY")
        for role in ("anon", "authenticated", "service_role"):
            op.execute(
                f"DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{role}') "
                f"THEN EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public.{table} FROM {role}'; "
                "END IF; END $$;"
            )


def downgrade() -> None:
    raise NotImplementedError(
        "20261009_0001 contains account-owned performed workout data; roll forward"
    )
