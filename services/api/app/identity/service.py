"""Application identity orchestration for protected endpoints."""

from fastapi import HTTPException, status
from keylornet_database.identity import ApplicationUserRepository, TerminalIdentityError
from keylornet_database.models import ApplicationUser, AuthProvider
from sqlalchemy.orm import Session

from app.auth.jwt_verifier import AuthenticatedPrincipal
from app.identity.schemas import (
    MeResponse,
    ProfileResponse,
    UpdateProfileRequest,
)


def get_or_provision_current_identity(
    *, principal: AuthenticatedPrincipal, session: Session
) -> MeResponse:
    """Return the caller's active identity, provisioning it once when necessary."""
    repository = ApplicationUserRepository(session)
    try:
        user = repository.get_or_provision_active_user(
            auth_provider=AuthProvider.SUPABASE,
            external_subject=principal.external_subject,
        )
    except TerminalIdentityError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="not authorized",
        ) from exc

    return _profile_response_for_user(user)


def update_current_profile(
    *,
    principal: AuthenticatedPrincipal,
    session: Session,
    update: UpdateProfileRequest,
) -> ProfileResponse:
    """Persist the authenticated caller's validated profile update."""
    repository = ApplicationUserRepository(session)
    try:
        user = repository.get_or_provision_active_user(
            auth_provider=AuthProvider.SUPABASE,
            external_subject=principal.external_subject,
        )
        profile = repository.set_profile_display_name(
            user=user, display_name=update.display_name
        )
    except TerminalIdentityError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="not authorized",
        ) from exc
    return ProfileResponse(
        display_name=profile.display_name,
        created_at=profile.created_at,
        updated_at=profile.updated_at,
    )


def _profile_response_for_user(user: ApplicationUser) -> MeResponse:
    """Map an active application user to the caller-relative response contract."""
    profile = user.profile
    if profile is None:
        raise RuntimeError("active application user is missing its profile foundation")
    return MeResponse(
        id=user.id,
        profile=ProfileResponse(
            display_name=profile.display_name,
            created_at=profile.created_at,
            updated_at=profile.updated_at,
        ),
    )
