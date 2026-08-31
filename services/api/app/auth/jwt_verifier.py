"""Supabase JWKS-backed access-token verification."""

from __future__ import annotations

import json
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from threading import Condition, RLock
from time import monotonic
from typing import Any
from urllib.request import Request, urlopen
from uuid import UUID

import jwt
from jwt import InvalidSignatureError, PyJWKSet
from jwt.exceptions import InvalidTokenError, PyJWKSetError


class AuthenticationError(Exception):
    """Raised when a request cannot establish a valid authenticated principal."""


class AuthorizationError(Exception):
    """Raised when a valid token is not permitted to use a protected route."""


class JwksProviderUnavailableError(Exception):
    """Raised when the configured JWKS provider cannot be reached or decoded."""


@dataclass(frozen=True)
class AuthenticatedPrincipal:
    """The caller identity derived only from verified token claims."""

    external_subject: UUID


JwksFetcher = Callable[[str], Mapping[str, Any]]


def _fetch_jwks(url: str) -> Mapping[str, Any]:
    """Fetch a JWKS document without sending application credentials."""
    request = Request(url, headers={"Accept": "application/json"})
    with urlopen(request, timeout=5) as response:  # noqa: S310 - URL is configured, not token-controlled.
        payload = json.load(response)
    if not isinstance(payload, dict):
        raise ValueError("JWKS response must be a JSON object")
    return payload


class JwksCache:
    """A finite-lived JWKS cache that refreshes on a signing-key rotation."""

    def __init__(
        self,
        jwks_url: str,
        cache_seconds: int,
        fetcher: JwksFetcher = _fetch_jwks,
        failure_backoff_seconds: int = 5,
    ) -> None:
        self._jwks_url = jwks_url
        self._cache_seconds = cache_seconds
        self._fetcher = fetcher
        self._failure_backoff_seconds = failure_backoff_seconds
        self._keys: dict[str, Any] = {}
        self._expires_at = 0.0
        self._generation = 0
        self._unknown_key_refresh_generation: int | None = None
        self._unknown_key_discovery_in_flight = False
        self._unknown_key_failure_until = 0.0
        self._unknown_key_failure: JwksProviderUnavailableError | None = None
        self._signature_refresh_generation_by_key: dict[str, int] = {}
        self._lock = RLock()
        self._refresh_condition = Condition(self._lock)
        self._refreshing = False
        self._last_refresh_error: JwksProviderUnavailableError | None = None

    def get_key(self, key_id: str, *, refresh: bool = False) -> Any:
        """Return a trusted public key, refreshing once for an unknown key ID."""
        key, _ = self.get_key_with_generation(key_id, refresh=refresh)
        return key

    def get_key_with_generation(
        self, key_id: str, *, refresh: bool = False
    ) -> tuple[Any, int]:
        """Return a trusted key and cache generation for signature-failure recovery."""
        forced_refresh_pending = refresh
        cold_lookup_pending = False
        while True:
            with self._lock:
                key = self._keys.get(key_id)
                cache_expired = monotonic() >= self._expires_at
                if key is not None and not forced_refresh_pending and not cache_expired:
                    return key, self._generation

                discovery_refresh = False
                if forced_refresh_pending or cache_expired:
                    cold_lookup_pending = key is None and self._generation == 0
                    discovery_refresh = key is None and not cold_lookup_pending
                    forced_refresh_pending = False
                elif key is None:
                    if (
                        self._unknown_key_failure is not None
                        and monotonic() < self._unknown_key_failure_until
                    ):
                        raise self._unknown_key_failure
                    if self._unknown_key_discovery_in_flight:
                        self._refresh_condition.wait_for(lambda: not self._refreshing)
                        continue
                    if self._unknown_key_refresh_generation == self._generation:
                        raise AuthenticationError("untrusted signing key")
                    # Bound unknown-key discovery to one refresh for the entire
                    # cache generation, rather than one provider request per
                    # forged key identifier.
                    discovery_refresh = True

            self._refresh(discovery=discovery_refresh)
            if cold_lookup_pending:
                with self._lock:
                    if self._keys.get(key_id) is None:
                        self._unknown_key_refresh_generation = self._generation
                        raise AuthenticationError("untrusted signing key")
                cold_lookup_pending = False

    def refresh_key_after_signature_failure(
        self, key_id: str, observed_generation: int
    ) -> Any | None:
        """Refresh a known key at most once per cache generation.

        A failed signature may indicate a provider key rotation that reused a
        key identifier. The first failure coordinates one refresh; later
        invalid tokens against that refreshed generation fail closed without
        repeatedly fetching the configured JWKS endpoint.
        """
        with self._lock:
            if self._generation != observed_generation:
                return self._keys.get(key_id)
            if (
                self._signature_refresh_generation_by_key.get(key_id)
                == self._generation
            ):
                return None

            self._signature_refresh_generation_by_key[key_id] = self._generation

        try:
            self._refresh()
        except JwksProviderUnavailableError:
            with self._lock:
                self._signature_refresh_generation_by_key.pop(key_id, None)
            raise
        with self._lock:
            self._signature_refresh_generation_by_key[key_id] = self._generation
            return self._keys.get(key_id)

    def _refresh(self, *, discovery: bool = False) -> None:
        """Refresh once at a time without holding the cache lock during I/O."""
        with self._lock:
            if self._refreshing:
                self._refresh_condition.wait_for(lambda: not self._refreshing)
                if self._last_refresh_error is not None:
                    raise self._last_refresh_error
                return
            self._refreshing = True
            self._last_refresh_error = None
            if discovery:
                self._unknown_key_discovery_in_flight = True

        try:
            jwk_set = PyJWKSet.from_dict(dict(self._fetcher(self._jwks_url)))
            keys = {
                key.key_id: key.key
                for key in jwk_set.keys
                if key.key_id is not None and key.key is not None
            }
        except (OSError, PyJWKSetError, TypeError, ValueError) as exc:
            unavailable = JwksProviderUnavailableError("JWKS provider is unavailable")
            with self._lock:
                self._last_refresh_error = unavailable
                if discovery:
                    self._unknown_key_discovery_in_flight = False
                    self._unknown_key_failure = unavailable
                    self._unknown_key_failure_until = (
                        monotonic() + self._failure_backoff_seconds
                    )
                self._refreshing = False
                self._refresh_condition.notify_all()
            raise unavailable from exc

        with self._lock:
            self._keys = keys
            self._expires_at = monotonic() + self._cache_seconds
            self._generation += 1
            self._unknown_key_failure = None
            self._unknown_key_failure_until = 0.0
            if discovery:
                self._unknown_key_refresh_generation = self._generation
                self._unknown_key_discovery_in_flight = False
            self._refreshing = False
            self._refresh_condition.notify_all()


