"""Application identity orchestration for protected endpoints."""

from fastapi import HTTPException, status
from keylorforge_database.identity import (
    ApplicationUserRepository,
    TerminalIdentityError,
)
from keylorforge_database.models import ApplicationUser, AuthProvider
from sqlalchemy.orm import Session

from app.auth.jwt_verifier import AuthenticatedPrincipal
from app.identity.schemas import (
    MeResponse,
    ProfileResponse,
    UpdateProfileRequest,
)
from app.identity.supabase_admin import (
    SupabaseAdminDeletionClient,
    SupabaseAdminDeletionError,
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


def delete_current_identity(
    *,
    principal: AuthenticatedPrincipal,
    session: Session,
    admin_client: SupabaseAdminDeletionClient,
) -> None:
    """Delete only the authenticated caller while preserving a local tombstone."""
    repository = ApplicationUserRepository(session)
    repository.start_deletion(
        auth_provider=AuthProvider.SUPABASE,
        external_subject=principal.external_subject,
    )
    # This explicit commit is the fail-closed boundary before provider I/O.
    session.commit()

    try:
        admin_client.delete_user(principal.external_subject)
    except SupabaseAdminDeletionError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="account deletion could not be completed; please try again",
        ) from exc

    repository.finalize_deletion(
        auth_provider=AuthProvider.SUPABASE,
        external_subject=principal.external_subject,
    )
    session.commit()


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
