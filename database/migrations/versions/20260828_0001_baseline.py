"""Establish the empty schema baseline for future domain migrations.

Revision ID: 20260828_0001
Revises:
Create Date: 2026-08-28 00:00:00

No domain tables belong to M0. Alembic creates and maintains its own
alembic_version table when this revision is applied.
"""

from collections.abc import Sequence


# revision identifiers, used by Alembic.
revision: str = "20260828_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Record the M0 baseline without introducing domain schema."""


def downgrade() -> None:
    """Return to Alembic's unversioned state without dropping domain data."""
