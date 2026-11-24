"""Service catalog visibility, administration, filtering, and validation tests."""

from collections import Counter
from collections.abc import Iterator
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select, text
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
    ServiceCatalogAuditEvent,
    ServiceCategory,
    UserRole,
)

ISSUER = 'https://supabase.invalid/auth/v1'


@pytest.fixture
def catalog_api() -> Iterator[tuple[TestClient, dict[str, VerifiedIdentity], Session]]:
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


def _create_user(session: Session, role_code: str) -> AppUser:
    user = AppUser(auth_issuer=ISSUER, auth_subject=uuid4(), status='active')
    session.add(user)
    session.flush()
    session.add(UserRole(user_id=user.id, role_code=role_code, granted_by=user.id))
    session.commit()
    return user


def _seed_catalog(session: Session) -> tuple[ServiceCategory, ServiceCategory, Service, Service, Service]:
    appliance_category = ServiceCategory(
        slug='appliance-repair',
        title='Appliance repair',
        description='Appliance guides.',
        display_order=0,
        is_active=True,
    )
    systems_category = ServiceCategory(
        slug='home-systems',
        title='Home systems',
        description='Electrical and plumbing guides.',
        display_order=1,
        is_active=True,
    )
    hidden_category = ServiceCategory(
        slug='hidden-category', title='Hidden category', is_active=False, display_order=2
    )
    session.add_all([appliance_category, systems_category, hidden_category])
    session.flush()
    cooling = Service(
        category=appliance_category,
        slug='ac-repair',
        title='AC Repair',
        home_title='AC repair',
        home_description='Cooling and airflow',
        description='Guide for common AC repair concerns.',
        listing_description='Cooling, airflow, drainage and operating issues.',
        keywords=['air conditioner', 'cooling'],
        common_problems=[{'title': 'Not cooling', 'description': 'Room stays warm.'}],
        inspection_scope=['Discuss symptoms and model.'],
        questions=[{'question': 'What details help?', 'answer': 'Share symptoms.'}],
        related_service_slugs=['plumbing'],
        display_order=0,
        is_active=True,
    )
    plumbing = Service(
        category=systems_category,
        slug='plumbing',
        title='Plumbing Services',
        home_title='Plumbing',
        home_description='Pipes and leaks',
        description='Guide for common plumbing concerns.',
        listing_description='Leaks, taps, drains and water flow.',
        keywords=['leak', 'drain'],
        common_problems=[{'title': 'Tap is leaking', 'description': 'Water drips from a tap.'}],
        inspection_scope=['Inspect visible connections.'],
        questions=[],
        related_service_slugs=['ac-repair'],
        display_order=0,
        is_active=True,
    )
    inactive_service = Service(
        category=appliance_category,
        slug='inactive-service',
        title='Inactive service',
        home_title='Inactive',
        home_description='Not public',
        description='Inactive service fixture.',
        listing_description='This service is disabled.',
        is_active=False,
    )
    hidden_category_service = Service(
        category=hidden_category,
        slug='hidden-category-service',
        title='Hidden category service',
        home_title='Hidden',
        home_description='Not public',
        description='Hidden category fixture.',
        listing_description='This category is disabled.',
        is_active=True,
    )
    session.add_all([cooling, plumbing, inactive_service, hidden_category_service])
    session.commit()
    return appliance_category, systems_category, cooling, plumbing, inactive_service


def test_public_catalog_exposes_only_active_services_and_supports_search_and_categories(
    catalog_api,
) -> None:
    client, _identity_holder, session = catalog_api
    _seed_catalog(session)

    categories = client.get('/api/v1/services/categories')
    services = client.get('/api/v1/services')
    symptom_search = client.get('/api/v1/services', params={'q': 'tap leaking'})
    inspection_search = client.get('/api/v1/services', params={'q': 'discuss model'})
    category_filter = client.get('/api/v1/services', params={'category': 'appliance-repair'})
    hidden_detail = client.get('/api/v1/services/inactive-service')
    hidden_category_detail = client.get('/api/v1/services/hidden-category-service')

    assert categories.status_code == 200
    assert [category['slug'] for category in categories.json()] == [
        'appliance-repair',
        'home-systems',
    ]
    assert services.status_code == 200
    assert [service['slug'] for service in services.json()] == ['ac-repair', 'plumbing']
    assert symptom_search.status_code == 200
    assert [service['slug'] for service in symptom_search.json()] == ['plumbing']
    assert [service['slug'] for service in inspection_search.json()] == ['ac-repair']
    assert category_filter.status_code == 200
    assert [service['slug'] for service in category_filter.json()] == ['ac-repair']
    assert hidden_detail.status_code == 404
    assert hidden_category_detail.status_code == 404
    public_body = services.text.lower()
    assert 'technician' not in public_body
    assert 'availability' not in public_body
    assert 'price' not in public_body


