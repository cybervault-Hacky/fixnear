"""Technician ownership, private preferences, onboarding, and verification controls."""

from collections.abc import Iterator
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.auth.dependencies import get_current_identity
from app.auth.tokens import VerifiedIdentity
from app.db.base import Base
from app.db.session import get_db_session
from app.main import app
from app.models import (
    AppUser,
    Role,
    Service,
    ServiceCategory,
    TechnicianAvailabilityPreference,
    TechnicianCoverageArea,
    TechnicianProfile,
    TechnicianSkill,
    TechnicianVerificationReview,
    UserRole,
)

ISSUER = 'https://supabase.invalid/auth/v1'


@pytest.fixture
def technician_api() -> Iterator[tuple[TestClient, dict[str, VerifiedIdentity], Session]]:
    engine = create_engine(
        'sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool
    )

    @event.listens_for(engine, 'connect')
    def enable_foreign_keys(connection, _record) -> None:
        connection.execute('PRAGMA foreign_keys=ON')

    Base.metadata.create_all(engine)
    session = Session(engine, autoflush=False, expire_on_commit=False)
    session.add_all(
        [
            Role(code='customer', description='Customer access'),
            Role(code='technician', description='Technician access'),
            Role(code='admin', description='Administrative access'),
        ]
    )
    session.commit()
    identity_holder = {'value': _identity(uuid4())}

    def override_identity() -> VerifiedIdentity:
        return identity_holder['value']

    def override_session() -> Iterator[Session]:
        try:
            yield session
        except Exception:
            session.rollback()
            raise

    app.dependency_overrides[get_current_identity] = override_identity
    app.dependency_overrides[get_db_session] = override_session
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            yield client, identity_holder, session
    finally:
        app.dependency_overrides.clear()
        session.close()
        engine.dispose()


def _identity(subject: UUID) -> VerifiedIdentity:
    return VerifiedIdentity(
        subject=subject,
        issuer=ISSUER,
        issued_at=2_000_000_000,
        expires_at=2_000_000_300,
    )


def _create_user(
    session: Session,
    role_codes: tuple[str, ...],
    *,
    display_name: str = 'Sample Technician',
    email: str = 'sample@example.test',
) -> AppUser:
    user = AppUser(
        auth_issuer=ISSUER,
        auth_subject=uuid4(),
        email=email,
        status='active',
    )
    session.add(user)
    session.flush()
    for role_code in role_codes:
        session.add(UserRole(user_id=user.id, role_code=role_code, granted_by=user.id))
    if 'technician' in role_codes:
        session.add(TechnicianProfile(user_id=user.id, display_name=display_name))
    session.commit()
    return user


def _seed_services(session: Session) -> tuple[Service, Service]:
    category = ServiceCategory(
        slug='appliance-repair', title='Appliance repair', is_active=True, display_order=0
    )
    inactive_category = ServiceCategory(
        slug='inactive-category', title='Inactive', is_active=False, display_order=1
    )
    session.add_all([category, inactive_category])
    session.flush()
    active = Service(
        category=category,
        slug='ac-repair',
        title='AC Repair',
        home_title='AC repair',
        home_description='Cooling and airflow',
        description='AC guide content.',
        listing_description='Cooling and airflow problems.',
        is_active=True,
    )
    inactive = Service(
        category=category,
        slug='inactive-service',
        title='Inactive service',
        home_title='Inactive',
        home_description='Inactive service',
        description='Disabled service content.',
        listing_description='Disabled service.',
        is_active=False,
    )
    hidden_category_service = Service(
        category=inactive_category,
        slug='hidden-category-service',
        title='Hidden category service',
        home_title='Hidden category',
        home_description='Not publicly listed',
        description='Active service under an inactive category.',
        listing_description='Hidden by its inactive category.',
        is_active=True,
    )
    session.add_all([active, inactive, hidden_category_service])
    session.commit()
    return active, inactive


