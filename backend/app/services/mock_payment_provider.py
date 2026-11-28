"""Deterministic simulated provider event construction; no network or money movement.

This module is not a webhook processor. Signatures alone cannot prevent replay.
"""

import hashlib
import hmac
import json
from typing import Literal, Protocol
from uuid import NAMESPACE_URL, UUID, uuid5

Outcome = Literal["success", "failure", "cancellation", "expiration", "delayed"]


class PaymentProvider(Protocol):
    def reference(self, attempt_id: UUID) -> str: ...
    def event(self, attempt_id: UUID, outcome: Outcome) -> bytes: ...


class MockPaymentProvider:
    """Stable, simulation-labelled identifiers and data; never calls a service."""

    def reference(self, attempt_id: UUID) -> str:
        return f"SIMULATED-{attempt_id.hex}"

    def event(self, attempt_id: UUID, outcome: Outcome) -> bytes:
        if outcome not in (
            "success",
            "failure",
            "cancellation",
            "expiration",
            "delayed",
        ):
            raise ValueError("Unsupported simulated outcome.")
        event_id = uuid5(NAMESPACE_URL, f"fixnear-mock:{attempt_id}:{outcome}")
        return json.dumps(
            {
                "event_id": str(event_id),
                "attempt_id": str(attempt_id),
                "provider_reference": self.reference(attempt_id),
                "outcome": outcome,
                "simulated": True,
            },
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")


def sign_test_event(body: bytes, timestamp: int, *, secret: bytes) -> str:
    """For local tests only. No key is configured or stored by this module."""
    if len(secret) < 32:
        raise ValueError("Test secret must be at least 32 bytes.")
    return hmac.new(
        secret, str(timestamp).encode("ascii") + b"." + body, hashlib.sha256
    ).hexdigest()
