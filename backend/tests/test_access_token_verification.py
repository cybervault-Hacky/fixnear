"""Supabase JWT checks use generated keys and never contact a real JWKS endpoint."""

import json
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec, rsa
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from jwt import PyJWK, PyJWKClient
from jwt.algorithms import ECAlgorithm, RSAAlgorithm

from app.auth.dependencies import get_current_identity
from app.auth.tokens import (
    InvalidAccessToken,
    SupabaseAccessTokenVerifier,
)

ISSUER = 'https://supabase.invalid/auth/v1'
AUDIENCE = 'authenticated'
KID = 'offline-test-key'


def make_jwk_data(
    public_key,
    *,
    kid: str = KID,
    algorithm: str = 'RS256',
) -> dict[str, str]:
    if isinstance(public_key, rsa.RSAPublicKey):
        jwk_data = json.loads(RSAAlgorithm.to_jwk(public_key))
    elif isinstance(public_key, ec.EllipticCurvePublicKey):
        jwk_data = json.loads(ECAlgorithm.to_jwk(public_key))
    else:
        raise TypeError('Unsupported synthetic test public-key type.')

    jwk_data.update({'kid': kid, 'use': 'sig', 'alg': algorithm})
    return jwk_data


def make_jwk(public_key, *, kid: str = KID, algorithm: str = 'RS256') -> PyJWK:
    return PyJWK.from_dict(make_jwk_data(public_key, kid=kid, algorithm=algorithm))


class StaticKeyResolver:
    """Offline signing-key resolver that selects a generated key by kid."""

    def __init__(
        self,
        public_key,
        *,
        kid: str = KID,
        algorithm: str = 'RS256',
    ) -> None:
        self.kid = kid
        self.signing_key = make_jwk(public_key, kid=kid, algorithm=algorithm)

    def get_signing_key_from_jwt(self, token: str) -> PyJWK:
        header = jwt.get_unverified_header(token)
        if header.get('kid') != self.kid:
            raise ValueError('synthetic signing key not found')
        return self.signing_key


@pytest.fixture
def signing_keys():
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return private_key, private_key.public_key()


def make_verifier(
    public_key,
    *,
    kid: str = KID,
    key_algorithm: str = 'RS256',
) -> SupabaseAccessTokenVerifier:
    return SupabaseAccessTokenVerifier(
        key_resolver=StaticKeyResolver(public_key, kid=kid, algorithm=key_algorithm),
        issuer=ISSUER,
        audience=AUDIENCE,
        leeway_seconds=0,
    )


def issue_token(
    private_key,
    *,
    kid: str = KID,
    algorithm: str = 'RS256',
    **overrides: object,
) -> str:
    now = datetime.now(timezone.utc)  # noqa: UP017 - keep Python 3.10 compatibility
    claims: dict[str, object] = {
        'sub': str(uuid4()),
        'iss': ISSUER,
        'aud': AUDIENCE,
        'iat': int(now.timestamp()),
        'exp': int((now + timedelta(minutes=5)).timestamp()),
        # This value is intentionally not mapped into VerifiedIdentity.
        'role': 'admin',
    }
    claims.update(overrides)
    return jwt.encode(claims, private_key, algorithm=algorithm, headers={'kid': kid})


def test_valid_token_returns_only_a_verified_external_identity(signing_keys) -> None:
    private_key, public_key = signing_keys
    subject = uuid4()
    token = issue_token(private_key, sub=str(subject))

    identity = make_verifier(public_key).verify(token)

    assert identity.subject == subject
    assert identity.issuer == ISSUER
    assert isinstance(identity.issued_at, int)
    assert isinstance(identity.expires_at, int)
    assert not hasattr(identity, 'role')
    assert not hasattr(identity, 'roles')


def test_es256_is_accepted_with_its_matching_jwks_key() -> None:
    private_key = ec.generate_private_key(ec.SECP256R1())
    token = issue_token(private_key, kid='ec-test-key', algorithm='ES256')

    identity = make_verifier(
        private_key.public_key(),
        kid='ec-test-key',
        key_algorithm='ES256',
    ).verify(token)

    assert identity.issuer == ISSUER


@pytest.mark.parametrize(
    ('claim', 'value'),
    [
        ('iss', 'https://attacker.invalid/auth/v1'),
        ('aud', 'wrong-audience'),
        ('exp', 1),
        ('sub', 'not-a-uuid'),
    ],
)
def test_wrong_issuer_audience_expired_or_malformed_subject_is_rejected(
    signing_keys,
    claim: str,
    value: object,
) -> None:
    private_key, public_key = signing_keys
    token = issue_token(private_key, **{claim: value})

    with pytest.raises(InvalidAccessToken, match='^Invalid access token\\.$'):
        make_verifier(public_key).verify(token)


