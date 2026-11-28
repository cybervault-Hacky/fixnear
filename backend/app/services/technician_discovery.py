"""Public discovery from approved technician service coverage, never home addresses."""

import math
import re
import unicodedata
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    AppUser,
    Service,
    ServiceCategory,
    TechnicianCoverageArea,
    TechnicianProfile,
    TechnicianSkill,
    UserRole,
)

EARTH_RADIUS_KM = 6371.0088


def _normalize(value: str | None) -> str:
    return re.sub(
        r"\s+", " ", unicodedata.normalize("NFKC", value or "").strip()
    ).casefold()


def haversine_km(
    latitude_a: float, longitude_a: float, latitude_b: float, longitude_b: float
) -> float:
    """Return great-circle distance in kilometers between explicitly supplied coordinates."""

    lat_a, lat_b = math.radians(latitude_a), math.radians(latitude_b)
    delta_lat = lat_b - lat_a
    delta_lon = math.radians(longitude_b - longitude_a)
    value = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat_a) * math.cos(lat_b) * math.sin(delta_lon / 2) ** 2
    )
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(value)))


def _active_service(session: Session, slug: str) -> Service:
    service = session.scalar(
        select(Service)
        .join(ServiceCategory, ServiceCategory.id == Service.category_id)
        .where(
            Service.slug == slug,
            Service.is_active.is_(True),
            ServiceCategory.is_active.is_(True),
        )
    )
    if service is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "Service guide not found."},
        )
    return service


def _eligible_rows(
    session: Session, service: Service, technician_user_id: UUID | None = None
):
    statement = (
        select(TechnicianProfile, TechnicianCoverageArea)
        .join(AppUser, AppUser.id == TechnicianProfile.user_id)
        .join(UserRole, UserRole.user_id == AppUser.id)
        .join(
            TechnicianSkill,
            TechnicianSkill.technician_user_id == TechnicianProfile.user_id,
        )
        .join(
            TechnicianCoverageArea,
            TechnicianCoverageArea.technician_user_id == TechnicianProfile.user_id,
        )
        .where(
            AppUser.status == "active",
            UserRole.role_code == "technician",
            TechnicianProfile.verification_status == "approved",
            TechnicianSkill.service_id == service.id,
        )
    )
    if technician_user_id is not None:
        statement = statement.where(TechnicianProfile.user_id == technician_user_id)
    return session.execute(
        statement.order_by(
            TechnicianProfile.display_name, TechnicianCoverageArea.area_name
        )
    ).all()


def _coverage_label(area: TechnicianCoverageArea) -> str:
    return ", ".join(part for part in (area.area_name, area.city) if part)


def _nearby_payload(
    profile: TechnicianProfile,
    area: TechnicianCoverageArea,
    service: Service,
    distance_km: float | None,
) -> dict[str, Any]:
    return {
        "user_id": profile.user_id,
        "display_name": profile.display_name,
        "professional_description": profile.professional_description,
        "years_experience": profile.years_experience,
        "service_slug": service.slug,
        "service_title": service.title,
        "verification_approved": True,
        "coverage_area": _coverage_label(area),
        "coverage_city": area.city,
        "coverage_state": area.state,
        "coverage_postal_code": area.postal_code,
        # Map markers are deliberately coarse service-area centers, not technician homes.
        "latitude": round(area.center_latitude, 2)
        if area.center_latitude is not None
        else None,
        "longitude": round(area.center_longitude, 2)
        if area.center_longitude is not None
        else None,
        "distance_km": round(distance_km, 1) if distance_km is not None else None,
        "distance_basis": "approximate_service_area_center"
        if distance_km is not None
        else None,
    }


