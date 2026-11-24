"""Owner-scoped technician profile, skills, coverage, and review operations."""

import re
import unicodedata
from datetime import datetime, timezone
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from app.models import (
    AppUser,
    Service,
    ServiceCategory,
    TechnicianAvailabilityPreference,
    TechnicianCoverageArea,
    TechnicianProfile,
    TechnicianSkill,
    TechnicianVerificationReview,
    UserRole,
)
from app.schemas.accounts import RoleCode
from app.schemas.technician_management import (
    AdminVerificationDecisionRequest,
    TechnicianAvailabilityUpdateRequest,
    TechnicianCoverageUpdateRequest,
    TechnicianProfileUpdateRequest,
    TechnicianSkillsUpdateRequest,
)


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={'code': 'not_found', 'message': 'Technician profile not found.'},
    )


def _profile_for_user(session: Session, user_id: UUID) -> TechnicianProfile:
    profile = session.get(TechnicianProfile, user_id)
    if profile is None:
        raise _not_found()
    return profile


def _verification_changed(profile: TechnicianProfile) -> None:
    """Any edited verified/reviewed information must be submitted for review again."""

    if profile.verification_status != 'not_submitted':
        profile.verification_status = 'not_submitted'
        profile.verification_submitted_at = None
        profile.verification_reviewed_at = None


def _coverage_key(area_name: str, city: str, state: str, postal_code: str) -> str:
    values = [area_name, city, state, postal_code]
    normalized = [
        re.sub(r'\s+', ' ', unicodedata.normalize('NFKC', value).strip()).casefold()
        for value in values
    ]
    return '|'.join(normalized)


def _missing_onboarding_requirements(session: Session, profile: TechnicianProfile) -> list[str]:
    missing: list[str] = []
    if not profile.display_name.strip():
        missing.append('display_name')
    if len(profile.professional_description.strip()) < 30:
        missing.append('professional_description')
    if profile.years_experience is None:
        missing.append('years_experience')

    active_skill_count = session.scalar(
        select(TechnicianSkill.id)
        .join(Service, Service.id == TechnicianSkill.service_id)
        .join(ServiceCategory, ServiceCategory.id == Service.category_id)
        .where(
            TechnicianSkill.technician_user_id == profile.user_id,
            Service.is_active.is_(True),
            ServiceCategory.is_active.is_(True),
        )
        .limit(1)
    )
    if active_skill_count is None:
        missing.append('skills')

    area_count = session.scalar(
        select(TechnicianCoverageArea.id)
        .where(TechnicianCoverageArea.technician_user_id == profile.user_id)
        .limit(1)
    )
    if area_count is None:
        missing.append('coverage_areas')
    return missing


def _refresh_onboarding(session: Session, profile: TechnicianProfile) -> None:
    session.flush()
    profile.onboarding_status = (
        'complete' if not _missing_onboarding_requirements(session, profile) else 'incomplete'
    )
    session.flush()


def read_technician_profile(session: Session, user: AppUser) -> dict[str, object]:
    profile = _profile_for_user(session, user.id)
    return {
        'user_id': profile.user_id,
        'display_name': profile.display_name,
        'email': user.email,
        'professional_description': profile.professional_description,
        'years_experience': profile.years_experience,
        'onboarding_status': profile.onboarding_status,
        'verification_status': profile.verification_status,
        'verification_submitted_at': profile.verification_submitted_at,
        'verification_reviewed_at': profile.verification_reviewed_at,
        'created_at': profile.created_at,
        'updated_at': profile.updated_at,
    }


def update_technician_profile(
    session: Session,
    user: AppUser,
    request: TechnicianProfileUpdateRequest,
) -> dict[str, object]:
    profile = _profile_for_user(session, user.id)
    changed = False
    for field, value in request.model_dump(exclude_unset=True).items():
        if getattr(profile, field) != value:
            setattr(profile, field, value)
            changed = True
    if changed:
        _verification_changed(profile)
    _refresh_onboarding(session, profile)
    session.flush()
    return read_technician_profile(session, user)


