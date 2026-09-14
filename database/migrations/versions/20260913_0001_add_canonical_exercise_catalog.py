"""Add the application-owned canonical exercise catalogue.

Revision ID: 20260913_0001
Revises: 20260831_0001
Create Date: 2026-09-13 00:00:00

Catalogue rows are persistent curated data. Downgrading by dropping them would
silently destroy imported and subsequently curated records, so rollback follows
the project's forward-fix policy.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "20260913_0001"
down_revision: str | None = "20260831_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create normalized catalogue tables without direct Supabase Data API access."""
    op.create_table(
        "catalog_exercises",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source", sa.String(length=80), nullable=False),
        sa.Column("source_id", sa.String(length=80), nullable=False),
        sa.Column("measurement_type", sa.String(length=16), nullable=False),
        sa.Column("difficulty_level", sa.String(length=32)),
        sa.Column("force_type", sa.String(length=32)),
        sa.Column("mechanics", sa.String(length=32)),
        sa.Column("category", sa.String(length=64)),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_curated", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.CheckConstraint("measurement_type IN ('reps', 'time', 'distance')", name="catalog_exercise_measurement_type"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source", "source_id"),
    )
    op.create_index("ix_catalog_exercises_active_category", "catalog_exercises", ["is_active", "category"])
    op.create_table(
        "catalog_muscles",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source", sa.String(length=80), nullable=False),
        sa.Column("source_id", sa.String(length=80), nullable=False),
        sa.Column("slug", sa.String(length=80), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source", "source_id", name="uq_catalog_muscles_source_source_id"),
        sa.UniqueConstraint("source", "slug", name="uq_catalog_muscles_source_slug"),
    )
    op.create_table(
        "catalog_equipment",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source", sa.String(length=80), nullable=False),
        sa.Column("source_id", sa.String(length=80), nullable=False),
        sa.Column("equipment_type", sa.String(length=32)),
        sa.Column("usage_type", sa.String(length=32)),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source", "source_id"),
    )
    op.create_table(
        "catalog_exercise_names",
        sa.Column("exercise_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("locale", sa.String(length=10), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.ForeignKeyConstraint(["exercise_id"], ["catalog_exercises.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("exercise_id", "locale"),
        sa.UniqueConstraint("exercise_id", "locale"),
    )
    op.create_index("ix_catalog_exercise_names_locale_name", "catalog_exercise_names", ["locale", "name"])
    op.create_table(
        "catalog_muscle_names",
        sa.Column("muscle_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("locale", sa.String(length=10), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.ForeignKeyConstraint(["muscle_id"], ["catalog_muscles.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("muscle_id", "locale"),
        sa.UniqueConstraint("muscle_id", "locale"),
    )
    op.create_table(
        "catalog_equipment_names",
        sa.Column("equipment_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("locale", sa.String(length=10), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.ForeignKeyConstraint(["equipment_id"], ["catalog_equipment.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("equipment_id", "locale"),
        sa.UniqueConstraint("equipment_id", "locale"),
    )
    op.create_table(
        "catalog_exercise_muscles",
        sa.Column("exercise_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("muscle_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.CheckConstraint("role IN ('primary', 'secondary', 'tertiary')", name="catalog_exercise_muscle_role"),
        sa.ForeignKeyConstraint(["exercise_id"], ["catalog_exercises.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["muscle_id"], ["catalog_muscles.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("exercise_id", "muscle_id"),
    )
    op.create_index("ix_catalog_exercise_muscles_muscle_id", "catalog_exercise_muscles", ["muscle_id"])
    op.create_table(
        "catalog_exercise_equipment",
        sa.Column("exercise_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("equipment_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(["exercise_id"], ["catalog_exercises.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["equipment_id"], ["catalog_equipment.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("exercise_id", "equipment_id"),
    )
    op.create_index("ix_catalog_exercise_equipment_equipment_id", "catalog_exercise_equipment", ["equipment_id"])

    for table_name in (
        "catalog_exercises", "catalog_muscles", "catalog_equipment", "catalog_exercise_names",
        "catalog_muscle_names", "catalog_equipment_names", "catalog_exercise_muscles",
        "catalog_exercise_equipment",
    ):
        op.execute(f"ALTER TABLE public.{table_name} ENABLE ROW LEVEL SECURITY")
        for role_name in ("anon", "authenticated", "service_role"):
            op.execute(
                f"DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{role_name}') "
                f"THEN EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public.{table_name} FROM {role_name}'; "
                "END IF; END $$;"
            )


def downgrade() -> None:
    """Refuse a rollback that would discard persistent catalogue data."""
    raise NotImplementedError(
        "20260913_0001 stores catalogue data and must be rolled forward, not dropped"
    )
