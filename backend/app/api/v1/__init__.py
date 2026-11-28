"""Version 1 API router collection."""

from fastapi import APIRouter

from app.api.v1.accounts import customer_router, technician_router
from app.api.v1.accounts import router as accounts_router
from app.api.v1.admin_notification_delivery import (
    router as admin_notification_delivery_router,
)
from app.api.v1.admin_operations import router as admin_operations_router
from app.api.v1.admin_service_catalog import router as admin_service_catalog_router
from app.api.v1.admin_technicians import router as admin_technicians_router
from app.api.v1.admin_users import router as admin_users_router
from app.api.v1.booking_location_sharing import router as location_sharing_router
from app.api.v1.bookings import admin_router as admin_bookings_router
from app.api.v1.bookings import customer_router as customer_bookings_router
from app.api.v1.bookings import technician_router as technician_bookings_router
from app.api.v1.health import router as health_router
from app.api.v1.homepassport import admin_router as admin_homepassport_router
from app.api.v1.homepassport import customer_router as customer_homepassport_router
from app.api.v1.mock_webhook import router as mock_webhook_router
from app.api.v1.notifications import router as notifications_router
from app.api.v1.public_technicians import router as public_technicians_router
from app.api.v1.reviews import admin_router as admin_reviews_router
from app.api.v1.reviews import customer_router as customer_reviews_router
from app.api.v1.reviews import technician_router as technician_reviews_router
from app.api.v1.services import router as services_router
from app.api.v1.simulated_payments import router as simulated_payments_router
from app.api.v1.support import admin_router as admin_support_router
from app.api.v1.support import customer_router as customer_support_router
from app.api.v1.technicians import router as technicians_router

router = APIRouter()
router.include_router(health_router)
router.include_router(accounts_router)
router.include_router(customer_router)
router.include_router(technician_router)
router.include_router(admin_users_router)
router.include_router(admin_operations_router)
router.include_router(customer_reviews_router)
router.include_router(technician_reviews_router)
router.include_router(admin_reviews_router)
router.include_router(customer_support_router)
router.include_router(admin_support_router)
router.include_router(services_router)
router.include_router(public_technicians_router)
router.include_router(technicians_router)
router.include_router(admin_service_catalog_router)
router.include_router(admin_technicians_router)
router.include_router(mock_webhook_router)
router.include_router(simulated_payments_router)
router.include_router(notifications_router)
router.include_router(admin_notification_delivery_router)
router.include_router(location_sharing_router)
router.include_router(customer_bookings_router)
router.include_router(technician_bookings_router)
router.include_router(admin_bookings_router)
router.include_router(customer_homepassport_router)
router.include_router(admin_homepassport_router)