def read_technician_skills(session: Session, user: AppUser) -> list[dict[str, object]]:
    _profile_for_user(session, user.id)
    rows = session.execute(
        select(TechnicianSkill, Service, ServiceCategory.is_active)
        .join(Service, Service.id == TechnicianSkill.service_id)
        .join(ServiceCategory, ServiceCategory.id == Service.category_id)
        .where(TechnicianSkill.technician_user_id == user.id)
        .order_by(Service.display_order, Service.title)
    ).all()
    return [
        {
            'service_id': service.id,
            'service_slug': service.slug,
            'title': service.title,
            'is_active': service.is_active and category_is_active,
            'years_experience': skill.years_experience,
        }
        for skill, service, category_is_active in rows
    ]


def update_technician_skills(
    session: Session,
    user: AppUser,
    request: TechnicianSkillsUpdateRequest,
) -> list[dict[str, object]]:
    profile = _profile_for_user(session, user.id)
    requested_slugs = [skill.service_slug for skill in request.skills]
    services = list(
        session.scalars(
            select(Service)
            .join(ServiceCategory, ServiceCategory.id == Service.category_id)
            .where(
                Service.slug.in_(requested_slugs),
                Service.is_active.is_(True),
                ServiceCategory.is_active.is_(True),
            )
        ).all()
    ) if requested_slugs else []
    service_by_slug = {service.slug: service for service in services}
    if set(service_by_slug) != set(requested_slugs):
        raise HTTPException(
            status_code=422,
            detail={'code': 'invalid_service', 'message': 'Skills may reference active services only.'},
        )

    current = list(
        session.scalars(
            select(TechnicianSkill).where(TechnicianSkill.technician_user_id == user.id)
        ).all()
    )
    current_by_id = {row.service_id: row.years_experience for row in current}
    next_by_id = {
        service_by_slug[skill.service_slug].id: skill.years_experience for skill in request.skills
    }
    changed = current_by_id != next_by_id
    if changed:
        session.execute(
            delete(TechnicianSkill).where(TechnicianSkill.technician_user_id == user.id)
        )
        session.add_all(
            [
                TechnicianSkill(
                    technician_user_id=user.id,
                    service_id=service_by_slug[skill.service_slug].id,
                    years_experience=skill.years_experience,
                )
                for skill in request.skills
            ]
        )
        _verification_changed(profile)
    _refresh_onboarding(session, profile)
    return read_technician_skills(session, user)


def read_technician_coverage(session: Session, user: AppUser) -> list[dict[str, object]]:
    _profile_for_user(session, user.id)
    areas = session.scalars(
        select(TechnicianCoverageArea)
        .where(TechnicianCoverageArea.technician_user_id == user.id)
        .order_by(TechnicianCoverageArea.city, TechnicianCoverageArea.area_name)
    ).all()
    return [
        {
            'id': area.id,
            'area_name': area.area_name,
            'city': area.city,
            'state': area.state,
            'postal_code': area.postal_code,
            'center_latitude': area.center_latitude,
            'center_longitude': area.center_longitude,
        }
        for area in areas
    ]


def update_technician_coverage(
    session: Session,
    user: AppUser,
    request: TechnicianCoverageUpdateRequest,
) -> list[dict[str, object]]:
    profile = _profile_for_user(session, user.id)
    current = list(
        session.scalars(
            select(TechnicianCoverageArea).where(
                TechnicianCoverageArea.technician_user_id == user.id
            )
        ).all()
    )
    current_by_key = {
        area.area_key: (
            area.area_name,
            area.city,
            area.state,
            area.postal_code,
            area.center_latitude,
            area.center_longitude,
        )
        for area in current
    }
    next_by_key = {
        _coverage_key(area.area_name, area.city, area.state, area.postal_code): (
            area.area_name,
            area.city,
            area.state,
            area.postal_code,
            area.center_latitude,
            area.center_longitude,
        )
        for area in request.areas
    }
    if current_by_key != next_by_key:
        session.execute(
            delete(TechnicianCoverageArea).where(
                TechnicianCoverageArea.technician_user_id == user.id
            )
        )
        session.add_all(
            [
                TechnicianCoverageArea(
                    technician_user_id=user.id,
                    area_name=area.area_name,
                    area_key=_coverage_key(area.area_name, area.city, area.state, area.postal_code),
                    city=area.city,
                    state=area.state,
                    postal_code=area.postal_code,
                    center_latitude=area.center_latitude,
                    center_longitude=area.center_longitude,
                )
                for area in request.areas
            ]
        )
        _verification_changed(profile)
    _refresh_onboarding(session, profile)
    return read_technician_coverage(session, user)


