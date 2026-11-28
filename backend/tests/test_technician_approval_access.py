"""Operational technician APIs require a current, database-owned approval."""

import pytest

from app.models import TechnicianProfile
from tests.test_account_authorization import create_user, identity_for


@pytest.mark.parametrize('state', ['not_submitted', 'pending_review', 'rejected'])
def test_unapproved_technician_can_onboard_but_cannot_operate(authenticated_client, state):
    client, identity_holder, session = authenticated_client
    user = create_user(session, role_codes=('technician',), technician_name='Applicant')
    profile = session.get(TechnicianProfile, user.id)
    profile.verification_status = state
    session.commit()
    identity_holder['value'] = identity_for(user.auth_subject)

    assert client.get('/api/v1/technician/profile').status_code == 200
    assert client.get('/api/v1/technician/verification').status_code == 200
    assert client.get('/api/v1/technician/bookings').status_code == 403
    assert client.get('/api/v1/technician/reviews/summary').status_code == 403


def test_approved_access_is_revoked_immediately(authenticated_client):
    client, identity_holder, session = authenticated_client
    user = create_user(session, role_codes=('technician',), technician_name='Applicant')
    profile = session.get(TechnicianProfile, user.id)
    profile.verification_status = 'approved'
    session.commit()
    identity_holder['value'] = identity_for(user.auth_subject)

    assert client.get('/api/v1/technician/bookings').status_code == 200
    assert client.get('/api/v1/technician/reviews/summary').status_code == 200
    profile.verification_status = 'rejected'
    session.commit()
    assert client.get('/api/v1/technician/bookings').status_code == 403
    assert client.get('/api/v1/technician/reviews/summary').status_code == 403
    assert client.get('/api/v1/technician/profile').status_code == 200
