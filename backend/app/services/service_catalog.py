"""Catalog queries and admin mutations for service categories and guides."""

import re
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models import AppUser, Service, ServiceCatalogAuditEvent, ServiceCategory
from app.schemas.service_catalog import (
    ServiceCategoryCreateRequest,
    ServiceCategoryUpdateRequest,
    ServiceCreateRequest,
    ServiceUpdateRequest,
)


def _not_found(entity: str = 'Service') -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={'code': 'not_found', 'message': f'{entity} not found.'},
    )


def _conflict() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={'code': 'catalog_conflict', 'message': 'A category or service with this slug already exists.'},
    )


def _normalize(value: str) -> str:
    return re.sub(r'\s+', ' ', value).strip().casefold()


def _catalog_action(changed_fields: list[str], was_active: bool, is_active: bool) -> str:
    if changed_fields == ['is_active'] and was_active != is_active:
        return 'activated' if is_active else 'deactivated'
    return 'updated'


def _audit_catalog_change(
    session: Session,
    *,
    actor: AppUser,
    entity_type: str,
    entity_id: UUID,
    action: str,
    changed_fields: list[str],
) -> None:
    session.add(
        ServiceCatalogAuditEvent(
            actor_user_id=actor.id,
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            changed_fields=sorted(set(changed_fields)),
        )
    )


def list_public_categories(session: Session) -> list[ServiceCategory]:
    return list(
        session.scalars(
            select(ServiceCategory)
            .where(ServiceCategory.is_active.is_(True))
            .order_by(ServiceCategory.display_order, ServiceCategory.title)
        ).all()
    )


def list_public_services(
    session: Session,
    *,
    category_slug: str | None = None,
    query: str | None = None,
) -> list[Service]:
    statement = (
        select(Service)
        .join(ServiceCategory)
        .where(Service.is_active.is_(True), ServiceCategory.is_active.is_(True))
        .options(selectinload(Service.category))
        .order_by(ServiceCategory.display_order, Service.display_order, Service.title)
    )
    if category_slug:
        statement = statement.where(ServiceCategory.slug == category_slug)

    services = list(session.scalars(statement).all())
    normalized_query = _normalize(query or '')
    if not normalized_query:
        return services

    terms = normalized_query.split(' ')
    return [
        service
        for service in services
        if all(
            term in _normalize(
                ' '.join(
                    [
                        service.title,
                        service.home_title,
                        service.home_description,
                        service.description,
                        service.listing_description,
                        service.category.title,
                        *service.keywords,
                        *service.inspection_scope,
                        *[
                            f"{problem.get('title', '')} {problem.get('description', '')}"
                            for problem in service.common_problems
                        ],
                        *[
                            f"{question.get('question', '')} {question.get('answer', '')}"
                            for question in service.questions
                        ],
                    ]
                )
            )
            for term in terms
        )
    ]


def get_public_service(session: Session, slug: str) -> Service:
    service = session.scalar(
        select(Service)
        .join(ServiceCategory)
        .where(
            Service.slug == slug,
            Service.is_active.is_(True),
            ServiceCategory.is_active.is_(True),
        )
        .options(selectinload(Service.category))
    )
    if service is None:
        raise _not_found()
    return service


def list_admin_categories(session: Session) -> list[ServiceCategory]:
    return list(
        session.scalars(
            select(ServiceCategory).order_by(ServiceCategory.display_order, ServiceCategory.title)
        ).all()
    )


def create_category(
    session: Session,
    request: ServiceCategoryCreateRequest,
    *,
    actor: AppUser,
) -> ServiceCategory:
    category = ServiceCategory(**request.model_dump())
    session.add(category)
    try:
        session.flush()
    except IntegrityError:
        session.rollback()
        raise _conflict() from None
    _audit_catalog_change(
        session,
        actor=actor,
        entity_type='category',
        entity_id=category.id,
        action='created',
        changed_fields=list(request.model_dump()),
    )
    return category


def get_category_for_admin(session: Session, category_id: UUID) -> ServiceCategory:
    category = session.get(ServiceCategory, category_id)
    if category is None:
        raise _not_found('Category')
    return category


def update_category(
    session: Session,
    category_id: UUID,
    request: ServiceCategoryUpdateRequest,
    *,
    actor: AppUser,
) -> ServiceCategory:
    category = get_category_for_admin(session, category_id)
    changes = request.model_dump(exclude_unset=True)
    was_active = category.is_active
    changed_fields = [
        field for field, value in changes.items() if getattr(category, field) != value
    ]
    for field in changed_fields:
        setattr(category, field, changes[field])
    try:
        session.flush()
    except IntegrityError:
        session.rollback()
        raise _conflict() from None
    if changed_fields:
        _audit_catalog_change(
            session,
            actor=actor,
            entity_type='category',
            entity_id=category.id,
            action=_catalog_action(changed_fields, was_active, category.is_active),
            changed_fields=changed_fields,
        )
    return category


def list_admin_services(session: Session) -> list[Service]:
    return list(
        session.scalars(
            select(Service)
            .options(selectinload(Service.category))
            .order_by(ServiceCategory.display_order, Service.display_order, Service.title)
            .join(ServiceCategory)
        ).all()
    )


def get_service_for_admin(session: Session, service_id: UUID) -> Service:
    service = session.scalar(
        select(Service)
        .where(Service.id == service_id)
        .options(selectinload(Service.category))
    )
    if service is None:
        raise _not_found()
    return service