def _default_weekly_schedule() -> dict[str, dict[str, object]]:
    return {
        day: {'available': False, 'start': None, 'end': None}
        for day in ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')
    }


def read_technician_availability(session: Session, user: AppUser) -> dict[str, object]:
    _profile_for_user(session, user.id)
    preference = session.scalar(
        select(TechnicianAvailabilityPreference).where(
            TechnicianAvailabilityPreference.technician_user_id == user.id
        )
    )
    if preference is None:
        return {'timezone_name': 'Asia/Kolkata', 'weekly_schedule': _default_weekly_schedule()}
    return {
        'timezone_name': preference.timezone_name,
        'weekly_schedule': preference.weekly_schedule,
    }


def update_technician_availability(
    session: Session,
    user: AppUser,
    request: TechnicianAvailabilityUpdateRequest,
) -> dict[str, object]:
    _profile_for_user(session, user.id)
    try:
        ZoneInfo(request.timezone_name)
    except (ZoneInfoNotFoundError, ValueError):
        raise HTTPException(
            status_code=422,
            detail={'code': 'invalid_timezone', 'message': 'Select a recognized time zone.'},
        ) from None

    preference = session.scalar(
        select(TechnicianAvailabilityPreference).where(
            TechnicianAvailabilityPreference.technician_user_id == user.id
        )
    )
    schedule = request.model_dump(mode='json')['weekly_schedule']
    if preference is None:
        preference = TechnicianAvailabilityPreference(
            technician_user_id=user.id,
            timezone_name=request.timezone_name,
            weekly_schedule=schedule,
        )
        session.add(preference)
    else:
        preference.timezone_name = request.timezone_name
        preference.weekly_schedule = schedule
    session.flush()
    return {
        'timezone_name': preference.timezone_name,
        'weekly_schedule': preference.weekly_schedule,
    }


def read_onboarding(session: Session, user: AppUser) -> dict[str, object]:
    profile = _profile_for_user(session, user.id)
    missing = _missing_onboarding_requirements(session, profile)
    current_status = 'complete' if not missing else 'incomplete'
    if profile.onboarding_status != current_status:
        profile.onboarding_status = current_status
        session.flush()
    return {
        'onboarding_status': profile.onboarding_status,
        'verification_status': profile.verification_status,
        'missing_requirements': missing,
    }


def read_verification_status(session: Session, user: AppUser) -> dict[str, object]:
    profile = _profile_for_user(session, user.id)
    return {
        'verification_status': profile.verification_status,
        'onboarding_status': profile.onboarding_status,
        'verification_submitted_at': profile.verification_submitted_at,
        'verification_reviewed_at': profile.verification_reviewed_at,
    }


def submit_for_verification(session: Session, user: AppUser) -> dict[str, object]:
    profile = _profile_for_user(session, user.id)
    _refresh_onboarding(session, profile)
    if profile.onboarding_status != 'complete':
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                'code': 'onboarding_incomplete',
                'message': 'Complete the required profile, skill, and coverage information first.',
            },
        )
    if profile.verification_status in {'pending_review', 'approved'}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                'code': 'verification_not_submittable',
                'message': 'This verification request cannot be submitted in its current state.',
            },
        )
    profile.verification_status = 'pending_review'
    profile.verification_submitted_at = datetime.now(timezone.utc)  # noqa: UP017 - Python 3.10 support
    profile.verification_reviewed_at = None
    session.flush()
    return read_verification_status(session, user)


