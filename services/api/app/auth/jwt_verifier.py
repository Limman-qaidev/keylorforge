"""Supabase JWKS-backed access-token verification."""

from __future__ import annotations

import json
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from threading import RLock
from time import monotonic
from typing import Any
from urllib.request import Request, urlopen
from uuid import UUID

import jwt
from jwt import InvalidSignatureError, PyJWKSet
from jwt.exceptions import InvalidTokenError


class AuthenticationError(Exception):
    """Raised when a request cannot establish a valid authenticated principal."""


class AuthorizationError(Exception):
    """Raised when a valid token is not permitted to use a protected route."""


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
    ) -> None:
        self._jwks_url = jwks_url
        self._cache_seconds = cache_seconds
        self._fetcher = fetcher
        self._keys: dict[str, Any] = {}
        self._expires_at = 0.0
        self._generation = 0
        self._signature_refresh_generation_by_key: dict[str, int] = {}
        self._lock = RLock()

    def get_key(self, key_id: str, *, refresh: bool = False) -> Any:
        """Return a trusted public key, refreshing once for an unknown key ID."""
        key, _ = self.get_key_with_generation(key_id, refresh=refresh)
        return key

    def get_key_with_generation(
        self, key_id: str, *, refresh: bool = False
    ) -> tuple[Any, int]:
        """Return a trusted key and cache generation for signature-failure recovery."""
        with self._lock:
            if refresh or monotonic() >= self._expires_at:
                self._refresh()
            key = self._keys.get(key_id)
            if key is None and not refresh:
                self._refresh()
                key = self._keys.get(key_id)
            if key is None:
                raise AuthenticationError("untrusted signing key")
            return key, self._generation

    def refresh_key_after_signature_failure(
        self, key_id: str, observed_generation: int
    ) -> Any | None:
        """Refresh a known key at most once per cache generation.

        A failed signature may indicate a provider key rotation that reused a
        key identifier.  The first failure refreshes under the cache lock; later
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

            self._refresh()
            self._signature_refresh_generation_by_key[key_id] = self._generation
            return self._keys.get(key_id)

    def _refresh(self) -> None:
        jwk_set = PyJWKSet.from_dict(dict(self._fetcher(self._jwks_url)))
        self._keys = {
            key.key_id: key.key
            for key in jwk_set.keys
            if key.key_id is not None and key.key is not None
        }
        self._expires_at = monotonic() + self._cache_seconds
        self._generation += 1


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
        except AuthorizationError:
            raise
        except (
            AuthenticationError,
            InvalidTokenError,
            OSError,
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