def test_admin_can_create_edit_and_soft_deactivate_categories_and_services(catalog_api) -> None:
    client, identity_holder, session = catalog_api
    appliance, systems, _cooling, _plumbing, _inactive = _seed_catalog(session)
    admin = _create_user(session, 'admin')
    identity_holder['value'] = _identity(admin.auth_subject)

    created_category = client.post(
        '/api/v1/admin/service-catalog/categories',
        json={
            'slug': 'water-purifier',
            'title': 'Water purifier',
            'description': 'Water purifier service guides.',
            'display_order': 3,
        },
    )
    assert created_category.status_code == 201
    category_id = created_category.json()['id']

    category_update = client.patch(
        f'/api/v1/admin/service-catalog/categories/{category_id}',
        json={'title': 'Water treatment', 'display_order': 2},
    )
    assert category_update.status_code == 200
    assert category_update.json()['title'] == 'Water treatment'

    created_service = client.post(
        '/api/v1/admin/service-catalog/services',
        json={
            'category_slug': 'water-purifier',
            'slug': 'purifier-guide',
            'title': 'Water Purifier Guide',
            'home_title': 'Water purifier',
            'home_description': 'Filtration system guide',
            'description': 'A clear guide to common water purifier symptoms.',
            'listing_description': 'Flow, filter and leak concerns for water purifiers.',
            'keywords': ['purifier', 'water flow'],
            'common_problems': [
                {'title': 'Low water flow', 'description': 'Water flows more slowly than usual.'}
            ],
            'inspection_scope': ['Discuss the model and maintenance history.'],
            'questions': [],
            'related_service_slugs': ['plumbing'],
            'display_order': 1,
        },
    )
    assert created_service.status_code == 201
    service = created_service.json()
    service_id = service['id']
    assert service['category']['slug'] == 'water-purifier'
    assert service['common_problems'][0]['title'] == 'Low water flow'
    assert service['inspection_scope'] == ['Discuss the model and maintenance history.']

    edited = client.patch(
        f'/api/v1/admin/service-catalog/services/{service_id}',
        json={'title': 'Purifier Service Guide', 'display_order': 0},
    )
    assert edited.status_code == 200
    assert edited.json()['title'] == 'Purifier Service Guide'

    cooling_id = client.get('/api/v1/services/ac-repair').json()['id']
    related_update = client.patch(
        f'/api/v1/admin/service-catalog/services/{cooling_id}',
        json={'related_service_slugs': ['purifier-guide', 'plumbing']},
    )
    assert related_update.status_code == 200
    renamed = client.patch(
        f'/api/v1/admin/service-catalog/services/{service_id}',
        json={'slug': 'water-purifier-guide'},
    )
    assert renamed.status_code == 200
    assert renamed.json()['slug'] == 'water-purifier-guide'
    assert client.get('/api/v1/services/purifier-guide').status_code == 404
    assert client.get('/api/v1/services/water-purifier-guide').status_code == 200
    assert client.get('/api/v1/services/ac-repair').json()['related_service_slugs'] == [
        'water-purifier-guide',
        'plumbing',
    ]

    hidden = client.delete(
        f'/api/v1/admin/service-catalog/services/{service_id}'
    )
    assert hidden.status_code == 204
    assert client.get('/api/v1/services/water-purifier-guide').status_code == 404
    restored_service = client.patch(
        f'/api/v1/admin/service-catalog/services/{service_id}',
        json={'is_active': True},
    )
    assert restored_service.status_code == 200
    assert restored_service.json()['is_active'] is True
    assert client.get('/api/v1/services/water-purifier-guide').status_code == 200
    assert client.delete(
        f'/api/v1/admin/service-catalog/services/{service_id}'
    ).status_code == 204
    admin_list = client.get('/api/v1/admin/service-catalog/services')
    assert admin_list.status_code == 200
    assert next(row for row in admin_list.json() if row['id'] == service_id)['is_active'] is False

    category_deactivation = client.delete(
        f'/api/v1/admin/service-catalog/categories/{systems.id}'
    )
    assert category_deactivation.status_code == 204
    assert [service['slug'] for service in client.get('/api/v1/services').json()] == ['ac-repair']
    assert client.get('/api/v1/services/categories').json()[0]['slug'] == 'appliance-repair'
    restored_category = client.patch(
        f'/api/v1/admin/service-catalog/categories/{systems.id}',
        json={'is_active': True},
    )
    assert restored_category.status_code == 200
    assert restored_category.json()['is_active'] is True
    assert client.get('/api/v1/services/plumbing').status_code == 200
    assert appliance.slug == 'appliance-repair'

    service_events = session.scalars(
        select(ServiceCatalogAuditEvent).where(
            ServiceCatalogAuditEvent.entity_type == 'service',
            ServiceCatalogAuditEvent.entity_id == UUID(service_id),
        )
    ).all()
    assert Counter(event.action for event in service_events) == Counter(
        {'created': 1, 'updated': 2, 'activated': 1, 'deactivated': 2}
    )
    assert all(event.actor_user_id == admin.id for event in service_events)
    assert any('slug' in event.changed_fields for event in service_events)

    category_events = session.scalars(
        select(ServiceCatalogAuditEvent).where(
            ServiceCatalogAuditEvent.entity_type == 'category',
            ServiceCatalogAuditEvent.entity_id == UUID(category_id),
        )
    ).all()
    assert Counter(event.action for event in category_events) == Counter(
        {'created': 1, 'updated': 1}
    )
    systems_events = session.scalars(
        select(ServiceCatalogAuditEvent).where(
            ServiceCatalogAuditEvent.entity_type == 'category',
            ServiceCatalogAuditEvent.entity_id == systems.id,
        )
    ).all()
    assert Counter(event.action for event in systems_events) == Counter(
        {'deactivated': 1, 'activated': 1}
    )
    assert all(event.actor_user_id == admin.id for event in systems_events)


