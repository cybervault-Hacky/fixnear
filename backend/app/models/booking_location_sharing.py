"""One explicitly opted-in, booking-scoped foreground technician location."""

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class BookingLocationSharing(Base):
    __tablename__ = "booking_location_sharing"
    __table_args__ = (
        UniqueConstraint("booking_id", name="uq_booking_location_sharing_booking"),
        CheckConstraint(
            "state IN ('enabled', 'paused', 'stopped')", name="ck_booking_sharing_state"
        ),
        CheckConstraint("booking_version > 0", name="ck_booking_sharing_version"),
        CheckConstraint(
            "(latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL)",
            name="ck_booking_sharing_coordinate_pair",
        ),
        CheckConstraint(
            "latitude IS NULL OR latitude BETWEEN -90 AND 90",
            name="ck_booking_sharing_latitude",
        ),
        CheckConstraint(
            "longitude IS NULL OR longitude BETWEEN -180 AND 180",
            name="ck_booking_sharing_longitude",
        ),
        CheckConstraint(
            "accuracy_meters IS NULL OR accuracy_meters BETWEEN 0 AND 100000",
            name="ck_booking_sharing_accuracy",
        ),
        Index("ix_booking_sharing_technician", "technician_user_id"),
    )
    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid4
    )
    booking_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("bookings.id", ondelete="RESTRICT"),
        nullable=False,
    )
    technician_user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("technician_profiles.user_id", ondelete="RESTRICT"),
        nullable=False,
    )
    booking_version: Mapped[int] = mapped_column(Integer, nullable=False)
    state: Mapped[str] = mapped_column(String(16), nullable=False)
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    accuracy_meters: Mapped[float | None] = mapped_column(Float)
    location_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
