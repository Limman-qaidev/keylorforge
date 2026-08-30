"""Add the application-owned identity and profile foundation.

Revision ID: 20260829_0001
Revises: 20260828_0001
Create Date: 2026-08-29 00:00:00

This revision intentionally keeps Supabase Auth outside the application schema.
Application identities retain terminal rows so an old, otherwise valid provider
subject cannot be silently reprovisioned after account deletion.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "20260829_0001"
down_revision: str | None = "20260828_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create application-owned user, provider identity and profile tables."""
    op.create_table(
        "application_users",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "lifecycle_state",
            sa.String(length=32),
            nullable=False,
            server_default=sa.text("'active'"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "(lifecycle_state IN ('active', 'deletion_in_progress') AND deleted_at IS NULL) "
            "OR (lifecycle_state = 'deleted' AND deleted_at IS NOT NULL)",
            name="application_user_lifecycle_consistency",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "application_user_identities",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("auth_provider", sa.String(length=32), nullable=False),
        sa.Column("external_subject", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.CheckConstraint(
            "auth_provider = 'supabase'", name="application_user_identity_supported_provider"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["application_users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("user_id", "auth_provider", "external_subject"),
        sa.UniqueConstraint("auth_provider", "external_subject"),
    )
    op.create_table(
        "application_user_profiles",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["application_users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("user_id"),
    )


def downgrade() -> None:
    """Preserve identity records; rollback requires a reviewed forward fix."""
    raise NotImplementedError(
        "20260829_0001 stores identity data and must be rolled forward, not dropped"
    )
