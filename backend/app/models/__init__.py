"""Application database models."""

from app.models.booking_location_sharing import BookingLocationSharing
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
from app.models.homepassport import (
    APPLIANCE_CATEGORIES,
    CLAIM_STATUSES,
    DOCUMENT_TYPES,
    REMINDER_TYPES,
    SERVICE_HISTORY_SOURCES,
    VERIFICATION_STATUSES,
    WARRANTY_TYPES,
    Appliance,
    ApplianceDocument,
    ApplianceServiceHistory,
    HomePassportAuditEvent,
    MaintenanceReminder,
    ReplacedPart,
    WarrantyClaim,
    WarrantyClaimHistory,
    WarrantyRecord,
)
from app.models.mock_webhook import MockWebhookEvent
from app.models.notification_delivery import (
    NotificationDelivery,
    NotificationDeliveryAttempt,
)
from app.models.notifications import InAppNotification, NotificationPreference
from app.models.operations import (
    OperationsAuditEvent,
    Review,
    ReviewReport,
    SupportInternalNote,
    SupportMessage,
    SupportTicket,
    SupportTicketEvent,
)
from app.models.payment_attempt import SimulatedPaymentAttempt
from app.models.payment_intent import SimulatedPaymentIntent
from app.models.service_catalog import (
    Service,
    ServiceCatalogAuditEvent,
    ServiceCategory,
)
from app.models.simulated_ledger import (
    SimulatedAccount,
    SimulatedJournal,
    SimulatedLedgerEntry,
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
    'APPLIANCE_CATEGORIES',
    'CLAIM_STATUSES',
    'DOCUMENT_TYPES',
    'REMINDER_TYPES',
    'SERVICE_HISTORY_SOURCES',
    'VERIFICATION_STATUSES',
    'WARRANTY_TYPES',
    'AppUser',
    'Appliance',
    'ApplianceDocument',
    'ApplianceServiceHistory',
    'Booking',
    'BookingAttachment',
    'BookingEvent',
    'BookingLocationAccessEvent',
    'BookingLocationSharing',
    'BookingQuote',
    'BookingQuoteLineItem',
    'BookingVisit',
    'CustomerAddress',
    'CustomerProfile',
    'HomePassportAuditEvent',
    'InAppNotification',
    'MaintenanceReminder',
    'MockWebhookEvent',
    'MutationIdempotency',
    "NotificationDelivery",
    "NotificationDeliveryAttempt",
    'NotificationPreference',
    'OperationsAuditEvent',
    'ReplacedPart',
    'Review',
    'ReviewReport',
    'Role',
    'Service',
    'ServiceCatalogAuditEvent',
    'ServiceCategory',
    'SimulatedAccount',
    'SimulatedJournal',
    'SimulatedLedgerEntry',
    'SimulatedPaymentAttempt',
    'SimulatedPaymentIntent',
    'SupportInternalNote',
    'SupportMessage',
    'SupportTicket',
    'SupportTicketEvent',
    'TechnicianAvailabilityPreference',
    'TechnicianCoverageArea',
    'TechnicianProfile',
    'TechnicianSkill',
    'TechnicianVerificationReview',
    'UserAuditEvent',
    'UserRole',
    'WarrantyClaim',
    'WarrantyClaimHistory',
    'WarrantyRecord',
]