def _admin_technician_payload(session: Session, profile: TechnicianProfile) -> dict[str, object]:
    user = session.get(AppUser, profile.user_id)
    skills = read_technician_skills(session, user) if user else []
    coverage = read_technician_coverage(session, user) if user else []
    return {
        'user_id': profile.user_id,
        'email': user.email if user else None,
        'display_name': profile.display_name,
        'professional_description': profile.professional_description,
        'years_experience': profile.years_experience,
        'onboarding_status': profile.onboarding_status,
        'verification_status': profile.verification_status,
        'verification_submitted_at': profile.verification_submitted_at,
        'verification_reviewed_at': profile.verification_reviewed_at,
        'skills': skills,
        'coverage_areas': coverage,
        'created_at': profile.created_at,
        'updated_at': profile.updated_at,
    }


def list_admin_technicians(
    session: Session,
    *,
    verification_status: str | None = None,
) -> list[dict[str, object]]:
    statement = (
        select(TechnicianProfile)
        .join(UserRole, UserRole.user_id == TechnicianProfile.user_id)
        .where(UserRole.role_code == RoleCode.TECHNICIAN.value)
        .options(selectinload(TechnicianProfile.user))
        .order_by(TechnicianProfile.created_at, TechnicianProfile.user_id)
    )
    if verification_status:
        statement = statement.where(TechnicianProfile.verification_status == verification_status)
    profiles = session.scalars(statement).unique().all()
    return [_admin_technician_payload(session, profile) for profile in profiles]


def get_admin_technician(session: Session, technician_user_id: UUID) -> dict[str, object]:
    profile = session.scalar(
        select(TechnicianProfile)
        .join(UserRole, UserRole.user_id == TechnicianProfile.user_id)
        .where(
            TechnicianProfile.user_id == technician_user_id,
            UserRole.role_code == RoleCode.TECHNICIAN.value,
        )
        .options(selectinload(TechnicianProfile.user))
    )
    if profile is None:
        raise _not_found()
    payload = _admin_technician_payload(session, profile)
    reviews = session.scalars(
        select(TechnicianVerificationReview)
        .where(TechnicianVerificationReview.technician_user_id == technician_user_id)
        .order_by(TechnicianVerificationReview.created_at.desc())
    ).all()
    payload['reviews'] = [
        {
            'id': review.id,
            'technician_user_id': review.technician_user_id,
            'reviewer_user_id': review.reviewer_user_id,
            'decision': review.decision,
            'note': review.note,
            'created_at': review.created_at,
        }
        for review in reviews
    ]
    return payload


def review_technician_verification(
    session: Session,
    *,
    reviewer: AppUser,
    technician_user_id: UUID,
    request: AdminVerificationDecisionRequest,
) -> dict[str, object]:
    profile = session.scalar(
        select(TechnicianProfile)
        .join(UserRole, UserRole.user_id == TechnicianProfile.user_id)
        .where(
            TechnicianProfile.user_id == technician_user_id,
            UserRole.role_code == RoleCode.TECHNICIAN.value,
        )
        .with_for_update()
    )
    if profile is None:
        raise _not_found()
    if reviewer.id == technician_user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={'code': 'self_review_forbidden', 'message': 'Administrators cannot review their own technician profile.'},
        )
    if profile.verification_status != 'pending_review':
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={'code': 'verification_not_pending', 'message': 'Only pending verification requests can be reviewed.'},
        )

    profile.verification_status = request.decision
    profile.verification_reviewed_at = datetime.now(timezone.utc)  # noqa: UP017 - Python 3.10 support
    review = TechnicianVerificationReview(
        technician_user_id=technician_user_id,
        reviewer_user_id=reviewer.id,
        decision=request.decision,
        note=request.note.strip() or None,
    )
    session.add(review)
    session.flush()
    return {
        'id': review.id,
        'technician_user_id': review.technician_user_id,
        'reviewer_user_id': review.reviewer_user_id,
        'decision': review.decision,
        'note': review.note,
        'created_at': review.created_at,
    }