def list_nearby_technicians(
    session: Session,
    *,
    service_slug: str,
    area: str | None,
    city: str | None,
    state: str | None,
    postal_code: str | None,
    latitude: float | None,
    longitude: float | None,
    radius_km: float,
    limit: int = 25,
    offset: int = 0,
) -> dict[str, Any]:
    """Filter eligible providers by explicit search area or by their approximate coverage centers."""

    service = _active_service(session, service_slug)
    has_coordinates = latitude is not None and longitude is not None
    if not has_coordinates and not any(
        _normalize(value) for value in (area, city, postal_code)
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "location_required",
                "message": "Use browser location with permission or enter an area, city, or PIN code.",
            },
        )

    normalized_area = _normalize(area)
    normalized_city = _normalize(city)
    normalized_state = _normalize(state)
    normalized_postal = _normalize(postal_code)
    candidates: dict[
        UUID, tuple[TechnicianProfile, TechnicianCoverageArea, float | None]
    ] = {}

    for profile, coverage in _eligible_rows(session, service):
        distance = None
        if has_coordinates:
            if coverage.center_latitude is None or coverage.center_longitude is None:
                continue
            distance = haversine_km(
                latitude, longitude, coverage.center_latitude, coverage.center_longitude
            )
            if distance > radius_km:
                continue
        else:
            if normalized_area and _normalize(coverage.area_name) != normalized_area:
                continue
            if normalized_city and _normalize(coverage.city) != normalized_city:
                continue
            if normalized_state and _normalize(coverage.state) != normalized_state:
                continue
            if (
                normalized_postal
                and _normalize(coverage.postal_code) != normalized_postal
            ):
                continue

        previous = candidates.get(profile.user_id)
        if (
            previous is None
            or has_coordinates
            and distance is not None
            and (previous[2] is None or distance < previous[2])
        ):
            candidates[profile.user_id] = (profile, coverage, distance)

    candidate_rows = list(candidates.values())
    if has_coordinates:
        candidate_rows.sort(
            key=lambda item: (
                item[2] if item[2] is not None else math.inf,
                item[0].display_name.casefold(),
                str(item[0].user_id),
            )
        )
        sort = "distance"
        mode = "coordinates"
        note = (
            "Distance is approximate to a technician-entered service-area center. "
            "No live technician location, availability, or appointment time is checked."
        )
    else:
        candidate_rows.sort(
            key=lambda item: (
                _coverage_label(item[1]).casefold(),
                item[0].display_name.casefold(),
                str(item[0].user_id),
            )
        )
        sort = "service_area"
        mode = "manual_area"
        note = (
            "Results match the selected service coverage. No distance is calculated without "
            "both search coordinates and a service-area center; availability is not checked."
        )
    results = [
        _nearby_payload(profile, coverage, service, distance)
        for profile, coverage, distance in candidate_rows[offset : offset + limit]
    ]
    return {
        "service_slug": service.slug,
        "results": results,
        "total": len(candidate_rows),
        "limit": limit,
        "offset": offset,
        "sort": sort,
        "location_mode": mode,
        "note": note,
    }


def read_public_technician_service_profile(
    session: Session,
    *,
    technician_user_id: UUID,
    service_slug: str,
) -> dict[str, Any]:
    service = _active_service(session, service_slug)
    rows = _eligible_rows(session, service, technician_user_id=technician_user_id)
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "not_found",
                "message": "Technician service profile not found.",
            },
        )
    profile = rows[0][0]
    coverage_areas: dict[str, TechnicianCoverageArea] = {}
    for _profile, area in rows:
        coverage_areas.setdefault(area.area_key, area)
    return {
        "user_id": profile.user_id,
        "display_name": profile.display_name,
        "professional_description": profile.professional_description,
        "years_experience": profile.years_experience,
        "verification_approved": True,
        "service_slug": service.slug,
        "service_title": service.title,
        "service_description": service.description,
        "coverage_areas": [
            {
                "area_name": area.area_name,
                "city": area.city,
                "state": area.state,
                "postal_code": area.postal_code,
                "latitude": round(area.center_latitude, 2)
                if area.center_latitude is not None
                else None,
                "longitude": round(area.center_longitude, 2)
                if area.center_longitude is not None
                else None,
            }
            for area in sorted(
                coverage_areas.values(), key=lambda item: (item.city, item.area_name)
            )
        ],
        "note": "Profile visibility requires an active account, approved verification, an active service skill, and a saved service area. No live availability is provided.",
    }