def test_catalog_management_is_admin_only_and_rejects_invalid_or_privileged_fields(
    catalog_api,
) -> None:
    client, identity_holder, session = catalog_api
    _seed_catalog(session)
    customer = _create_user(session, 'customer')
    identity_holder['value'] = _identity(customer.auth_subject)

    assert client.get('/api/v1/admin/service-catalog/services').status_code == 403
    assert client.post(
        '/api/v1/admin/service-catalog/categories',
        json={'slug': 'forbidden', 'title': 'Forbidden'},
    ).status_code == 403

    admin = _create_user(session, 'admin')
    identity_holder['value'] = _identity(admin.auth_subject)
    base_payload = {
        'category_slug': 'appliance-repair',
        'slug': 'new-service',
        'title': 'New Service',
        'home_title': 'New service',
        'description': 'A clear guide description that is long enough.',
        'listing_description': 'A short description for the service listing.',
    }
    unknown_category = client.post(
        '/api/v1/admin/service-catalog/services',
        json={**base_payload, 'category_slug': 'missing'},
    )
    attempt_to_assign_roles = client.post(
        '/api/v1/admin/service-catalog/services',
        json={**base_payload, 'role': 'admin', 'verification_status': 'approved'},
    )
    assert unknown_category.status_code == 422
    assert attempt_to_assign_roles.status_code == 422

    assert client.post('/api/v1/admin/service-catalog/services', json=base_payload).status_code == 201
    duplicate_slug = client.post('/api/v1/admin/service-catalog/services', json=base_payload)
    assert duplicate_slug.status_code == 409
    invalid_slug = client.post(
        '/api/v1/admin/service-catalog/services',
        json={**base_payload, 'slug': 'Not A Valid Slug'},
    )
    assert invalid_slug.status_code == 422

    category = client.get('/api/v1/admin/service-catalog/categories').json()[0]
    empty_patch = client.patch(
        f"/api/v1/admin/service-catalog/categories/{category['id']}", json={}
    )
    null_patch = client.patch(
        f"/api/v1/admin/service-catalog/categories/{category['id']}",
        json={'title': None},
    )
    assert empty_patch.status_code == 422
    assert null_patch.status_code == 422


def test_catalog_mutation_and_audit_event_roll_back_together_on_audit_failure(
    catalog_api,
) -> None:
    client, identity_holder, session = catalog_api
    admin = _create_user(session, 'admin')
    identity_holder['value'] = _identity(admin.auth_subject)
    session.execute(
        text(
            """
            CREATE TRIGGER reject_catalog_audit
            BEFORE INSERT ON service_catalog_audit_events
            WHEN NEW.action = 'created'
            BEGIN
                SELECT RAISE(ABORT, 'synthetic catalog audit insert failure');
            END;
            """
        )
    )
    session.commit()

    response = client.post(
        '/api/v1/admin/service-catalog/categories',
        json={
            'slug': 'audit-failure-category',
            'title': 'Audit failure category',
        },
    )

    assert response.status_code == 500
    assert session.scalar(
        select(ServiceCategory).where(ServiceCategory.slug == 'audit-failure-category')
    ) is None
    assert session.scalars(select(ServiceCatalogAuditEvent)).all() == []
