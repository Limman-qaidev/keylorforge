"""Account-owned workout deletion boundary, transaction controlled by caller."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import delete
from sqlalchemy.orm import Session

from keylorforge_database.models import (
    WorkoutMutationReceipt,
    WorkoutOccurrence,
    WorkoutSession,
    WorkoutSet,
)


def purge_account_workout_data(session: Session, owner_user_id: UUID) -> None:
    """Delete only one account's workout rows, children before parents.

    Called after M1 terminalization has committed, before provider deletion.
    Durable retry/recovery and external cleanup still belong to M3 #123.
    """
    session.execute(
        delete(WorkoutSet).where(WorkoutSet.owner_user_id == owner_user_id)
    )
    session.execute(
        delete(WorkoutOccurrence).where(
            WorkoutOccurrence.owner_user_id == owner_user_id
        )
    )
    session.execute(
        delete(WorkoutMutationReceipt).where(
            WorkoutMutationReceipt.owner_user_id == owner_user_id
        )
    )
    session.execute(
        delete(WorkoutSession).where(WorkoutSession.owner_user_id == owner_user_id)
    )
    session.flush()
