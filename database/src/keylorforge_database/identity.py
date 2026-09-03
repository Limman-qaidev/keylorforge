"""Transactional persistence boundary for application user provisioning."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from keylorforge_database.models import (
    ApplicationUser,
    ApplicationUserIdentity,
    ApplicationUserLifecycle,
    ApplicationUserProfile,
    AuthProvider,
)


class TerminalIdentityError(Exception):
    """Raised when a deleted identity attempts automatic reprovisioning."""


class ApplicationUserRepository:
    """Repository for deterministic, transaction-safe external identity mapping.

    Methods flush changes but never commit them. The calling service owns the
    transaction boundary so it can compose provisioning with authorization work.
    """

    def __init__(self, session: Session) -> None:
        self._session = session

    def get_or_provision_active_user(
        self, *, auth_provider: AuthProvider, external_subject: UUID
    ) -> ApplicationUser:
        """Return an active user or atomically provision a user and empty profile.

        The external identity's unique constraint handles concurrent first access.
        A conflicting insert is retried as a read after its savepoint rolls back.
        Existing terminal identities always fail closed instead of being recreated.
        """
        existing = self._find_identity(auth_provider, external_subject)
        if existing is not None:
            return self._active_user_for_identity(existing)

        try:
            with self._session.begin_nested():
                user = ApplicationUser()
                identity = ApplicationUserIdentity(
                    user=user,
                    auth_provider=auth_provider,
                    external_subject=external_subject,
                )
                profile = ApplicationUserProfile(user=user)
                self._session.add_all((user, identity, profile))
                self._session.flush()
        except IntegrityError:
            existing = self._find_identity(auth_provider, external_subject)
            if existing is None:
                raise
            return self._active_user_for_identity(existing)

        return user

    def set_profile_display_name(
        self, *, user: ApplicationUser, display_name: str
    ) -> ApplicationUserProfile:
        """Persist a display name for an active application's own profile.

        The caller supplies the application user resolved from its authenticated
        principal. This method flushes and reloads within the caller-owned
        transaction, so the write is rolled back if the surrounding request
        fails.
        """
        if user.lifecycle_state is not ApplicationUserLifecycle.ACTIVE:
            raise TerminalIdentityError(
                "the external identity has a terminal KeylorForge lifecycle state"
            )

        profile = user.profile
        if profile is None:
            raise RuntimeError("active application user is missing its profile foundation")

        profile.display_name = display_name
        self._session.flush()
        self._session.refresh(profile)
        return profile

    def _find_identity(
        self, auth_provider: AuthProvider, external_subject: UUID
    ) -> ApplicationUserIdentity | None:
        statement = (
            select(ApplicationUserIdentity)
            .options(
                joinedload(ApplicationUserIdentity.user).joinedload(ApplicationUser.profile)
            )
            .where(
                ApplicationUserIdentity.auth_provider == auth_provider,
                ApplicationUserIdentity.external_subject == external_subject,
            )
        )
        return self._session.scalar(statement)

    @staticmethod
    def _active_user_for_identity(identity: ApplicationUserIdentity) -> ApplicationUser:
        user = identity.user
        if user.lifecycle_state is not ApplicationUserLifecycle.ACTIVE:
            raise TerminalIdentityError(
                "the external identity has a terminal KeylorForge lifecycle state"
            )
        return user