def _resolve_category(session: Session, slug: str) -> ServiceCategory:
    category = session.scalar(select(ServiceCategory).where(ServiceCategory.slug == slug))
    if category is None:
        raise HTTPException(
            status_code=422,
            detail={'code': 'invalid_category', 'message': 'Select an existing service category.'},
        )
    return category


def _validate_related_slugs(
    session: Session,
    related_slugs: list[str],
    service_slug: str,
) -> None:
    if service_slug in related_slugs:
        raise HTTPException(
            status_code=422,
            detail={'code': 'invalid_related_service', 'message': 'A service cannot relate to itself.'},
        )
    if not related_slugs:
        return
    known_slugs = set(
        session.scalars(select(Service.slug).where(Service.slug.in_(related_slugs))).all()
    )
    unknown = set(related_slugs) - known_slugs
    if unknown:
        raise HTTPException(
            status_code=422,
            detail={'code': 'invalid_related_service', 'message': 'One or more related services do not exist.'},
        )


def create_service(
    session: Session,
    request: ServiceCreateRequest,
    *,
    actor: AppUser,
) -> Service:
    data = request.model_dump(exclude={'category_slug'})
    data['common_problems'] = [problem.model_dump() for problem in request.common_problems]
    data['questions'] = [question.model_dump() for question in request.questions]
    category = _resolve_category(session, request.category_slug)
    _validate_related_slugs(session, request.related_service_slugs, request.slug)
    if request.is_active and not category.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={'code': 'inactive_category', 'message': 'An active service requires an active category.'},
        )

    service = Service(**data, category=category)
    session.add(service)
    try:
        session.flush()
        service.category = category
        session.flush()
    except IntegrityError:
        session.rollback()
        raise _conflict() from None
    _audit_catalog_change(
        session,
        actor=actor,
        entity_type='service',
        entity_id=service.id,
        action='created',
        changed_fields=list(request.model_dump()),
    )
    return service


def update_service(
    session: Session,
    service_id: UUID,
    request: ServiceUpdateRequest,
    *,
    actor: AppUser,
) -> Service:
    service = get_service_for_admin(session, service_id)
    changes = request.model_dump(exclude_unset=True)
    category_slug = changes.pop('category_slug', None)
    old_slug = service.slug
    old_category_slug = service.category.slug
    was_active = service.is_active
    changed_fields: list[str] = []

    if category_slug is not None and category_slug != old_category_slug:
        service.category = _resolve_category(session, category_slug)
        changed_fields.append('category_slug')

    if 'common_problems' in changes and changes['common_problems'] is not None:
        changes['common_problems'] = [problem.model_dump() for problem in request.common_problems or []]
    if 'questions' in changes and changes['questions'] is not None:
        changes['questions'] = [question.model_dump() for question in request.questions or []]
    next_slug = changes.get('slug', service.slug)
    proposed_related_slugs = changes.get('related_service_slugs', service.related_service_slugs)
    if next_slug != old_slug and old_slug in proposed_related_slugs:
        raise HTTPException(
            status_code=422,
            detail={
                'code': 'invalid_related_service',
                'message': 'A service cannot relate to itself after a slug change.',
            },
        )
    if 'related_service_slugs' in changes and changes['related_service_slugs'] is not None:
        _validate_related_slugs(session, changes['related_service_slugs'], next_slug)
    elif next_slug != service.slug:
        _validate_related_slugs(session, service.related_service_slugs, next_slug)

    for field, value in changes.items():
        if value is not None and getattr(service, field) != value:
            setattr(service, field, value)
            changed_fields.append(field)
    if service.is_active and not service.category.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                'code': 'inactive_category',
                'message': 'An active service requires an active category.',
            },
        )
    try:
        session.flush()
    except IntegrityError:
        session.rollback()
        raise _conflict() from None

    if service.slug != old_slug:
        related_services = session.scalars(
            select(Service).where(Service.id != service.id)
        ).all()
        for related_service in related_services:
            related_slugs = related_service.related_service_slugs
            if old_slug not in related_slugs:
                continue
            rewritten_slugs: list[str] = []
            for related_slug in related_slugs:
                replacement = service.slug if related_slug == old_slug else related_slug
                if replacement not in rewritten_slugs:
                    rewritten_slugs.append(replacement)
            if rewritten_slugs != related_slugs:
                related_service.related_service_slugs = rewritten_slugs
                _audit_catalog_change(
                    session,
                    actor=actor,
                    entity_type='service',
                    entity_id=related_service.id,
                    action='updated',
                    changed_fields=['related_service_slugs'],
                )

    if changed_fields:
        _audit_catalog_change(
            session,
            actor=actor,
            entity_type='service',
            entity_id=service.id,
            action=_catalog_action(changed_fields, was_active, service.is_active),
            changed_fields=changed_fields,
        )
    session.flush()
    return service


def deactivate_service(
    session: Session,
    service_id: UUID,
    *,
    actor: AppUser,
) -> None:
    service = get_service_for_admin(session, service_id)
    if service.is_active:
        service.is_active = False
        _audit_catalog_change(
            session,
            actor=actor,
            entity_type='service',
            entity_id=service.id,
            action='deactivated',
            changed_fields=['is_active'],
        )
    session.flush()


def deactivate_category(
    session: Session,
    category_id: UUID,
    *,
    actor: AppUser,
) -> None:
    category = get_category_for_admin(session, category_id)
    if category.is_active:
        category.is_active = False
        _audit_catalog_change(
            session,
            actor=actor,
            entity_type='category',
            entity_id=category.id,
            action='deactivated',
            changed_fields=['is_active'],
        )
    session.flush()