class SupabaseJwtVerifier:
    """Validate only authenticated Supabase ES256 access tokens."""

    _ALGORITHM = "ES256"
    _AUDIENCE = "authenticated"
    _ROLE = "authenticated"

    def __init__(self, *, issuer: str, jwks: JwksCache) -> None:
        self._issuer = issuer
        self._jwks = jwks

    def verify(self, token: str) -> AuthenticatedPrincipal:
        """Validate a bearer token and return no claims beyond its stable subject."""
        try:
            header = jwt.get_unverified_header(token)
            if header.get("alg") != self._ALGORITHM:
                raise AuthenticationError("unsupported token algorithm")
            key_id = header.get("kid")
            if not isinstance(key_id, str) or not key_id:
                raise AuthenticationError("missing token key identifier")
            key, generation = self._jwks.get_key_with_generation(key_id)
            try:
                claims = self._decode(token, key)
            except InvalidSignatureError:
                refreshed_key = self._jwks.refresh_key_after_signature_failure(
                    key_id, generation
                )
                if refreshed_key is None:
                    raise
                claims = self._decode(token, refreshed_key)
            if claims.get("role") != self._ROLE:
                raise AuthorizationError("token does not have the authenticated role")
            subject = claims.get("sub")
            if not isinstance(subject, str):
                raise AuthenticationError("missing token subject")
            return AuthenticatedPrincipal(external_subject=UUID(subject))
        except (AuthorizationError, JwksProviderUnavailableError):
            raise
        except (
            AuthenticationError,
            InvalidTokenError,
            TypeError,
            ValueError,
        ) as exc:
            raise AuthenticationError("invalid access token") from exc

    def _decode(self, token: str, key: Any) -> Mapping[str, Any]:
        return jwt.decode(
            token,
            key=key,
            algorithms=[self._ALGORITHM],
            audience=self._AUDIENCE,
            issuer=self._issuer,
            options={"require": ["aud", "exp", "iss", "role", "sub"]},
        )
