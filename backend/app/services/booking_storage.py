"""Storage-neutral upload-intent contract; no external storage driver is configured."""

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol
from uuid import UUID


@dataclass(frozen=True)
class SignedUploadIntent:
    provider: str
    object_key: str
    upload_url: str
    headers: dict[str, str]
    expires_at: datetime


class BookingAttachmentStorage(Protocol):
    """Private adapter contract for future signed uploads; it never accepts file bytes."""

    def create_upload_intent(
        self,
        *,
        booking_id: UUID,
        attachment_id: UUID,
        original_filename: str,
        content_type: str,
        size_bytes: int,
    ) -> SignedUploadIntent: ...


def get_booking_attachment_storage() -> BookingAttachmentStorage | None:
    """Return no storage driver until one is explicitly configured and tested."""

    return None
