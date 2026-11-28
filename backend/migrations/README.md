# Alembic migrations

The application migrations create the external-auth identity mapping, application roles, customer/technician profiles, the service catalog, private technician-management tables, and Phase 8 customer bookings with ordered event history, PriceLock quote versions, attachment metadata, and mutation-idempotency records. Role/status changes, technician verification decisions, privileged catalog mutations, assignment, booking-state changes, quote decisions, cancellation, escalation, and quote revisions retain actor-linked audit history. Alembic reads `ALEMBIC_DATABASE_URL` (preferred for migrations) or `DATABASE_URL` from server-side environment settings; credentials must never be stored in this directory. Migration `0004_booking_pricelock` does not configure live object storage or payment processing; the attachment-storage adapter must remain unset until a separately reviewed provider integration is configured. Migration revision `0006_homepassport` (`0006_homepassport.py`) adds HomePassport appliances, verified/customer-reported service history, replaced parts, warranty records and server-computed claim state, warranty claims with append-only history, maintenance reminders, document metadata (storage provider/key are never exposed), and HomePassport audit events; it also adds the optional `appliances` link on bookings. It contains no seeded customer data. Migration revision `0005_location_visits` (`0005_location_discovery_visits.py`) adds optional private address/booking coordinates, opt-in technician-entered approximate coverage centers, visit status/ETA records, and append-only audit entries for exact location reads. It contains no seeded addresses or coordinates. The map is a non-live schematic; no external mapping provider, map tiles, geocoder, routing, or live tracking is configured. Keep external provider configuration disabled until privacy, key restrictions, tile attribution, data-processing terms, and an explicit provider selection have been reviewed.

Run from `backend/` after the database URL has been configured in a secure local environment:

```sh
alembic upgrade head
```

Run migrations against an isolated development/staging database first. Production migrations must be a controlled one-off deployment step, not an application-startup hook.

Migration `0008_technician_phone` adds a nullable private E.164 technician phone field. Upgrade and downgrade should be reviewed and tested on an isolated database before any controlled deployment.
