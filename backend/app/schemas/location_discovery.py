"""Privacy-conscious public service-area discovery contracts."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class NearbyTechnicianSearchRequest(BaseModel):
    """Search payload keeps precise browser coordinates out of request URLs and access logs."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    mode: Literal["coordinates", "manual_area"]
    area: Annotated[str, Field(min_length=1, max_length=120)] | None = None
    city: Annotated[str, Field(min_length=1, max_length=120)] | None = None
    state: Annotated[str, Field(min_length=1, max_length=120)] | None = None
    postal_code: Annotated[str, Field(min_length=1, max_length=12)] | None = None
    latitude: Annotated[float, Field(ge=-90, le=90)] | None = None
    longitude: Annotated[float, Field(ge=-180, le=180)] | None = None
    radius_km: Annotated[float, Field(gt=0, le=100)] = 25
    limit: Annotated[int, Field(ge=1, le=100)] = 25
    offset: Annotated[int, Field(ge=0, le=100000)] = 0

    @model_validator(mode="after")
    def validate_location_mode(self):
        has_latitude = self.latitude is not None
        has_longitude = self.longitude is not None
        if self.mode == "coordinates":
            if has_latitude != has_longitude or not has_latitude:
                raise ValueError(
                    "Provide both coordinates for a device-location search."
                )
            if any((self.area, self.city, self.state, self.postal_code)):
                raise ValueError("Choose either device location or manual area fields.")
        else:
            if has_latitude or has_longitude:
                raise ValueError(
                    "Use device-location mode when coordinates are supplied."
                )
            if not any((self.area, self.city, self.postal_code)):
                raise ValueError(
                    "Enter an area, city, or PIN code for a manual search."
                )
        return self


class NearbyTechnicianResponse(BaseModel):
    """Public service profile with only an approximate service-area center."""

    user_id: UUID
    display_name: str
    professional_description: str
    years_experience: int | None
    service_slug: str
    service_title: str
    verification_approved: Literal[True] = True
    coverage_area: str
    coverage_city: str
    coverage_state: str
    coverage_postal_code: str
    latitude: float | None
    longitude: float | None
    distance_km: float | None
    distance_basis: Literal["approximate_service_area_center"] | None


class NearbyTechnicianListResponse(BaseModel):
    service_slug: str
    results: list[NearbyTechnicianResponse]
    total: int
    limit: int
    offset: int
    sort: Literal["distance", "service_area"]
    location_mode: Literal["coordinates", "manual_area"]
    note: str


class PublicCoverageAreaResponse(BaseModel):
    area_name: str
    city: str
    state: str
    postal_code: str
    latitude: float | None
    longitude: float | None


class PublicTechnicianServiceProfileResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: UUID
    display_name: str
    professional_description: str
    years_experience: int | None
    verification_approved: Literal[True] = True
    service_slug: str
    service_title: str
    service_description: str
    coverage_areas: list[PublicCoverageAreaResponse]
    note: str
