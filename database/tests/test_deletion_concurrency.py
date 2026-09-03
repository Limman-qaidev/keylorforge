"""PostgreSQL regressions for account-deletion lifecycle concurrency."""

from uuid import uuid4

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from keylorforge_database.identity import ApplicationUserRepository
from keylorforge_database.models import (
    ApplicationUser,
    ApplicationUserLifecycle,
    AuthProvider,
)


def test_stale_deletion_start_cannot_reopen_finalized_tombstone(
    test_database_url: str,
) -> None:
    """A stale deletion request preserves a tombstone finalized by another request."""
    engine = create_engine(test_database_url)
    subject = uuid4()
    stale_session = Session(engine)
    try:
        with Session(engine) as session:
            repository = ApplicationUserRepository(session)
            user = repository.get_or_provision_active_user(
                auth_provider=AuthProvider.SUPABASE,
                external_subject=subject,
            )
            user_id = user.id
            session.commit()

        stale_user = ApplicationUserRepository(
            stale_session
        ).get_or_provision_active_user(
            auth_provider=AuthProvider.SUPABASE,
            external_subject=subject,
        )
        assert stale_user.lifecycle_state is ApplicationUserLifecycle.ACTIVE

        with Session(engine) as winning_session:
            winning_repository = ApplicationUserRepository(winning_session)
            winning_repository.start_deletion(
                auth_provider=AuthProvider.SUPABASE,
                external_subject=subject,
            )
            winning_session.commit()
            finalized = winning_repository.finalize_deletion(
                auth_provider=AuthProvider.SUPABASE,
                external_subject=subject,
            )
            winning_session.commit()
            finalized_deleted_at = finalized.deleted_at

        delayed = ApplicationUserRepository(stale_session).start_deletion(
            auth_provider=AuthProvider.SUPABASE,
            external_subject=subject,
        )
        assert delayed.lifecycle_state is ApplicationUserLifecycle.DELETED
        assert delayed.deleted_at == finalized_deleted_at
        stale_session.commit()

        with Session(engine) as verification_session:
            persisted_user = verification_session.scalar(
                select(ApplicationUser).where(ApplicationUser.id == user_id)
            )
            assert persisted_user is not None
            assert persisted_user.lifecycle_state is ApplicationUserLifecycle.DELETED
            assert persisted_user.deleted_at == finalized_deleted_at
    finally:
        stale_session.close()
        engine.dispose()
