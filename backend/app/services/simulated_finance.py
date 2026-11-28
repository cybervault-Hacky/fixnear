"""Pure, disconnected primitives for a future simulated finance engine.

Not an API or payment provider. No persistence, replay protection, locking, or
money movement is provided here; callers must not use this for live payments.
"""

import hashlib
import hmac
from dataclasses import dataclass


class FinanceValidationError(ValueError):
    """Invalid simulated financial input."""


def _paise(value: int) -> None:
    if type(value) is not int or value < 0:
        raise FinanceValidationError("Amounts must be nonnegative integer paise.")


@dataclass(frozen=True)
class IllustrativePolicy:
    """Versioned, explicitly consented simulation parameters, not commercial rates."""

    version: int
    commission_basis_points: int
    approved: bool = False

    def __post_init__(self) -> None:
        if type(self.version) is not int or self.version < 1:
            raise FinanceValidationError("Policy version must be a positive integer.")
        if (
            type(self.commission_basis_points) is not int
            or not 0 <= self.commission_basis_points <= 10_000
        ):
            raise FinanceValidationError(
                "Commission must be between 0 and 10000 basis points."
            )
        if type(self.approved) is not bool:
            raise FinanceValidationError("Approval must be boolean.")

    def simulate(self, amount_paise: int, *, consent: bool) -> tuple[int, int]:
        """Return illustrative platform and technician amounts; never charge either party."""
        _paise(amount_paise)
        if consent is not True:
            raise FinanceValidationError("Explicit consent is required for simulation.")
        platform = amount_paise * self.commission_basis_points // 10_000
        return platform, amount_paise - platform


@dataclass(frozen=True)
class LedgerLine:
    """A debit or credit in a single simulated INR journal entry."""

    account: str
    debit_paise: int = 0
    credit_paise: int = 0

    def __post_init__(self) -> None:
        if not isinstance(self.account, str) or not self.account.strip():
            raise FinanceValidationError("Account is required.")
        _paise(self.debit_paise)
        _paise(self.credit_paise)
        if (self.debit_paise > 0) == (self.credit_paise > 0):
            raise FinanceValidationError("Exactly one side must be positive.")


def validate_journal(lines: tuple[LedgerLine, ...]) -> None:
    """Check a simulated entry balances; does not persist or enforce immutability in a DB."""
    if len(lines) < 2 or any(not isinstance(line, LedgerLine) for line in lines):
        raise FinanceValidationError("A journal needs at least two ledger lines.")
    if sum(line.debit_paise for line in lines) != sum(
        line.credit_paise for line in lines
    ):
        raise FinanceValidationError("Journal is not balanced.")


def verify_mock_signature(
    body: bytes,
    timestamp: int,
    signature: str,
    *,
    secret: bytes,
    now: int,
    tolerance_seconds: int = 300,
) -> bool:
    """Verify timestamped HMAC-SHA256; persistent replay protection is NOT supplied.

    Sign the ASCII decimal timestamp, a period, and the exact raw request body.
    A future callback must atomically record unique event IDs in the same database
    transaction as its effects, independently of this signature check.
    """
    if (
        not isinstance(body, bytes)
        or not isinstance(secret, bytes)
        or len(secret) < 32
        or type(timestamp) is not int
        or type(now) is not int
        or type(tolerance_seconds) is not int
        or tolerance_seconds < 0
        or not isinstance(signature, str)
        or len(signature) != 64
        or any(c not in "0123456789abcdef" for c in signature)
    ):
        return False
    if abs(now - timestamp) > tolerance_seconds:
        return False
    digest = hmac.new(
        secret, str(timestamp).encode("ascii") + b"." + body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(digest, signature)
