"""Pure primitive tests; these are not an integration or concurrency test suite."""

import hashlib
import hmac

import pytest

from app.services.simulated_finance import (
    FinanceValidationError,
    IllustrativePolicy,
    LedgerLine,
    validate_journal,
    verify_mock_signature,
)


def test_illustrative_policy_requires_consent_and_preserves_paise():
    policy = IllustrativePolicy(version=1, commission_basis_points=1234)
    assert policy.approved is False
    assert policy.simulate(101, consent=True) == (12, 89)
    with pytest.raises(FinanceValidationError):
        policy.simulate(101, consent=False)
    for amount in (-1, 1.5, True):
        with pytest.raises(FinanceValidationError):
            policy.simulate(amount, consent=True)


def test_policy_rejects_invalid_rates():
    for value in (-1, 10001, True):
        with pytest.raises(FinanceValidationError):
            IllustrativePolicy(version=1, commission_basis_points=value)


def test_journal_balances_and_is_frozen():
    debit = LedgerLine("mock_receivable", debit_paise=101)
    credit = LedgerLine("mock_liability", credit_paise=101)
    validate_journal((debit, credit))
    with pytest.raises(AttributeError):
        debit.debit_paise = 102
    with pytest.raises(FinanceValidationError):
        validate_journal((debit, LedgerLine("mock_liability", credit_paise=100)))
    with pytest.raises(FinanceValidationError):
        LedgerLine("x", debit_paise=1, credit_paise=1)
    with pytest.raises(FinanceValidationError):
        validate_journal((debit,))


def test_timestamped_signature_checks_raw_body_and_freshness():
    secret = b"x" * 32
    body = b'{"event":"test"}'
    signature = hmac.new(secret, b"1000." + body, hashlib.sha256).hexdigest()
    assert verify_mock_signature(body, 1000, signature, secret=secret, now=1300)
    assert not verify_mock_signature(
        body + b" ", 1000, signature, secret=secret, now=1000
    )
    assert not verify_mock_signature(body, 1000, signature, secret=secret, now=1301)
    assert not verify_mock_signature(body, 1000, signature, secret=b"short", now=1000)
    assert not verify_mock_signature(body, 1000, "z" * 64, secret=secret, now=1000)
