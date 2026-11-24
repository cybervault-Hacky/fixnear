"""Public read-only service category and guide endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db_session
from app.schemas.location_discovery import (
    NearbyTechnicianListResponse,
    NearbyTechnicianSearchRequest,
)
from app.schemas.service_catalog import ServiceCategoryResponse, ServiceResponse
from app.services.service_catalog import (
    get_public_service,
    list_public_categories,
    list_public_services,
)
from app.services.technician_discovery import list_nearby_technicians

router = APIRouter(prefix="/services", tags=["service catalog"])
DatabaseSession = Annotated[Session, Depends(get_db_session)]


@router.get("/categories", response_model=list[ServiceCategoryResponse])
def read_public_service_categories(
    session: DatabaseSession,
) -> list[ServiceCategoryResponse]:
    """Return only active categories, ordered for customer discovery."""

    return [
        ServiceCategoryResponse.model_validate(category)
        for category in list_public_categories(session)
    ]


@router.get("", response_model=list[ServiceResponse])
def read_public_services(
    session: DatabaseSession,
    category: Annotated[str | None, Query(min_length=1, max_length=80)] = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
) -> list[ServiceResponse]:
    """List active services with optional category and symptom search filters."""

    services = list_public_services(session, category_slug=category, query=q)
    return [ServiceResponse.model_validate(service) for service in services]


@router.post(
    "/{slug}/nearby-technicians/search", response_model=NearbyTechnicianListResponse
)
def read_nearby_technicians(
    slug: str,
    request: NearbyTechnicianSearchRequest,
    session: DatabaseSession,
) -> NearbyTechnicianListResponse:
    """Search approved service coverage without putting precise location in a URL."""

    return NearbyTechnicianListResponse.model_validate(
        list_nearby_technicians(
            session,
            service_slug=slug,
            area=request.area,
            city=request.city,
            state=request.state,
            postal_code=request.postal_code,
            latitude=request.latitude,
            longitude=request.longitude,
            radius_km=request.radius_km,
        )
    )


@router.get("/{slug}", response_model=ServiceResponse)
def read_public_service(slug: str, session: DatabaseSession) -> ServiceResponse:
    """Return an active service guide only when its category is also active."""

    return ServiceResponse.model_validate(get_public_service(session, slug))
