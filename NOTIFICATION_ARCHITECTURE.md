# Notification architecture (Phase 15: partially complete)

Existing booking-event notifications are created within the booking transaction, with static preview text, fixed internal booking links, recipient ownership, category preferences and unique event/recipient keys. The delivery table is added in the same transaction. It represents processing bookkeeping for an **already visible in-app notification**; a pending job does not delay or hide that notification. There is no historical backfill.

## Event coverage

| Persisted event | Recipients |
| --- | --- |
| booking.created | customer |
| booking.assignment.assigned, booking.assignment.reassigned | customer and currently assigned technician |
| booking.assignment.accepted, booking.assignment.declined | customer |
| booking.status_changed, booking.cancelled | customer and currently assigned technician if present |
| quote.created, quote.revised | customer |
| quote.approved, quote.rejected | currently assigned technician if present |

Work-started and completed states generate the generic `booking.status_changed` copy, not a specialized template. Reassignment does not notify the removed technician. Warranty, claims, maintenance, support, verification, admin and security events are **not integrated**. Existing `booking_event_id` is required; do not manufacture booking events for unrelated workflows. No localization and no generalized validated template/URL API yet. Static messages never interpolate user content.

## Queue

`notification_deliveries` has a unique idempotency key, a state, bounded attempt counters, scheduled retry, lease token and expiry. Attempts are recorded in `notification_delivery_attempts`. Claims use a conditional update; completion is fenced by the claim token. Recovery changes expired processing jobs to retry pending or permanently failed. Backoff begins at 30 seconds and doubles to a one-hour maximum; three attempts per cycle. An admin can explicitly restart a failed cycle with three more attempts, recorded in operations audit. This is manual, not an unbounded automatic retry. The worker can be invoked explicitly as `cd backend && python -m app.workers.notification_delivery` with the existing `DATABASE_URL`; it handles at most 100 jobs per invocation and has no scheduler. No worker was launched as part of this task.

`DeliveryAdapter` is a generic protocol; `SimulatedAdapter` deterministically succeeds or fails without contacts, messages, credentials or network. The manual worker uses only the success simulation. Email/SMS/web/mobile push channel names are reserved and their jobs would be explicitly labeled simulated; they are **not automatically enqueued**, have no channel-specific adapters, consent or preference management, and do not send anything. `delivered` for a simulated external channel means simulation succeeded, not actual delivery. No external channel credentials are configured or required.

The queue is a local foundation, not a verified production distributed worker. PostgreSQL runtime and contention were not tested. No claim of exactly-once external delivery can be made: fencing stops stale database completion but cannot undo an external side effect. Do not attach a real provider without consent, durable provider-side idempotency, failure classification, locking/concurrency tests, operational supervision and security review.

## Admin and security

`GET /api/v1/admin/notification-deliveries` supports bounded pagination and state/channel/category filtering; `GET /{id}` includes attempt history; `POST /{id}/retry` operates only on permanently failed rows and appends an audit event in the same transaction. Database admin role and existing admin-search rate limiter are required. Results contain UUID references, not contact details, previews, credentials or exception text. The BFF maintains existing same-origin CSRF protections. The admin page is `/admin/notification-deliveries`; customer and technician pages remain unchanged. Existing owner-scoped notification APIs and mandatory security-category preference remain; no security events are emitted.
