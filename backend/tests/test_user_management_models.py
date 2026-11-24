"""Model constraints and role/profile relationships on local SQLite."""

from uuid import uuid4

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models import AppUser, CustomerProfile, Role, TechnicianProfile, UserRole


def make_user(subject=None) -> AppUser:
    return AppUser(
        auth_issuer='https://supabase.invalid/auth/v1',
        auth_subject=subject or uuid4(),
        status='active',
    )


def test_user_can_have_customer_and_technician_roles_and_profiles() -> None:
    engine = create_engine('sqlite:///:memory:')
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        session.add_all(
            [
                Role(code='customer', description='Customer'),
                Role(code='technician', description='Technician'),
                Role(code='admin', description='Admin'),
            ]
        )
        user = make_user()
        user.roles.extend(
            [UserRole(role_code='customer'), UserRole(role_code='technician')]
        )
        user.customer_profile = CustomerProfile(display_name='Example Customer')
        user.technician_profile = TechnicianProfile(
            display_name='Example Technician',
            professional_description='Sample profile only.',
        )
        session.add(user)
        session.commit()

        loaded = session.scalar(select(AppUser).where(AppUser.id == user.id))
        assert loaded is not None
        assert {assignment.role_code for assignment in loaded.roles} == {
            'customer',
            'technician',
        }
        assert loaded.customer_profile is not None
        assert loaded.technician_profile is not None
    engine.dispose()


def test_auth_identity_mapping_is_unique() -> None:
    engine = create_engine('sqlite:///:memory:')
    Base.metadata.create_all(engine)
    subject = uuid4()

    with Session(engine) as session:
        session.add_all([make_user(subject), make_user(subject)])
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()
    engine.dispose()
