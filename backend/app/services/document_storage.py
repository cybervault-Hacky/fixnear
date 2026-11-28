"""Storage abstraction for private appliance documents; unconfigured by default."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Protocol
from uuid import UUID


@dataclass(frozen=True)
class DocumentUploadIntent:
    provider: str
    object_key: str
    upload_url: str
    headers: dict[str, str] = field(default_factory=dict)
    expires_at: datetime | None = None


class DocumentStorage(Protocol):
    """Private adapter contract for signed document uploads."""

    def create_upload_intent(
        self,
        *,
        document_id: UUID,
        owner_user_id: UUID,
        original_filename: str,
        content_type: str,
        size_bytes: int,
    ) -> DocumentUploadIntent: ...

    def delete_object(self, *, storage_key: str) -> None: ...


def get_document_storage() -> DocumentStorage | None:
    """Return no storage driver until one is explicitly configured and tested."""

    return None
