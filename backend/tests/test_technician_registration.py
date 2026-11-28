"""Verified technician application is atomic, fixed-role and review-gated."""

from sqlalchemy import select

from app.models import AppUser, Service, ServiceCategory, TechnicianProfile, UserRole

URL = '/api/v1/auth/provision/technician-application'
PAYLOAD = {
    'display_name': 'Example Technician',
    'phone_e164': '+919876543210',
    'professional_description': 'Experienced technician with years of repair service.',
    'years_experience': 5,
    'service_slugs': ['ac-repair'],
    'area_name': 'Example locality',
    'city': 'Pune',
    'state': 'Maharashtra',
    'postal_code': '411001',
}


def seed_catalog(session):
    category = ServiceCategory(slug='appliances', title='Appliances', is_active=True)
    session.add(category)
    session.flush()
    session.add(Service(category=category, slug='ac-repair', title='AC Repair', home_title='AC',
                        home_description='Air conditioning', description='Repair guide',
                        listing_description='Repair', is_active=True))
    session.commit()


def test_complete_registration_pending_idempotent_and_blocked(authenticated_client):
    client, identity_holder, session = authenticated_client
    seed_catalog(session)
    first = client.post(URL, json=PAYLOAD)
    assert first.status_code == 200, first.text
    assert first.json() == {'status': 'pending_review'}
    user = session.scalar(select(AppUser).where(AppUser.auth_subject == identity_holder['value'].subject))
    profile = session.get(TechnicianProfile, user.id)
    assert profile.phone_e164 == '+919876543210'
    assert profile.verification_status == 'pending_review'
    assert profile.onboarding_status == 'complete'
    assert session.get(UserRole, (user.id, 'technician')) is not None
    assert session.get(UserRole, (user.id, 'admin')) is None
    assert client.get('/api/v1/technician/bookings').status_code == 403
    assert client.post(URL, json=PAYLOAD).json() == {'status': 'pending_review'}
    profile.verification_status = 'approved'
    session.commit()
    assert client.post(URL, json=PAYLOAD).status_code == 409
    assert profile.verification_status == 'approved'


def test_invalid_details_and_escalation_rejected(authenticated_client):
    client, identity_holder, session = authenticated_client
    seed_catalog(session)
    for payload in ({**PAYLOAD, 'postal_code': 'bad'}, {**PAYLOAD, 'phone_e164': '123'},
                    {**PAYLOAD, 'service_slugs': []}, {**PAYLOAD, 'role': 'admin'},
                    {**PAYLOAD, 'years_experience': -1}):
        assert client.post(URL, json=payload).status_code == 422
    result = client.post(URL, json={**PAYLOAD, 'service_slugs': ['not-in-catalog']})
    assert result.status_code == 422
    user = session.scalar(select(AppUser).where(
        AppUser.auth_subject == identity_holder['value'].subject
    ))
    assert user is None
