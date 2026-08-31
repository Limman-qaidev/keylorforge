"""Add the editable application-owned profile display name.

Revision ID: 20260831_0001
Revises: 20260829_0001
Create Date: 2026-08-31 00:00:00

The nullable column is additive and leaves every existing and newly provisioned
profile without a display name until the caller explicitly supplies one. The
application identity tables are also restricted to the FastAPI database role:
Supabase Data API roles receive no table privileges and no RLS policies.
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260831_0001"
down_revision: str | None = "20260829_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add display-name storage and restrict direct Data API table access."""
    op.add_column(
        "application_user_profiles",
        sa.Column("display_name", sa.String(length=80), nullable=True),
    )
    for table_name in (
        "application_users",
        "application_user_identities",
        "application_user_profiles",
    ):
        op.execute(f"ALTER TABLE public.{table_name} ENABLE ROW LEVEL SECURITY")
        for role_name in ("anon", "authenticated", "service_role"):
            op.execute(
                f"DO $$ BEGIN "
                f"IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{role_name}') "
                f"THEN EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE public.{table_name} FROM {role_name}'; "
                f"END IF; END $$;"
            )


def downgrade() -> None:
    """Remove the additive column while retaining restrictive table controls.

    Prior grants cannot be safely reconstructed, so a separate reviewed
    migration is required if an environment must restore direct table access.
    """
    op.drop_column("application_user_profiles", "display_name")
