"""Strict, network-injectable Supabase access-token verification."""

from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

import jwt
from jwt import PyJWK, PyJWKClient

ALLOWED_SIGNING_ALGORITHMS = frozenset({'ES256', 'RS256'})
MAX_ACCESS_TOKEN_LENGTH = 16_384


class InvalidAccessToken(Exception):
    """Raised with a fixed message when a bearer token cannot be trusted."""

    def __init__(self) -> None:
        super().__init__('Invalid access token.')


class AuthConfigurationError(Exception):
    """Raised when required verifier settings are absent or unsafe."""

    def __init__(self) -> None:
        super().__init__('Authentication verifier is not configured.')


class SigningKeyResolver(Protocol):
    """Minimal interface implemented by PyJWKClient and offline test doubles."""

    def get_signing_key_from_jwt(self, token: str) -> PyJWK: ...


@dataclass(frozen=True, slots=True)
class VerifiedIdentity:
    """The only JWT-derived identity accepted by application authorization."""

    subject: UUID
    issuer: str
    issued_at: int
    expires_at: int


class SupabaseAccessTokenVerifier:
    """Validate a Supabase JWT signature and required standard claims."""

    def __init__(
        self,
        *,
        key_resolver: SigningKeyResolver,
        issuer: str,
        audience: str,
        leeway_seconds: int = 30,
        allowed_algorithms: frozenset[str] = ALLOWED_SIGNING_ALGORITHMS,
    ) -> None:
        if not issuer or not audience or leeway_seconds < 0:
            raise AuthConfigurationError()
        if not allowed_algorithms or not allowed_algorithms <= ALLOWED_SIGNING_ALGORITHMS:
            raise AuthConfigurationError()

        self._key_resolver = key_resolver
        self._issuer = issuer
        self._audience = audience
        self._leeway_seconds = leeway_seconds
        self._allowed_algorithms = allowed_algorithms

    def verify(self, token: str) -> VerifiedIdentity:
        """Verify token cryptography and identity claims; never return role claims."""

        if not token or len(token) > MAX_ACCESS_TOKEN_LENGTH:
            raise InvalidAccessToken()

        try:
            header = jwt.get_unverified_header(token)
            algorithm = header.get('alg')
            key_id = header.get('kid')
            if algorithm not in self._allowed_algorithms or not isinstance(key_id, str) or not key_id:
                raise InvalidAccessToken()
        except InvalidAccessToken:
            raise
        except (jwt.PyJWTError, TypeError, ValueError):
            raise InvalidAccessToken() from None

        try:
            signing_key = self._key_resolver.get_signing_key_from_jwt(token)
        except Exception:  # noqa: BLE001 - normalize JWKS/network/library errors without leaking details.
            # JWKS/network/library errors must not leak URLs, tokens, or provider details.
            raise InvalidAccessToken() from None

        if not isinstance(signing_key, PyJWK) or signing_key.algorithm_name != algorithm:
            raise InvalidAccessToken()

        try:
            claims = jwt.decode(
                token,
                signing_key,
                algorithms=tuple(sorted(self._allowed_algorithms)),
                audience=self._audience,
                issuer=self._issuer,
                leeway=self._leeway_seconds,
                options={
                    'require': ['sub', 'iss', 'aud', 'iat', 'exp'],
                    'verify_signature': True,
                    'verify_exp': True,
                    'verify_nbf': True,
                    'verify_iat': True,
                    'verify_aud': True,
                    'verify_iss': True,
                },
            )
            subject_claim = claims.get('sub')
            issuer_claim = claims.get('iss')
            issued_at_claim = claims.get('iat')
            expires_at_claim = claims.get('exp')
            if (
                not isinstance(subject_claim, str)
                or not isinstance(issuer_claim, str)
                or not isinstance(issued_at_claim, int)
                or isinstance(issued_at_claim, bool)
                or not isinstance(expires_at_claim, int)
                or isinstance(expires_at_claim, bool)
            ):
                raise InvalidAccessToken()

            return VerifiedIdentity(
                subject=UUID(subject_claim),
                issuer=issuer_claim,
                issued_at=issued_at_claim,
                expires_at=expires_at_claim,
            )
        except InvalidAccessToken:
            raise
        except (jwt.PyJWTError, TypeError, ValueError, OverflowError):
            raise InvalidAccessToken() from None


def build_supabase_verifier(
    *,
    jwks_url: str | None,
    issuer: str | None,
    audience: str,
    cache_ttl_seconds: int,
    leeway_seconds: int,
) -> SupabaseAccessTokenVerifier:
    """Build a production JWKS-backed verifier without fetching keys at startup."""

    if not jwks_url or not issuer or not audience or cache_ttl_seconds < 30:
        raise AuthConfigurationError()
    if not jwks_url.startswith('https://'):
        raise AuthConfigurationError()

    key_resolver = PyJWKClient(
        jwks_url,
        cache_jwk_set=True,
        lifespan=cache_ttl_seconds,
        timeout=5,
    )
    return SupabaseAccessTokenVerifier(
        key_resolver=key_resolver,
        issuer=issuer,
        audience=audience,
        leeway_seconds=leeway_seconds,
    )
