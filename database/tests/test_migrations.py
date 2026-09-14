"""Migration-chain validation against an explicitly configured PostgreSQL test DB."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from threading import Barrier, Lock
from uuid import UUID, uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, select, text, update
from sqlalchemy.orm import Session

from keylorforge_database.identity import (
    ApplicationUserRepository,
    TerminalIdentityError,
)
from keylorforge_database.catalog_importer import (
    CATALOG_SOURCE,
    CatalogImportError,
    import_vendored_catalog,
    load_vendored_snapshot,
)
from keylorforge_database.models import (
    ApplicationUser,
    ApplicationUserIdentity,
    ApplicationUserLifecycle,
    AuthProvider,
)


def test_upgrade_clean_database_records_head(test_database_url: str) -> None:
    """A clean PostgreSQL database upgrades to the baseline revision."""
    engine = create_engine(test_database_url)
    with engine.connect() as connection:
        tables = (
            connection.execute(
                text(
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_schema = 'public' ORDER BY table_name"
                )
            )
            .scalars()
            .all()
        )

    assert tables == [], "migration test requires a clean PostgreSQL test database"

    config = Config("alembic.ini")
    command.upgrade(config, "head")

    with engine.connect() as connection:
        revision = connection.execute(
            text("SELECT version_num FROM alembic_version")
        ).scalar_one()

    assert revision == "20260913_0001"

    with engine.connect() as connection:
        display_name = connection.execute(
            text(
                "SELECT is_nullable, character_maximum_length "
                "FROM information_schema.columns "
                "WHERE table_schema = 'public' "
                "AND table_name = 'application_user_profiles' "
                "AND column_name = 'display_name'"
            )
        ).one()

    assert display_name == ("YES", 80)

    with engine.connect() as connection:
        rls = connection.execute(
            text(
                "SELECT relation.relname, relation.relrowsecurity "
                "FROM pg_class AS relation "
                "JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace "
                "WHERE namespace.nspname = 'public' "
                "AND relation.relname IN ("
                "'application_users', "
                "'application_user_identities', "
                "'application_user_profiles'"
                ") ORDER BY relation.relname"
            )
        ).all()
        direct_grants = connection.execute(
            text(
                "SELECT table_name, grantee, privilege_type "
                "FROM information_schema.table_privileges "
                "WHERE table_schema = 'public' "
                "AND table_name IN ("
                "'application_users', "
                "'application_user_identities', "
                "'application_user_profiles'"
                ") AND grantee IN ('anon', 'authenticated', 'service_role')"
            )
        ).all()

    assert rls == [
        ("application_user_identities", True),
        ("application_user_profiles", True),
        ("application_users", True),
    ]
    assert direct_grants == []


def test_catalog_schema_is_private_and_has_expected_constraints(test_database_url: str) -> None:
    """Catalogue tables are normalized, constrained and inaccessible through Data API roles."""
    engine = create_engine(test_database_url)
    catalogue_tables = [
        "catalog_equipment",
        "catalog_equipment_names",
        "catalog_exercise_equipment",
        "catalog_exercise_muscles",
        "catalog_exercise_names",
        "catalog_exercises",
        "catalog_muscle_names",
        "catalog_muscles",
    ]
    try:
        with engine.connect() as connection:
            rls = connection.execute(
                text(
                    "SELECT relation.relname, relation.relrowsecurity "
                    "FROM pg_class AS relation "
                    "JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace "
                    "WHERE namespace.nspname = 'public' AND relation.relname LIKE 'catalog_%' "
                    "ORDER BY relation.relname"
                )
            ).all()
            constraints = connection.execute(
                text(
                    "SELECT conname FROM pg_constraint WHERE conname IN ("
                    "'ck_catalog_exercises_catalog_exercise_measurement_type', "
                    "'ck_catalog_exercise_muscles_catalog_exercise_muscle_role'"
                    ") ORDER BY conname"
                )
            ).scalars().all()
            direct_grants = connection.execute(
                text(
                    "SELECT table_name FROM information_schema.table_privileges "
                    "WHERE table_schema = 'public' AND table_name LIKE 'catalog_%' "
                    "AND grantee IN ('anon', 'authenticated', 'service_role')"
                )
            ).all()
    finally:
        engine.dispose()

    assert rls == [(table, True) for table in catalogue_tables]
    assert constraints == [
        "ck_catalog_exercise_muscles_catalog_exercise_muscle_role",
        "ck_catalog_exercises_catalog_exercise_measurement_type",
    ]
    assert direct_grants == []


def test_vendored_catalog_import_is_complete_and_idempotent(test_database_url: str) -> None:
    """The pinned EN/ES snapshot imports once and never duplicates its rows."""
    snapshot = load_vendored_snapshot()
    assert len(snapshot.exercises["en"]) == len(snapshot.exercises["es"]) == 899
    assert len(snapshot.muscles["en"]) == len(snapshot.muscles["es"]) == 17
    assert len(snapshot.equipment["en"]) == len(snapshot.equipment["es"]) == 36

    engine = create_engine(test_database_url)
    try:
        with Session(engine) as session:
            first = import_vendored_catalog(session, snapshot)
            session.commit()
        with Session(engine) as session:
            second = import_vendored_catalog(session, snapshot)
            session.commit()
        assert first == second

        with engine.connect() as connection:
            counts = connection.execute(
                text(
                    "SELECT "
                    "(SELECT count(*) FROM catalog_exercises), "
                    "(SELECT count(*) FROM catalog_muscles), "
                    "(SELECT count(*) FROM catalog_equipment), "
                    "(SELECT count(*) FROM catalog_exercise_names), "
                    "(SELECT count(*) FROM catalog_muscle_names), "
                    "(SELECT count(*) FROM catalog_equipment_names), "
                    "(SELECT count(*) FROM catalog_exercise_muscles), "
                    "(SELECT count(*) FROM catalog_exercise_equipment)"
                )
            ).one()
            locale_counts = connection.execute(
                text(
                    "SELECT locale, count(*) FROM catalog_exercise_names "
                    "GROUP BY locale ORDER BY locale"
                )
            ).all()
            source_count = connection.execute(
                text("SELECT count(*) FROM catalog_exercises WHERE source = :source"),
                {"source": CATALOG_SOURCE},
            ).scalar_one()
            invalid_roles = connection.execute(
                text(
                    "SELECT count(*) FROM catalog_exercise_muscles "
                    "WHERE role NOT IN ('primary', 'secondary', 'tertiary')"
                )
            ).scalar_one()
    finally:
        engine.dispose()

    assert counts == (899, 17, 36, 1798, 34, 72, first.exercise_muscles, first.exercise_equipment)
    assert locale_counts == [("en", 899), ("es", 899)]
    assert source_count == 899
    assert invalid_roles == 0


def test_catalog_import_rejects_broken_references_before_writing(test_database_url: str) -> None:
    """Importer validation rejects source drift rather than persisting partial data."""
    snapshot = load_vendored_snapshot()
    invalid = deepcopy(snapshot)
    invalid.exercises["en"][0]["muscleGroups"][0]["id"] = "missing-muscle"
    engine = create_engine(test_database_url)
    try:
        with Session(engine) as session:
            with pytest.raises(CatalogImportError, match="unknown ID"):
                import_vendored_catalog(session, invalid)
            session.rollback()
    finally:
        engine.dispose()


def test_catalog_migration_refuses_destructive_downgrade(
    test_database_url: str,
) -> None:
    """The profile migration must not silently drop persisted display names."""
    config = Config("alembic.ini")

    with pytest.raises(NotImplementedError, match="stores catalogue data"):
        command.downgrade(config, "20260831_0001")

    engine = create_engine(test_database_url)
    try:
        with engine.connect() as connection:
            revision = connection.execute(
                text("SELECT version_num FROM alembic_version")
            ).scalar_one()
        assert revision == "20260913_0001"
    finally:
        engine.dispose()


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


def test_display_name_is_initially_null_and_persists_across_sessions(
    test_database_url: str,
) -> None:
    """A profile starts empty and keeps a repository update after commit."""
    engine = create_engine(test_database_url)
    subject = uuid4()
    try:
        with Session(engine) as session:
            repository = ApplicationUserRepository(session)
            user = repository.get_or_provision_active_user(
                auth_provider=AuthProvider.SUPABASE, external_subject=subject
            )
            assert user.profile is not None
            assert user.profile.display_name is None

            repository.set_profile_display_name(user=user, display_name="Jonathan")
            session.commit()

        with Session(engine) as session:
            persisted_user = ApplicationUserRepository(
                session
            ).get_or_provision_active_user(
                auth_provider=AuthProvider.SUPABASE, external_subject=subject
            )
            assert persisted_user.profile is not None
            assert persisted_user.profile.display_name == "Jonathan"
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


def test_deletion_anonymizes_and_finalizes_an_active_identity(
    test_database_url: str,
) -> None:
    """Deletion commits a PII-free terminal tombstone for an active user."""
    engine = create_engine(test_database_url)
    subject = uuid4()
    try:
        with Session(engine) as session:
            repository = ApplicationUserRepository(session)
            user = repository.get_or_provision_active_user(
                auth_provider=AuthProvider.SUPABASE, external_subject=subject
            )
            repository.set_profile_display_name(user=user, display_name="Taylor")
            session.commit()

        with Session(engine) as session:
            repository = ApplicationUserRepository(session)
            prepared = repository.start_deletion(
                auth_provider=AuthProvider.SUPABASE, external_subject=subject
            )
            assert prepared.lifecycle_state is ApplicationUserLifecycle.DELETION_IN_PROGRESS
            assert prepared.profile is not None
            assert prepared.profile.display_name is None
            session.commit()

            finalized = repository.finalize_deletion(
                auth_provider=AuthProvider.SUPABASE, external_subject=subject
            )
            assert finalized.lifecycle_state is ApplicationUserLifecycle.DELETED
            assert finalized.deleted_at is not None
            session.commit()

        with Session(engine) as session:
            with pytest.raises(TerminalIdentityError):
                ApplicationUserRepository(session).get_or_provision_active_user(
                    auth_provider=AuthProvider.SUPABASE, external_subject=subject
                )
    finally:
        engine.dispose()


def test_deletion_creates_a_tombstone_for_an_unprovisioned_subject(
    test_database_url: str,
) -> None:
    """A first deletion cannot be followed by automatic reprovisioning."""
    engine = create_engine(test_database_url)
    subject = uuid4()
    try:
        with Session(engine) as session:
            repository = ApplicationUserRepository(session)
            repository.start_deletion(
                auth_provider=AuthProvider.SUPABASE, external_subject=subject
            )
            session.commit()
            repository.finalize_deletion(
                auth_provider=AuthProvider.SUPABASE, external_subject=subject
            )
            session.commit()

        with Session(engine) as session:
            repository = ApplicationUserRepository(session)
            with pytest.raises(TerminalIdentityError):
                repository.get_or_provision_active_user(
                    auth_provider=AuthProvider.SUPABASE, external_subject=subject
                )
            tombstone = repository.start_deletion(
                auth_provider=AuthProvider.SUPABASE, external_subject=subject
            )
            assert tombstone.lifecycle_state is ApplicationUserLifecycle.DELETED
            assert tombstone.deleted_at is not None
    finally:
        engine.dispose()


def test_stale_profile_update_cannot_restore_deletion_anonymization(
    test_database_url: str,
) -> None:
    """A stale ORM user must observe deletion after acquiring its row lock."""
    engine = create_engine(test_database_url)
    subject = uuid4()
    session_a = Session(engine)
    try:
        with Session(engine) as session:
            repository = ApplicationUserRepository(session)
            user = repository.get_or_provision_active_user(
                auth_provider=AuthProvider.SUPABASE, external_subject=subject
            )
            user_id = user.id
            repository.set_profile_display_name(user=user, display_name="Taylor")
            session.commit()

        stale_user = ApplicationUserRepository(
            session_a
        ).get_or_provision_active_user(
            auth_provider=AuthProvider.SUPABASE, external_subject=subject
        )
        assert stale_user.lifecycle_state is ApplicationUserLifecycle.ACTIVE

        with Session(engine) as session_b:
            ApplicationUserRepository(session_b).start_deletion(
                auth_provider=AuthProvider.SUPABASE, external_subject=subject
            )
            session_b.commit()

        with pytest.raises(TerminalIdentityError):
            ApplicationUserRepository(session_a).set_profile_display_name(
                user=stale_user, display_name="Must not persist"
            )
        session_a.rollback()

        with Session(engine) as session:
            persisted_user = session.scalar(
                select(ApplicationUser).where(ApplicationUser.id == user_id)
            )
            assert persisted_user is not None
            assert persisted_user.lifecycle_state is (
                ApplicationUserLifecycle.DELETION_IN_PROGRESS
            )
            assert persisted_user.profile is not None
            assert persisted_user.profile.display_name is None
    finally:
        session_a.close()
        engine.dispose()
