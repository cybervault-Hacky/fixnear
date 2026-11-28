"""Shared fixtures for the FixNear backend test suite."""

from collections.abc import Iterator

import pytest

from app.core import rate_limit
from tests.test_account_authorization import (
    authenticated_client,
    authorization_database,
)
from tests.test_booking_management import booking_api
from tests.test_homepassport import passport_api

__all__ = ["authenticated_client", "authorization_database", "booking_api", "passport_api"]


@pytest.fixture(autouse=True)
def fresh_rate_limit_store() -> Iterator[None]:
    """Give every test an isolated in-memory rate-limit bucket.

    Prevents cross-test accumulation in the shared ip:testclient bucket while
    keeping the middleware and dependencies enabled, so 429/503 behavior is
    exercised end-to-end in the suite.
    """

    rate_limit.set_rate_limit_store(rate_limit.InMemoryRateLimitStore())
    yield
    rate_limit.set_rate_limit_store(None)
