"""Response schema for the API health checks."""

from typing import Literal

from pydantic import BaseModel, ConfigDict


class HealthResponse(BaseModel):
    """Stable response contract shared by both health endpoints."""

    model_config = ConfigDict(frozen=True)

    status: Literal['ok']
    service: str
    version: str
