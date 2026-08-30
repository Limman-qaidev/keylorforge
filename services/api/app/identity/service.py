"""Application identity orchestration for protected endpoints."""

from fastapi import HTTPException, status
from keylornet_database.identity import ApplicationUserRepository, TerminalIdentityError
from keylornet_database.models import AuthProvider
from sqlalchemy.orm import Session

from app.auth.jwt_verifier import AuthenticatedPrincipal
from app.identity.schemas import MeResponse, ProfileFoundationResponse


def get_or_provision_current_identity(
    *, principal: AuthenticatedPrincipal, session: Session
) -> MeResponse:
    """Return the caller's active identity, provisioning it once when necessary."""
    try:
        user = ApplicationUserRepository(session).get_or_provision_active_user(
            auth_provider=AuthProvider.SUPABASE,
            external_subject=principal.external_subject,
        )
    except TerminalIdentityError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="not authorized",
        ) from exc

    profile = user.profile
    if profile is None:
        raise RuntimeError("active application user is missing its profile foundation")
    return MeResponse(
        id=user.id,
        profile=ProfileFoundationResponse(
            created_at=profile.created_at,
            updated_at=profile.updated_at,
        ),
    )