def test_not_yet_valid_token_is_rejected(signing_keys) -> None:
    private_key, public_key = signing_keys
    now = datetime.now(timezone.utc)  # noqa: UP017 - keep Python 3.10 compatibility
    future_nbf = int((now + timedelta(minutes=5)).timestamp())
    token = issue_token(private_key, nbf=future_nbf)

    with pytest.raises(InvalidAccessToken):
        make_verifier(public_key).verify(token)


def test_invalid_signature_is_rejected(signing_keys) -> None:
    private_key, _ = signing_keys
    wrong_private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    token = issue_token(wrong_private_key)

    with pytest.raises(InvalidAccessToken):
        make_verifier(private_key.public_key()).verify(token)


def test_symmetric_or_unlisted_algorithms_are_rejected_before_key_resolution(
    signing_keys,
) -> None:
    _private_key, public_key = signing_keys
    token = jwt.encode(
        {
            'sub': str(uuid4()),
            'iss': ISSUER,
            'aud': AUDIENCE,
            'iat': 2_000_000_000,
            'exp': 2_000_000_300,
        },
        'test-only-symmetric-key-with-32-bytes',
        algorithm='HS256',
        headers={'kid': KID},
    )

    with pytest.raises(InvalidAccessToken):
        make_verifier(public_key).verify(token)


def test_jwk_declared_algorithm_must_match_token_algorithm(signing_keys) -> None:
    private_key, public_key = signing_keys
    token = issue_token(private_key, algorithm='RS256')

    with pytest.raises(InvalidAccessToken):
        make_verifier(public_key, key_algorithm='PS256').verify(token)


def test_unknown_signing_key_is_rejected_without_leaking_resolver_error(signing_keys) -> None:
    private_key, public_key = signing_keys
    token = issue_token(private_key, kid='unknown-kid')

    with pytest.raises(InvalidAccessToken, match='^Invalid access token\\.$'):
        make_verifier(public_key).verify(token)


def test_pyjwt_jwks_client_selects_by_kid_and_refreshes_after_rotation(monkeypatch) -> None:
    old_private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    new_private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    old_kid = 'synthetic-old-key'
    new_kid = 'synthetic-new-key'
    jwks_state = {
        'keys': [make_jwk_data(old_private_key.public_key(), kid=old_kid)]
    }
    fetch_count = 0

    resolver = PyJWKClient(
        'https://supabase.invalid/auth/v1/.well-known/jwks.json',
        cache_jwk_set=True,
        lifespan=300,
        timeout=1,
    )

    def fake_fetch_data() -> dict[str, list[dict[str, object]]]:
        nonlocal fetch_count
        fetch_count += 1
        return {'keys': list(jwks_state['keys'])}

    monkeypatch.setattr(resolver, 'fetch_data', fake_fetch_data)
    # Avoid a real delay in PyJWT versions that cool down unknown-kid refreshes.
    if hasattr(resolver, 'cooldown_duration'):
        resolver.cooldown_duration = 0

    verifier = SupabaseAccessTokenVerifier(
        key_resolver=resolver,
        issuer=ISSUER,
        audience=AUDIENCE,
        leeway_seconds=0,
    )
    old_token = issue_token(old_private_key, kid=old_kid)
    assert verifier.verify(old_token).issuer == ISSUER
    assert fetch_count == 1

    jwks_state['keys'] = [make_jwk_data(new_private_key.public_key(), kid=new_kid)]
    new_token = issue_token(new_private_key, kid=new_kid)

    assert verifier.verify(new_token).issuer == ISSUER
    assert fetch_count == 2


def test_fastapi_dependency_returns_generic_401_for_malformed_token(
    signing_keys,
    monkeypatch,
) -> None:
    _private_key, public_key = signing_keys
    leaked_value = 'malformed-token-with-sensitive-marker'
    credentials = HTTPAuthorizationCredentials(scheme='Bearer', credentials=leaked_value)
    monkeypatch.setattr(
        'app.auth.dependencies.get_access_token_verifier',
        lambda: make_verifier(public_key),
    )

    with pytest.raises(HTTPException) as error:
        get_current_identity(credentials)

    assert error.value.status_code == 401
    assert error.value.detail == {
        'code': 'unauthorized',
        'message': 'Authentication required.',
    }
    assert leaked_value not in str(error.value.detail)


def test_missing_bearer_credentials_are_401() -> None:
    with pytest.raises(HTTPException) as error:
        get_current_identity(None)

    assert error.value.status_code == 401
    assert error.value.detail == {
        'code': 'unauthorized',
        'message': 'Authentication required.',
    }
