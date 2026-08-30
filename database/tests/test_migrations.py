"""Migration-chain validation against an explicitly configured PostgreSQL test DB."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Lock
from uuid import UUID, uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, select, text, update
from sqlalchemy.orm import Session

from keylornet_database.identity import (
    ApplicationUserRepository,
    TerminalIdentityError,
)
from keylornet_database.models import (
    ApplicationUser,
    ApplicationUserIdentity,
    ApplicationUserLifecycle,
    AuthProvider,
)


def test_upgrade_clean_database_records_head(test_database_url: str) -> None:
    """A clean PostgreSQL database upgrades to the baseline revision."""
    engine = create_engine(test_database_url)
    with engine.connect() as connection:
        tables = connection.execute(
            text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'public' ORDER BY table_name"
            )
        ).scalars().all()

    assert tables == [], "migration test requires a clean PostgreSQL test database"

    config = Config("alembic.ini")
    command.upgrade(config, "head")

    with engine.connect() as connection:
        revision = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()

    assert revision == "20260829_0001"


def test_provisioning_is_idempotent_and_creates_profile(test_database_url: str) -> None:
    """Repeated first access maps one external subject to one active profile."""
    engine = create_engine(test_database_url)
    subject = uuid4()
    try:
        with Session(engine) as session:
            repository = ApplicationUserRepository(session)
            first = repository.get_or_provision_active_user(
                auth_provider=AuthProvider.SUPABASE, external_subject=subject
            )
            first_id = first.id
            session.commit()

        with Session(engine) as session:
            repository = ApplicationUserRepository(session)
            second = repository.get_or_provision_active_user(
                auth_provider=AuthProvider.SUPABASE, external_subject=subject
            )
            assert second.id == first_id
            assert second.profile is not None
            session.commit()
    finally:
        engine.dispose()


def test_concurrent_provisioning_creates_one_identity(
    test_database_url: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The unique provider mapping safely resolves concurrent first access."""
    engine = create_engine(test_database_url)
    subject = uuid4()
    barrier = Barrier(2)
    lookup_lock = Lock()
    original_find_identity = ApplicationUserRepository._find_identity
    initial_misses = 0

    def synchronize_initial_misses(
        self: ApplicationUserRepository,
        auth_provider: AuthProvider,
        external_subject: UUID,
    ) -> ApplicationUserIdentity | None:
        nonlocal initial_misses
        identity = original_find_identity(self, auth_provider, external_subject)
        if identity is None:
            with lookup_lock:
                synchronize = initial_misses < 2
                if synchronize:
                    initial_misses += 1
            if synchronize:
                barrier.wait(timeout=5)
        return identity

    monkeypatch.setattr(
        ApplicationUserRepository, "_find_identity", synchronize_initial_misses
    )

    def provision() -> UUID:
        with Session(engine) as session:
            user = ApplicationUserRepository(session).get_or_provision_active_user(
                auth_provider=AuthProvider.SUPABASE, external_subject=subject
            )
            session.commit()
            return user.id

    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            user_ids = list(executor.map(lambda _: provision(), range(2)))

        # The barrier proves both workers observed the mapping as absent before
        # provisioning. Correctness is the externally observable result: both
        # callers resolve to the same application user and the database retains
        # exactly one provider/subject identity row. Avoid asserting an internal
        # repository lookup count, which is scheduling- and implementation-sensitive.
        assert initial_misses == 2
        assert user_ids[0] == user_ids[1]
        with Session(engine) as session:
            identities = session.scalars(
                select(ApplicationUserIdentity).where(
                    ApplicationUserIdentity.auth_provider == AuthProvider.SUPABASE,
                    ApplicationUserIdentity.external_subject == subject,
                )
            ).all()
        assert len(identities) == 1
    finally:
        engine.dispose()


def test_terminal_identity_is_not_reprovisioned(test_database_url: str) -> None:
    """A valid provider subject cannot resurrect an application deletion tombstone."""
    engine = create_engine(test_database_url)
    subject = uuid4()
    try:
        with Session(engine) as session:
            user = ApplicationUserRepository(session).get_or_provision_active_user(
                auth_provider=AuthProvider.SUPABASE, external_subject=subject
            )
            user_id = user.id
            session.commit()

        with Session(engine) as session:
            session.execute(
                update(ApplicationUser)
                .where(ApplicationUser.id == user_id)
                .values(
                    lifecycle_state=ApplicationUserLifecycle.DELETED,
                    deleted_at=text("CURRENT_TIMESTAMP"),
                )
            )
            session.commit()

        with Session(engine) as session:
            repository = ApplicationUserRepository(session)
            with pytest.raises(TerminalIdentityError):
                repository.get_or_provision_active_user(
                    auth_provider=AuthProvider.SUPABASE, external_subject=subject
                )
    finally:
        engine.dispose()
