"""Private owner-scoped machine profiles, configurations, and causal receipts.

Revision ID: 20261009_0002
Revises: 20261009_0001

Additive migration. Never reinterpret a historical set's native load setting.
"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "20261009_0002"
down_revision: str | None = "20261009_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "machine_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("owner_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("nickname", sa.String(120), nullable=False),
        sa.Column("catalog_equipment_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("manufacturer", sa.String(120), nullable=True),
        sa.Column("model_name", sa.String(120), nullable=True),
        sa.Column("native_load_unit", sa.String(2), nullable=True),
        sa.Column("load_entry_semantics", sa.String(24), nullable=True),
        sa.Column("technical_metadata", postgresql.JSONB(), nullable=False),
        sa.Column("metadata_source", sa.String(24), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.CheckConstraint("length(trim(nickname)) > 0",
                           name="ck_machine_profiles_nickname"),
        sa.CheckConstraint("native_load_unit IS NULL OR native_load_unit IN ('kg', 'lb')",
                           name="ck_machine_profiles_native_unit"),
        sa.CheckConstraint(
            "load_entry_semantics IS NULL OR load_entry_semantics "
            "IN ('total', 'per_implement', 'machine_display', 'assistance')",
            name="ck_machine_profiles_entry_semantics",
        ),
        sa.CheckConstraint(
            "metadata_source IS NULL OR metadata_source "
            "IN ('user_entered', 'manufacturer_declared', 'curated')",
            name="ck_machine_profiles_provenance",
        ),
        sa.ForeignKeyConstraint(["owner_user_id"], ["application_users.id"],
                                ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["catalog_equipment_id"], ["catalog_equipment.id"],
                                ondelete="RESTRICT"),
        sa.UniqueConstraint("id", "owner_user_id",
                            name="uq_machine_profiles_id_owner"),
    )
    op.create_index("ix_machine_profiles_owner", "machine_profiles", ["owner_user_id"])
    op.create_table(
        "machine_configurations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("owner_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("machine_profile_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("label", sa.String(120), nullable=False),
        sa.Column("material_setup", postgresql.JSONB(), nullable=False),
        sa.Column("metadata_source", sa.String(24), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.CheckConstraint("length(trim(label)) > 0",
                           name="ck_machine_configurations_label"),
        sa.CheckConstraint(
            "metadata_source IS NULL OR metadata_source "
            "IN ('user_entered', 'manufacturer_declared', 'curated')",
            name="ck_machine_configurations_provenance",
        ),
        sa.ForeignKeyConstraint(
            ["machine_profile_id", "owner_user_id"],
            ["machine_profiles.id", "machine_profiles.owner_user_id"],
            ondelete="RESTRICT",
        ),
        sa.UniqueConstraint("id", "machine_profile_id", "owner_user_id",
                            name="uq_machine_configurations_profile_owner"),
    )
    op.create_index(
        "ix_machine_configurations_owner_profile",
        "machine_configurations", ["owner_user_id", "machine_profile_id"],
    )
    op.create_table(
        "machine_mutation_receipts",
        sa.Column("mutation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("owner_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("mutation_kind", sa.String(32), nullable=False),
        sa.Column("intent_hash", sa.String(64), nullable=False),
        sa.Column("response_payload", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.ForeignKeyConstraint(["owner_user_id"], ["application_users.id"],
                                ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("mutation_id", "owner_user_id"),
        sa.CheckConstraint(
            "mutation_kind IN ('CREATE_MACHINE_PROFILE', 'CREATE_MACHINE_CONFIGURATION')",
            name="ck_machine_mutation_receipts_kind",
        ),
    )

    # PostgreSQL composite keys prevent cross-owner or cross-profile references.
    op.create_foreign_key(
        "fk_workout_sets_machine_profile_owner",
        "workout_sets", "machine_profiles",
        ["machine_profile_id", "owner_user_id"],
        ["id", "owner_user_id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_workout_sets_machine_configuration_profile_owner",
        "workout_sets", "machine_configurations",
        ["machine_configuration_id", "machine_profile_id", "owner_user_id"],
        ["id", "machine_profile_id", "owner_user_id"],
        ondelete="RESTRICT",
    )
    op.create_check_constraint(
        "ck_workout_sets_machine_snapshot",
        "workout_sets",
        "machine_profile_id IS NULL OR machine_snapshot IS NOT NULL",
    )

    # Only the authenticated API is allowed to read or write these tables.
    for table in (
        "machine_profiles", "machine_configurations", "machine_mutation_receipts"
    ):
        op.execute(f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY")
        for role in ("anon", "authenticated", "service_role"):
            op.execute(
                f"DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{role}') "
                f"THEN EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public.{table} FROM {role}'; "
                "END IF; END $$;"
            )


def downgrade() -> None:
    raise NotImplementedError(
        "20261009_0002 contains account-owned workout machine data; roll forward"
    )