def _complete_technician_profile(client: TestClient) -> None:
    profile = client.patch(
        '/api/v1/technician/profile',
        json={
            'display_name': 'Alex Example',
            'professional_description': (
                'Self-reported professional description for an offline test profile.'
            ),
            'years_experience': 5,
        },
    )
    assert profile.status_code == 200
    skills = client.put(
        '/api/v1/technician/services',
        json={'skills': [{'service_slug': 'ac-repair', 'years_experience': 4}]},
    )
    assert skills.status_code == 200
    coverage = client.put(
        '/api/v1/technician/coverage',
        json={
            'areas': [
                {
                    'area_name': 'Example locality',
                    'city': 'Pune',
                    'state': 'Maharashtra',
                    'postal_code': '411001',
                }
            ]
        },
    )
    assert coverage.status_code == 200


def test_technician_profile_is_owner_scoped_and_customers_cannot_read_it(technician_api) -> None:
    client, identity_holder, session = technician_api
    owner = _create_user(session, ('technician',), display_name='Owner Profile')
    other = _create_user(session, ('technician',), display_name='Private Other Profile')
    identity_holder['value'] = _identity(owner.auth_subject)

    own_profile = client.get('/api/v1/technician/profile')
    attempted_query_override = client.get(
        '/api/v1/technician/profile', params={'user_id': str(other.id)}
    )
    attempted_body_override = client.patch(
        '/api/v1/technician/profile',
        json={'display_name': 'Intruder', 'user_id': str(other.id)},
    )
    attempted_verification_change = client.patch(
        '/api/v1/technician/profile',
        json={'verification_status': 'approved'},
    )

    assert own_profile.status_code == 200
    assert own_profile.json()['user_id'] == str(owner.id)
    assert attempted_query_override.status_code == 200
    assert attempted_query_override.json()['user_id'] == str(owner.id)
    assert 'Private Other Profile' not in attempted_query_override.text
    assert attempted_body_override.status_code == 422
    assert attempted_verification_change.status_code == 422
    assert session.get(TechnicianProfile, other.id).display_name == 'Private Other Profile'

    customer = _create_user(session, ('customer',), email='customer@example.test')
    identity_holder['value'] = _identity(customer.auth_subject)
    assert client.get('/api/v1/technician/profile').status_code == 403
    assert client.get('/api/v1/technician/services').status_code == 403
    assert client.get('/api/v1/technician/coverage').status_code == 403
    assert client.get('/api/v1/admin/technicians').status_code == 403


def test_technician_skills_and_coverage_are_validated_and_owner_scoped(technician_api) -> None:
    client, identity_holder, session = technician_api
    active_service, inactive_service = _seed_services(session)
    owner = _create_user(session, ('technician',), display_name='Owner')
    other = _create_user(session, ('technician',), display_name='Other')
    identity_holder['value'] = _identity(owner.auth_subject)

    hidden_category_service = session.scalar(
        select(Service).where(Service.slug == 'hidden-category-service')
    )
    assert hidden_category_service is not None
    session.add(
        TechnicianSkill(
            technician_user_id=owner.id,
            service_id=hidden_category_service.id,
            years_experience=2,
        )
    )
    session.commit()
    assert 'skills' in client.get('/api/v1/technician/onboarding').json()['missing_requirements']
    private_skills = client.get('/api/v1/technician/services')
    assert private_skills.status_code == 200
    assert private_skills.json()['skills'][0]['is_active'] is False

    hidden_category_skill = client.put(
        '/api/v1/technician/services',
        json={'skills': [{'service_slug': hidden_category_service.slug}]},
    )
    assert hidden_category_skill.status_code == 422

    saved_skills = client.put(
        '/api/v1/technician/services',
        json={'skills': [{'service_slug': 'ac-repair', 'years_experience': 3}]},
    )
    assert saved_skills.status_code == 200
    assert saved_skills.json()['skills'][0]['service_id'] == str(active_service.id)
    assert client.get('/api/v1/technician/services').json() == saved_skills.json()
    assert session.scalar(
        select(TechnicianSkill).where(TechnicianSkill.technician_user_id == other.id)
    ) is None

    inactive_skill = client.put(
        '/api/v1/technician/services',
        json={'skills': [{'service_slug': inactive_service.slug}]},
    )
    duplicate_skill = client.put(
        '/api/v1/technician/services',
        json={
            'skills': [
                {'service_slug': 'ac-repair'},
                {'service_slug': 'ac-repair', 'years_experience': 2},
            ]
        },
    )
    assert inactive_skill.status_code == 422
    assert duplicate_skill.status_code == 422

    coverage = client.put(
        '/api/v1/technician/coverage',
        json={
            'areas': [
                {
                    'area_name': 'Kothrud',
                    'city': 'Pune',
                    'state': 'Maharashtra',
                    'postal_code': '411038',
                },
                {
                    'area_name': 'Kothrud',
                    'city': 'Pune',
                    'state': 'Maharashtra',
                    'postal_code': '411038',
                },
            ]
        },
    )
    assert coverage.status_code == 422

    saved_coverage = client.put(
        '/api/v1/technician/coverage',
        json={
            'areas': [
                {
                    'area_name': 'Kothrud',
                    'city': 'Pune',
                    'state': 'Maharashtra',
                    'postal_code': '411038',
                }
            ]
        },
    )
    assert saved_coverage.status_code == 200
    assert saved_coverage.json()['areas'][0]['area_name'] == 'Kothrud'
    assert session.scalar(
        select(TechnicianCoverageArea).where(
            TechnicianCoverageArea.technician_user_id == other.id
        )
    ) is None

    forbidden_owner_id = client.put(
        '/api/v1/technician/coverage',
        json={
            'technician_user_id': str(other.id),
            'areas': [],
        },
    )
    assert forbidden_owner_id.status_code == 422


