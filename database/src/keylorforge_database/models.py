"""Shared SQLAlchemy metadata and application-identity models."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    MetaData,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


def _enum_values(enum_type: type[StrEnum]) -> list[str]:
    """Persist StrEnum values instead of Python member names."""

    return [member.value for member in enum_type]


class Base(DeclarativeBase):
    """Base class for future domain models and Alembic autogeneration."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class AuthProvider(StrEnum):
    """External authentication providers supported by the application schema."""

    SUPABASE = "supabase"


class ApplicationUserLifecycle(StrEnum):
    """Persisted lifecycle states for an application-owned user identity."""

    ACTIVE = "active"
    DELETION_IN_PROGRESS = "deletion_in_progress"
    DELETED = "deleted"


class ApplicationUser(Base):
    """Application-owned identity with an explicit terminal deletion lifecycle."""

    __tablename__ = "application_users"
    __table_args__ = (
        CheckConstraint(
            "(lifecycle_state IN ('active', 'deletion_in_progress') AND deleted_at IS NULL) "
            "OR (lifecycle_state = 'deleted' AND deleted_at IS NOT NULL)",
            name="application_user_lifecycle_consistency",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    lifecycle_state: Mapped[ApplicationUserLifecycle] = mapped_column(
        Enum(
            ApplicationUserLifecycle,
            native_enum=False,
            length=32,
            values_callable=_enum_values,
            validate_strings=True,
        ),
        default=ApplicationUserLifecycle.ACTIVE,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    identities: Mapped[list[ApplicationUserIdentity]] = relationship(
        back_populates="user", cascade="save-update, merge"
    )
    profile: Mapped[ApplicationUserProfile | None] = relationship(
        back_populates="user", cascade="save-update, merge", uselist=False
    )


class ApplicationUserIdentity(Base):
    """Immutable mapping from an external provider subject to an application user."""

    __tablename__ = "application_user_identities"
    __table_args__ = (
        CheckConstraint(
            "auth_provider = 'supabase'", name="application_user_identity_supported_provider"
        ),
        UniqueConstraint("auth_provider", "external_subject"),
    )

    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("application_users.id", ondelete="RESTRICT"),
        primary_key=True,
    )
    auth_provider: Mapped[AuthProvider] = mapped_column(
        Enum(
            AuthProvider,
            native_enum=False,
            length=32,
            values_callable=_enum_values,
            validate_strings=True,
        ),
        primary_key=True,
    )
    external_subject: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped[ApplicationUser] = relationship(back_populates="identities")


class ApplicationUserProfile(Base):
    """One-to-one application-owned profile data without provider PII."""

    __tablename__ = "application_user_profiles"

    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("application_users.id", ondelete="RESTRICT"),
        primary_key=True,
    )
    display_name: Mapped[str | None] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    user: Mapped[ApplicationUser] = relationship(back_populates="profile")
