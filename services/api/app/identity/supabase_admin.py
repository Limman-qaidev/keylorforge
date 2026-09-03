"""Server-only Supabase Auth administration boundary."""

from __future__ import annotations

from typing import Protocol
from uuid import UUID

from supabase import Client, ClientOptions, create_client
from supabase_auth.errors import AuthApiError

from app.config import Settings


class SupabaseAdminDeletionClient(Protocol):
    """Minimal injectable capability needed by the deletion workflow."""

    def delete_user(self, external_subject: UUID) -> None:
        """Hard-delete the provider identity for an already authenticated caller."""


class SupabaseAdminConfigurationError(Exception):
    """Raised when server-only account-deletion configuration is absent."""


class SupabaseAdminDeletionError(Exception):
    """Raised without provider diagnostics when administrative deletion fails."""


class SupabaseAdminClient:
    """Hard-deletion adapter that never exposes its credential to callers."""

    def __init__(self, client: Client) -> None:
        self._client = client

    def delete_user(self, external_subject: UUID) -> None:
        try:
            self._client.auth.admin.delete_user(str(external_subject))
        except AuthApiError as exc:
            if exc.code == "user_not_found":
                return
            raise SupabaseAdminDeletionError from exc
        except Exception as exc:
            raise SupabaseAdminDeletionError from exc


def create_supabase_admin_client(settings: Settings) -> SupabaseAdminDeletionClient:
    """Create the configured server-only client with local sessions disabled."""
    if settings.supabase_project_url is None or settings.supabase_secret_key is None:
        raise SupabaseAdminConfigurationError

    client = create_client(
        str(settings.supabase_project_url),
        settings.supabase_secret_key.get_secret_value(),
        options=ClientOptions(auto_refresh_token=False, persist_session=False),
    )
    return SupabaseAdminClient(client)