def test_availability_is_a_private_preference_and_not_public_service_availability(technician_api) -> None:
    client, identity_holder, session = technician_api
    active_service, _inactive_service = _seed_services(session)
    technician = _create_user(session, ('technician',))
    identity_holder['value'] = _identity(technician.auth_subject)

    default = client.get('/api/v1/technician/availability')
    assert default.status_code == 200
    assert default.json()['timezone_name'] == 'Asia/Kolkata'
    assert default.json()['weekly_schedule']['monday']['available'] is False

    schedule = {
        day: {'available': False, 'start': None, 'end': None}
        for day in ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')
    }
    schedule['monday'] = {'available': True, 'start': '09:00', 'end': '17:00'}
    saved = client.put(
        '/api/v1/technician/availability',
        json={'timezone_name': 'Asia/Kolkata', 'weekly_schedule': schedule},
    )
    assert saved.status_code == 200
    assert saved.json()['weekly_schedule']['monday']['available'] is True
    assert saved.json()['weekly_schedule']['monday']['start'].startswith('09:00')
    assert session.scalar(
        select(TechnicianAvailabilityPreference).where(
            TechnicianAvailabilityPreference.technician_user_id == technician.id
        )
    ) is not None

    public_catalog = client.get('/api/v1/services').text
    assert active_service.slug in public_catalog
    assert 'weekly_schedule' not in public_catalog
    assert 'monday' not in public_catalog
    assert client.put(
        '/api/v1/technician/availability',
        json={
            'timezone_name': 'Not/A_Timezone',
            'weekly_schedule': schedule,
        },
    ).status_code == 422


