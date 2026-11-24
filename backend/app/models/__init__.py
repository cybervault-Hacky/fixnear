"""Application database models."""

from app.models.booking_management import (
    Booking,
    BookingAttachment,
    BookingEvent,
    BookingLocationAccessEvent,
    BookingQuote,
    BookingQuoteLineItem,
    BookingVisit,
    CustomerAddress,
    MutationIdempotency,
)
from app.models.service_catalog import (
    Service,
    ServiceCatalogAuditEvent,
    ServiceCategory,
)
from app.models.technician_management import (
    TechnicianAvailabilityPreference,
    TechnicianCoverageArea,
    TechnicianSkill,
    TechnicianVerificationReview,
)
from app.models.user_management import (
    AppUser,
    CustomerProfile,
    Role,
    TechnicianProfile,
    UserAuditEvent,
    UserRole,
)

__all__ = [
    'AppUser',
    'Booking',
    'BookingAttachment',
    'BookingEvent',
    'BookingLocationAccessEvent',
    'BookingQuote',
    'BookingQuoteLineItem',
    'BookingVisit',
    'CustomerAddress',
    'CustomerProfile',
    'MutationIdempotency',
    'Role',
    'Service',
    'ServiceCatalogAuditEvent',
    'ServiceCategory',
    'TechnicianAvailabilityPreference',
    'TechnicianCoverageArea',
    'TechnicianProfile',
    'TechnicianSkill',
    'TechnicianVerificationReview',
    'UserAuditEvent',
    'UserRole',
]
