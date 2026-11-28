"""Local-test-only mock webhook; no real provider or funds."""

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db_session
from app.services.mock_webhooks import MockEvent, process_mock_event
from app.services.simulated_finance import verify_mock_signature

router = APIRouter(tags=["mock webhook"])


def get_test_webhook_secret() -> bytes:
    settings = get_settings()
    secret = settings.mock_webhook_test_secret
    if settings.app_env.lower() not in {"development", "test"} or secret is None:
        raise HTTPException(status_code=503, detail="Mock webhook disabled.")
    value = secret.get_secret_value().encode("utf-8")
    if len(value) < 32:
        raise HTTPException(status_code=503, detail="Mock webhook disabled.")
    return value


@router.post("/webhooks/mock-payment")
async def mock_payment_webhook(
    request: Request,
    session: Annotated[Session, Depends(get_db_session)],
    secret: Annotated[bytes, Depends(get_test_webhook_secret)],
    timestamp: Annotated[int, Header(alias="X-Mock-Timestamp")],
    signature: Annotated[str, Header(alias="X-Mock-Signature", max_length=128)],
):
    chunks = bytearray()
    async for chunk in request.stream():
        chunks.extend(chunk)
        if len(chunks) > 8192:
            raise HTTPException(status_code=413, detail="Payload too large.")
    body = bytes(chunks)
    if not verify_mock_signature(
        body,
        timestamp,
        signature,
        secret=secret,
        now=int(datetime.now(UTC).timestamp()),
    ):
        raise HTTPException(status_code=401, detail="Invalid notification.")
    try:
        event = MockEvent.model_validate_json(body)
        if event.simulated is not True or len(event.provider_reference) > 80:
            raise ValueError("Invalid simulated notification")
    except (ValidationError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid notification.") from None
    result = process_mock_event(session, event, body, timestamp)
    if result == "conflict":
        raise HTTPException(status_code=409, detail="Notification conflict.")
    return {
        "status": "accepted" if result == "accepted" else "duplicate",
        "simulated": True,
    }