def test_only_admins_can_approve_or_reject_a_pending_technician(technician_api) -> None:
    client, identity_holder, session = technician_api
    _seed_services(session)
    technician = _create_user(session, ('technician',), display_name='Pending Technician')
    identity_holder['value'] = _identity(technician.auth_subject)

    initially_incomplete = client.get('/api/v1/technician/onboarding')
    cannot_submit = client.post('/api/v1/technician/verification/submit', json={})
    assert initially_incomplete.status_code == 200
    assert initially_incomplete.json()['onboarding_status'] == 'incomplete'
    assert initially_incomplete.json()['verification_status'] == 'not_submitted'
    assert 'professional_description' in initially_incomplete.json()['missing_requirements']
    assert cannot_submit.status_code == 409

    _complete_technician_profile(client)
    complete = client.get('/api/v1/technician/onboarding')
    submitted = client.post('/api/v1/technician/verification/submit', json={})
    assert complete.json()['onboarding_status'] == 'complete'
    assert complete.json()['missing_requirements'] == []
    assert submitted.status_code == 200
    assert submitted.json()['verification_status'] == 'pending_review'
    assert submitted.json()['verification_submitted_at'] is not None
    assert client.post('/api/v1/technician/verification/submit', json={}).status_code == 409

    customer = _create_user(session, ('customer',), email='review-customer@example.test')
    identity_holder['value'] = _identity(customer.auth_subject)
    assert client.get('/api/v1/admin/technicians').status_code == 403
    assert client.patch(
        f'/api/v1/admin/technicians/{technician.id}/verification',
        json={'decision': 'approved'},
    ).status_code == 403

    admin = _create_user(session, ('admin',), email='review-admin@example.test')
    identity_holder['value'] = _identity(admin.auth_subject)
    queue = client.get(
        '/api/v1/admin/technicians', params={'verification_status': 'pending_review'}
    )
    assert queue.status_code == 200
    assert [entry['user_id'] for entry in queue.json()] == [str(technician.id)]
    assert queue.json()[0]['email'] == 'sample@example.test'

    missing_rejection_note = client.patch(
        f'/api/v1/admin/technicians/{technician.id}/verification',
        json={'decision': 'rejected'},
    )
    assert missing_rejection_note.status_code == 422
    approved = client.patch(
        f'/api/v1/admin/technicians/{technician.id}/verification',
        json={'decision': 'approved', 'note': 'Manual review completed.'},
    )
    assert approved.status_code == 200
    assert approved.json()['decision'] == 'approved'
    assert client.patch(
        f'/api/v1/admin/technicians/{technician.id}/verification',
        json={'decision': 'rejected', 'note': 'Duplicate review.'},
    ).status_code == 409
    assert session.get(TechnicianProfile, technician.id).verification_status == 'approved'
    review_history = session.scalars(
        select(TechnicianVerificationReview).where(
            TechnicianVerificationReview.technician_user_id == technician.id
        )
    ).all()
    assert len(review_history) == 1
    assert review_history[0].reviewer_user_id == admin.id

    identity_holder['value'] = _identity(technician.auth_subject)
    profile_edit = client.patch(
        '/api/v1/technician/profile',
        json={'professional_description': 'Updated self-reported information after review.'},
    )
    assert profile_edit.status_code == 200
    assert profile_edit.json()['verification_status'] == 'not_submitted'

    _complete_technician_profile(client)
    assert client.post('/api/v1/technician/verification/submit', json={}).status_code == 200
    identity_holder['value'] = _identity(admin.auth_subject)
    rejected = client.patch(
        f'/api/v1/admin/technicians/{technician.id}/verification',
        json={'decision': 'rejected', 'note': 'Please clarify the self-reported experience.'},
    )
    assert rejected.status_code == 200
    assert rejected.json()['decision'] == 'rejected'
    assert session.get(TechnicianProfile, technician.id).verification_status == 'rejected'
    history = session.scalars(
        select(TechnicianVerificationReview)
        .where(TechnicianVerificationReview.technician_user_id == technician.id)
        .order_by(TechnicianVerificationReview.created_at)
    ).all()
    assert [review.decision for review in history] == ['approved', 'rejected']


def test_admin_cannot_review_own_technician_profile(technician_api) -> None:
    client, identity_holder, session = technician_api
    _seed_services(session)
    admin_technician = _create_user(session, ('technician', 'admin'))
    identity_holder['value'] = _identity(admin_technician.auth_subject)
    _complete_technician_profile(client)
    assert client.post('/api/v1/technician/verification/submit', json={}).status_code == 200

    response = client.patch(
        f'/api/v1/admin/technicians/{admin_technician.id}/verification',
        json={'decision': 'approved'},
    )
    assert response.status_code == 403
    assert session.get(TechnicianProfile, admin_technician.id).verification_status == 'pending_review'
