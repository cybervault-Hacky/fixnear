# Phase 14 final report — incomplete

Branch `arena/e2b50fbe-fixnear`; HEAD `ed3f11e7d3545787fa6c158e29ad99187e1d255e`. Complete initial status is in `PHASE14_INITIAL_STATUS.md`; final status is below. No changes were staged, committed, pushed, deployed, reset, cleaned, stashed or switched. Phase 13 payment/ledger systems were not modified or connected; their earlier incomplete state remains parked.

## Architecture and provider

The existing service-area map adapter retains its schematic fallback and now offers a Leaflet 1.9.4 / MapTiler raster-tile implementation when a correctly formatted public `NEXT_PUBLIC_MAPTILER_KEY` is configured. The customer explicitly selects map view and clicks “Load interactive map” before external tiles are requested. Leaflet supports movement and zoom, rounded technician-entered coverage-center markers, an on-device selected-location marker for coordinate searches, attribution, tile error/loading messages and responsive sizing. Existing list/map switch and profile cards remain. The map is not a live technician tracker. Public markers are rounded coverage-center data; an operator cannot guarantee a technician did not enter a sensitive location as a coverage center, and no geospatial boundary is established.

MapTiler receives the visitor IP and approximate viewport/tile coordinates after consent; the device's exact coordinates are not explicitly submitted as a tile parameter, but the viewport may reveal an approximate location. The existing one-time browser geolocation request is user initiated, not background tracking. List search uses a POST body rather than coordinates in URL. Existing manual area/city/PIN fallback remains. CSP now permits **only** `https://api.maptiler.com` as an image source when a valid-format public key is configured; no wildcard, remote script, or extra connect source was added. Key must be set at frontend build and runtime, be intended for public browser use, and be restricted by provider to the actual allowed domains; do not commit secrets. CSP/key changes require correct deployment configuration. Map provider terms, quotas, attribution and privacy must be reviewed.

**No real provider key, tile response, real map interaction or external MapTiler call was verified.** The synthetic build key was intentionally nonfunctional. Without a key, the schematic clearly says it is not a live map; the list continues to work. Browser map loading/interaction and CSP behavior remain unverified.

## Discovery and API

Existing `POST /api/v1/services/{slug}/nearby-technicians/search` now accepts validated `limit` (1–100, default 25) and `offset` (0–100000, default 0) and returns these with the total count. The UI offers previous/next controls. Results are filtered and sorted before slicing, with a user-ID tie-break; the implementation still loads candidate rows in memory and is not proven scalable. Existing active-account, approved verification, service skill and active service/category filters remain. Coordinate searches use Haversine radius against service-area centers and do **not** establish that the requested address lies within a coverage boundary. Manual searches match supplied coverage fields. Results do not check real-time availability, booked conflicts or all booking eligibility, and cannot be treated as an assignment or appointment promise. There is no new service-category picker beyond the existing service-specific page/catalog. Current public profile and nearby APIs expose rounded service-area centers, not customer addresses or a live technician location.

## Location sharing and booking visits

**Not implemented:** technician consent/sharing enable, pause/stop, storage, freshness, access restrictions, sharing audit and live location markers. No covert or continuous tracking was introduced. Existing visit endpoint allows assigned technicians or admins to record scheduled/en-route/arrived/completed and manual ETA after acceptance and records booking audit events; no new work-started visit state, ETA source or ETA freshness semantics were added. Booking work transitions remain separate. Existing address/assignment privacy controls were not weakened, but no new location-sharing security test can be claimed.

## Changes

Created `frontend/features/services/components/LeafletCoverageMap.tsx`, `backend/tests/test_phase14_discovery.py`, `PHASE14_INITIAL_STATUS.md`, this report. Modified `frontend/features/services/components/ServiceAreaMap.tsx`, `frontend/features/services/components/NearbyTechnicianDiscovery.tsx`, `frontend/lib/api/technician-discovery.ts`, `frontend/app/globals.css`, `frontend/security-headers.mjs`, `frontend/security-headers.d.mts`, `frontend/next.config.ts`, `frontend/.env.example`, `frontend/package.json`, `frontend/package-lock.json`, `frontend/tests/security-headers.test.mjs`, `backend/app/schemas/location_discovery.py`, `backend/app/services/technician_discovery.py`, `backend/app/api/v1/services.py`, `README.md`. Leaflet and its type definitions were installed via the npm registry; no provider or other live service was called.

## Database and verification

No Phase 14 schema or migration was added. Alembic head remains `0012_simulated_ledger`; existing SQLite migration-chain tests **4 passed**. Full backend `TZ=UTC .venv/bin/pytest -q`: **212 passed**, one Starlette/httpx deprecation warning; `TZ=Asia/Kolkata`: **212 passed**, same warning. Earlier warranty UTC boundary failures depend on process-local `date.today()` vs application Asia/Kolkata service date; these runs happened outside the date boundary and do not prove that issue fixed. Backend Ruff and compileall passed.

Focused existing booking/discovery tests plus the new pagination test: **15 passed**. They cover existing approval/account/skill/radius/manual-area/privacy behavior and new pagination and invalid coordinates; they do not cover live availability, location sharing, stale location or provider behavior. Frontend Node/API tests: **62 passed**, including new exact MapTiler CSP-origin test and existing browser-location helper tests. ESLint, TypeScript, Prettier check and production build passed with synthetic `FIXNEAR_ALLOWED_HOSTS=fixnear.example,localhost:3000` and nonfunctional `NEXT_PUBLIC_MAPTILER_KEY=test_only_nonfunctional`. Chromium executable was not installed; Playwright/browser E2E not run. No live map verification is claimed.

## Remaining acceptance gaps

Implement and test an explicit, revocable technician sharing lifecycle with active-work/availability eligibility, ownership, freshness, retention, coarse/public and assigned-booking access, audit and no background collection without consent. Define reliable coverage boundaries and appointment availability rules with server validation; integrate service/category filters and selected addresses; add explicit ETA source/update timestamps and work-state coordination without inventing estimates. Test unauthorized access, stale/disabled sharing, assignment isolation, permission denial, provider failures, mobile rendering and browser interactions. Perform configured provider and CSP verification, PostgreSQL migration/concurrency rehearsal where relevant, and accessibility/security review. Phase 14 is **not complete**.

## Final Git status (`git status --short -uall`)

```text
 M .env.example
 M README.md
 M backend/app/api/v1/__init__.py
 M backend/app/api/v1/accounts.py
 M backend/app/api/v1/admin_technicians.py
 M backend/app/api/v1/admin_users.py
 M backend/app/api/v1/bookings.py
 M backend/app/api/v1/services.py
 M backend/app/auth/authorization.py
 M backend/app/core/config.py
 M backend/app/main.py
 M backend/app/models/__init__.py
 M backend/app/models/booking_management.py
 M backend/app/models/user_management.py
 M backend/app/schemas/accounts.py
 M backend/app/schemas/booking_management.py
 M backend/app/schemas/location_discovery.py
 M backend/app/schemas/technician_management.py
 M backend/app/services/admin_user_management.py
 M backend/app/services/booking_management.py
 M backend/app/services/technician_discovery.py
 M backend/app/services/technician_management.py
 M backend/migrations/README.md
 M backend/requirements.txt
 M backend/tests/test_account_authorization.py
 M backend/tests/test_booking_management.py
 M backend/tests/test_database_migrations.py
 M frontend/.env.example
 M frontend/app/admin/service-catalog/page.tsx
 M frontend/app/admin/technicians/page.tsx
 M frontend/app/api/backend/[...path]/route.ts
 M frontend/app/dashboard/homepassport/page.tsx
 M frontend/app/dashboard/warranties/page.tsx
 M frontend/app/globals.css
 M frontend/e2e/dashboard.spec.ts
 M frontend/features/bookings/components/AdminBookingDetailPage.tsx
 D frontend/features/bookings/components/AdminBookingFrame.tsx
 M frontend/features/bookings/components/AdminBookingListPage.tsx
 M frontend/features/dashboard/components/DashboardOverview.tsx
 M frontend/features/dashboard/components/DashboardShell.tsx
 D frontend/features/dashboard/components/DemoApplianceCard.tsx
 D frontend/features/dashboard/components/DemoWarrantyCard.tsx
 D frontend/features/dashboard/components/HomePassportPageContent.tsx
 D frontend/features/dashboard/components/WarrantiesPageContent.tsx
 M frontend/features/dashboard/data/demo-data.ts
 M frontend/features/dashboard/types/dashboard.ts
 M frontend/features/services/components/NearbyTechnicianDiscovery.tsx
 M frontend/features/services/components/ServiceAreaMap.tsx
 M frontend/features/technician/components/TechnicianDashboardShell.tsx
 M frontend/lib/api/technician-discovery.ts
 M frontend/lib/server/auth.ts
 M frontend/next.config.ts
 M frontend/package-lock.json
 M frontend/package.json
 M frontend/tests/backend-api.test.mjs
?? PHASE11_SECURITY_FOLLOWUP_REPORT.md
?? PHASE12B_AUTHENTICATION_REPORT.md
?? PHASE12C_AUTHENTICATION_REPORT.md
?? PHASE12_AUTHENTICATION_REPORT.md
?? PHASE12_CLOSURE_REPORT.md
?? PHASE12_FINAL_REPORT.md
?? PHASE13_CONTINUATION_INITIAL_STATUS.md
?? PHASE13_FINAL_REPORT.md
?? PHASE13_INITIAL_INSPECTION.md
?? PHASE13_MILESTONE_2B_INITIAL_STATUS.md
?? PHASE13_MILESTONE_3_INITIAL_STATUS.md
?? PHASE14_FINAL_REPORT.md
?? PHASE14_INITIAL_STATUS.md
?? backend/PHASE13_WEBHOOK_INITIAL_STATUS.md
?? backend/app/api/v1/admin_operations.py
?? backend/app/api/v1/homepassport.py
?? backend/app/api/v1/mock_webhook.py
?? backend/app/api/v1/reviews.py
?? backend/app/api/v1/simulated_payments.py
?? backend/app/api/v1/support.py
?? backend/app/core/rate_limit.py
?? backend/app/core/rate_limit_middleware.py
?? backend/app/core/security_headers.py
?? backend/app/models/homepassport.py
?? backend/app/models/mock_webhook.py
?? backend/app/models/operations.py
?? backend/app/models/payment_attempt.py
?? backend/app/models/payment_intent.py
?? backend/app/models/simulated_ledger.py
?? backend/app/schemas/homepassport.py
?? backend/app/schemas/operations.py
?? backend/app/services/admin_audit.py
?? backend/app/services/admin_customers.py
?? backend/app/services/admin_dashboard.py
?? backend/app/services/document_storage.py
?? backend/app/services/homepassport.py
?? backend/app/services/mock_payment_provider.py
?? backend/app/services/mock_webhooks.py
?? backend/app/services/operations_audit.py
?? backend/app/services/reviews.py
?? backend/app/services/simulated_finance.py
?? backend/app/services/simulated_ledger.py
?? backend/app/services/support.py
?? backend/migrations/versions/0006_homepassport.py
?? backend/migrations/versions/0007_operations.py
?? backend/migrations/versions/0008_technician_phone.py
?? backend/migrations/versions/0009_simulated_intent.py
?? backend/migrations/versions/0010_simulated_attempt.py
?? backend/migrations/versions/0011_mock_webhooks.py
?? backend/migrations/versions/0012_simulated_ledger.py
?? backend/tests/conftest.py
?? backend/tests/test_audit_probe.py
?? backend/tests/test_homepassport.py
?? backend/tests/test_mock_payment_attempt.py
?? backend/tests/test_mock_webhook.py
?? backend/tests/test_operations.py
?? backend/tests/test_phase14_discovery.py
?? backend/tests/test_privileged_mutation_reasons.py
?? backend/tests/test_rate_limiting.py
?? backend/tests/test_security_headers_and_cors.py
?? backend/tests/test_simulated_finance.py
?? backend/tests/test_simulated_ledger.py
?? backend/tests/test_simulated_payment_drafts.py
?? backend/tests/test_technician_approval_access.py
?? backend/tests/test_technician_registration.py
?? frontend/app/admin/audit/page.tsx
?? frontend/app/admin/customers/page.tsx
?? frontend/app/admin/homepassport/page.tsx
?? frontend/app/admin/page.tsx
?? frontend/app/admin/reviews/page.tsx
?? frontend/app/admin/support/page.tsx
?? frontend/app/api/auth/login/route.ts
?? frontend/app/api/auth/recover/route.ts
?? frontend/app/api/auth/resend/route.ts
?? frontend/app/api/auth/reset-password/route.ts
?? frontend/app/api/auth/signup/route.ts
?? frontend/app/api/auth/verify/customer/route.ts
?? frontend/app/api/auth/verify/technician/route.ts
?? frontend/app/dashboard/claims/page.tsx
?? frontend/app/dashboard/documents/page.tsx
?? frontend/app/dashboard/homepassport/[applianceId]/page.tsx
?? frontend/app/dashboard/reviews/page.tsx
?? frontend/app/dashboard/simulated-payments/page.tsx
?? frontend/app/dashboard/support/page.tsx
?? frontend/app/dashboard/warranties/[warrantyId]/page.tsx
?? frontend/app/forgot-password/page.tsx
?? frontend/app/login/page.tsx
?? frontend/app/reset-password/page.tsx
?? frontend/app/signup/page.tsx
?? frontend/app/signup/technician/page.tsx
?? frontend/app/technician/reviews/page.tsx
?? frontend/app/verify-email/page.tsx
?? frontend/features/admin/components/AdminAuditPage.tsx
?? frontend/features/admin/components/AdminCustomersPage.tsx
?? frontend/features/admin/components/AdminOverviewPage.tsx
?? frontend/features/admin/components/AdminReviewsPage.tsx
?? frontend/features/admin/components/AdminShell.tsx
?? frontend/features/admin/components/admin-errors.ts
?? frontend/features/auth/components/RecoveryForm.tsx
?? frontend/features/auth/components/SignupForm.tsx
?? frontend/features/auth/components/VerifyEmailForm.tsx
?? frontend/features/bookings/components/SimulatedPaymentStatus.tsx
?? frontend/features/homepassport/components/AdminHomePassportPage.tsx
?? frontend/features/homepassport/components/ApplianceDetailPage.tsx
?? frontend/features/homepassport/components/ApplianceForm.tsx
?? frontend/features/homepassport/components/ClaimsPage.tsx
?? frontend/features/homepassport/components/DocumentsPage.tsx
?? frontend/features/homepassport/components/HomePassportPageContent.tsx
?? frontend/features/homepassport/components/WarrantiesPageContent.tsx
?? frontend/features/homepassport/components/WarrantyDetailPage.tsx
?? frontend/features/homepassport/components/passport-ui.tsx
?? frontend/features/reviews/components/CustomerReviewsPage.tsx
?? frontend/features/reviews/components/TechnicianReviewsPage.tsx
?? frontend/features/services/components/LeafletCoverageMap.tsx
?? frontend/features/support/components/AdminSupportDeskPage.tsx
?? frontend/features/support/components/CustomerSupportPage.tsx
?? frontend/host-policy.d.mts
?? frontend/host-policy.mjs
?? frontend/lib/api/admin.ts
?? frontend/lib/api/homepassport-utils.ts
?? frontend/lib/api/homepassport.ts
?? frontend/lib/api/reviews.ts
?? frontend/lib/api/support.ts
?? frontend/proxy.ts
?? frontend/security-headers.d.mts
?? frontend/security-headers.mjs
?? frontend/tests/homepassport-utils.test.mjs
?? frontend/tests/host-policy.test.mjs
?? frontend/tests/login-api.test.mjs
?? frontend/tests/recovery-api.test.mjs
?? frontend/tests/request-origin.test.mjs
?? frontend/tests/security-headers.test.mjs
?? frontend/tests/signup-api.test.mjs
```


# Phase 14 continuation — incomplete (latest)

This continuation supersedes earlier status where different; earlier report remains above. Branch `arena/e2b50fbe-fixnear`; HEAD `ed3f11e7d3545787fa6c158e29ad99187e1d255e`. Full initial status is in `PHASE14_CONTINUATION_INITIAL_STATUS.md`; there were no staged changes. Final status is below. No reset, clean, stash, switch, stage, commit, push or deployment. Phase 13 payment/ledger code was not modified.

## Changed files

Created `backend/app/models/booking_location_sharing.py`, `backend/app/api/v1/booking_location_sharing.py`, `backend/migrations/versions/0013_booking_location_sharing.py`, `backend/tests/test_booking_location_sharing.py`, `frontend/features/bookings/components/BookingLocationSharing.tsx`, `PHASE14_CONTINUATION_INITIAL_STATUS.md`. Modified `backend/app/models/__init__.py`, `backend/app/api/v1/__init__.py`, `backend/app/models/booking_management.py`, `backend/app/schemas/booking_management.py`, `backend/app/services/booking_management.py`, `backend/tests/test_database_migrations.py`, `backend/tests/test_booking_management.py`, `frontend/lib/api/bookings.ts`, `frontend/features/bookings/components/CustomerBookingDetailPage.tsx`, `frontend/features/bookings/components/TechnicianBookingDetailPage.tsx`, `frontend/features/bookings/components/AdminBookingDetailPage.tsx`, `frontend/features/services/components/NearbyTechnicianDiscovery.tsx`, and this report.

## Sharing architecture and API

`0013_booking_location_sharing` creates one booking-scoped location record with state, technician owner, booking version, bounded coordinate pair/accuracy, and server-recorded update time. An approved active assigned technician can explicitly enable sharing only after acceptance and while the booking is in an eligible active state. Enable clears any prior fix; a separate user-triggered one-time browser location request must then POST the fix. Pause and stop clear the stored fix. No polling, watchPosition or background collection was added. Booking-row locks serialize each action with assignment/booking changes; a changed booking version invalidates the consent, and re-enabling is required. The active assignment, technician role, active account and approved profile are checked; coordinates are withheld when inactive, reassigned, non-active booking, disabled or stale over five minutes. A stale response returns timestamp but no coordinates. Responses are not public discovery data.

Endpoints under `/api/v1`: technician `GET`/`PUT /technician/bookings/{id}/location-sharing`, `POST /technician/bookings/{id}/location-sharing/location`; customer `GET /customer/bookings/{id}/technician-location`; admin `GET /admin/bookings/{id}/technician-location`. Role dependencies and resource ownership are enforced; state changes, location submissions and customer/admin reads append operations audit metadata without coordinates. The customer and technician booking views include one-shot sharing controls/status; the customer can refresh manually and view a fresh point as coordinates. Permission failure/unavailable states are reported. Existing BFF CSRF/Origin and global rate limits remain; no new sharing-specific limit was added. Admin read API is audited, but no admin location UI was added.

Privacy limitations: this is not continuous live tracking. Coordinates from old/stale or invalidated sessions remain in the database until an allowed pause/stop/re-enable or other deletion; there is no retention job, and after a booking closes the technician cannot call stop through this active-booking endpoint. A booking update invalidates sharing even if unrelated, which is conservative but can interrupt the experience. PostgreSQL row-lock/race and revocation concurrency have not been verified; SQLite does not establish this. No explicit technician-controlled availability-sharing/discovery mode exists. Before production, add retention/deletion policy, targeted rate limits, notification/access review, concurrency tests and privacy/security review.

## ETA and availability

Visit updates now assign `technician_manual` or `admin_manual` source server-side and record an ETA-specific timestamp and existing updating actor. API schemas reject client-supplied source values; legacy unsourced ETAs remain in the database but are hidden from API responses. Customer, technician and admin booking views show attributed estimates and update time only when source and timestamp exist. No routing provider, generated ETA or navigation claim was introduced. Existing scheduled/en-route/arrived/completed visit flow and separate booking work transitions remain; an explicit work-started visit state was not added.

Availability is **not verified or conflict-aware**. Discovery still uses active account, approved status, active catalog service/skill and saved coverage, but its schedule preferences are not real booking availability; result cards now say “Availability unknown.” No available/busy/unavailable computation, conflict checks, acceptance toggle, or coverage-boundary guarantee was implemented. Phase 14 cannot close.

## Migration and verification

`0013_booking_location_sharing` also adds nullable ETA source/update columns; downgrade removes these fields and the sharing table (destructive to new location/ETA metadata). SQLite full migration upgrade/metadata check/downgrade tests **4 passed**; PostgreSQL offline upgrade/downgrade SQL generation passed. No live PostgreSQL migration or concurrency test.

Focused backend booking, sharing and migration tests: **22 passed**. New tests cover disabled sharing, explicit enable, assigned technician, other customer/technician denial, invalid coordinates, stale hiding, pause/stop, booking-version invalidation, pending technician denial, admin audit, legacy unsourced ETA and rejection of forged ETA source. Existing tests cover booking assignment/location privacy and visit auditing; these do not establish live provider or concurrency behavior. Full backend `TZ=UTC .venv/bin/pytest -q`: **216 passed**, one Starlette/httpx deprecation warning; `TZ=Asia/Kolkata`: **216 passed**, same warning. Past UTC/Asia-Kolkata warranty date-boundary sensitivity remains; these runs occurred outside that boundary and do not fix it. Ruff and Python compileall passed.

Frontend API tests **62 passed**; ESLint, typecheck, Prettier check and production build passed using synthetic `FIXNEAR_ALLOWED_HOSTS=fixnear.example,localhost:3000` and nonfunctional `NEXT_PUBLIC_MAPTILER_KEY=test_only_nonfunctional`. No new frontend sharing or ETA tests were added. Chromium executable was unavailable; Playwright E2E was not run. No live MapTiler tiles or browser behavior were verified.

## Remaining completion blockers

Implement and test conflict-aware, date/time-specific availability and ability-to-accept rules; booking visit work-started/completed coordination; sharing cleanup/retention and revocation on closed bookings; sharing/privacy and location status UX including admin; concurrent assignment/cancellation/sharing races and actual PostgreSQL migration; frontend tests, mobile accessibility and browser E2E; configured provider verification and coverage boundary model. Existing Phase 12 PKCE/link callback gaps remain. Do not claim Phase 14 complete.

## Final Git status (`git status --short -uall`)

```text
 M .env.example
 M README.md
 M backend/app/api/v1/__init__.py
 M backend/app/api/v1/accounts.py
 M backend/app/api/v1/admin_technicians.py
 M backend/app/api/v1/admin_users.py
 M backend/app/api/v1/bookings.py
 M backend/app/api/v1/services.py
 M backend/app/auth/authorization.py
 M backend/app/core/config.py
 M backend/app/main.py
 M backend/app/models/__init__.py
 M backend/app/models/booking_management.py
 M backend/app/models/user_management.py
 M backend/app/schemas/accounts.py
 M backend/app/schemas/booking_management.py
 M backend/app/schemas/location_discovery.py
 M backend/app/schemas/technician_management.py
 M backend/app/services/admin_user_management.py
 M backend/app/services/booking_management.py
 M backend/app/services/technician_discovery.py
 M backend/app/services/technician_management.py
 M backend/migrations/README.md
 M backend/requirements.txt
 M backend/tests/test_account_authorization.py
 M backend/tests/test_booking_management.py
 M backend/tests/test_database_migrations.py
 M frontend/.env.example
 M frontend/app/admin/service-catalog/page.tsx
 M frontend/app/admin/technicians/page.tsx
 M frontend/app/api/backend/[...path]/route.ts
 M frontend/app/dashboard/homepassport/page.tsx
 M frontend/app/dashboard/warranties/page.tsx
 M frontend/app/globals.css
 M frontend/e2e/dashboard.spec.ts
 M frontend/features/bookings/components/AdminBookingDetailPage.tsx
 D frontend/features/bookings/components/AdminBookingFrame.tsx
 M frontend/features/bookings/components/AdminBookingListPage.tsx
 M frontend/features/bookings/components/CustomerBookingDetailPage.tsx
 M frontend/features/bookings/components/TechnicianBookingDetailPage.tsx
 M frontend/features/dashboard/components/DashboardOverview.tsx
 M frontend/features/dashboard/components/DashboardShell.tsx
 D frontend/features/dashboard/components/DemoApplianceCard.tsx
 D frontend/features/dashboard/components/DemoWarrantyCard.tsx
 D frontend/features/dashboard/components/HomePassportPageContent.tsx
 D frontend/features/dashboard/components/WarrantiesPageContent.tsx
 M frontend/features/dashboard/data/demo-data.ts
 M frontend/features/dashboard/types/dashboard.ts
 M frontend/features/services/components/NearbyTechnicianDiscovery.tsx
 M frontend/features/services/components/ServiceAreaMap.tsx
 M frontend/features/technician/components/TechnicianDashboardShell.tsx
 M frontend/lib/api/bookings.ts
 M frontend/lib/api/technician-discovery.ts
 M frontend/lib/server/auth.ts
 M frontend/next.config.ts
 M frontend/package-lock.json
 M frontend/package.json
 M frontend/tests/backend-api.test.mjs
?? PHASE11_SECURITY_FOLLOWUP_REPORT.md
?? PHASE12B_AUTHENTICATION_REPORT.md
?? PHASE12C_AUTHENTICATION_REPORT.md
?? PHASE12_AUTHENTICATION_REPORT.md
?? PHASE12_CLOSURE_REPORT.md
?? PHASE12_FINAL_REPORT.md
?? PHASE13_CONTINUATION_INITIAL_STATUS.md
?? PHASE13_FINAL_REPORT.md
?? PHASE13_INITIAL_INSPECTION.md
?? PHASE13_MILESTONE_2B_INITIAL_STATUS.md
?? PHASE13_MILESTONE_3_INITIAL_STATUS.md
?? PHASE14_CONTINUATION_INITIAL_STATUS.md
?? PHASE14_FINAL_REPORT.md
?? PHASE14_INITIAL_STATUS.md
?? backend/PHASE13_WEBHOOK_INITIAL_STATUS.md
?? backend/app/api/v1/admin_operations.py
?? backend/app/api/v1/booking_location_sharing.py
?? backend/app/api/v1/homepassport.py
?? backend/app/api/v1/mock_webhook.py
?? backend/app/api/v1/reviews.py
?? backend/app/api/v1/simulated_payments.py
?? backend/app/api/v1/support.py
?? backend/app/core/rate_limit.py
?? backend/app/core/rate_limit_middleware.py
?? backend/app/core/security_headers.py
?? backend/app/models/booking_location_sharing.py
?? backend/app/models/homepassport.py
?? backend/app/models/mock_webhook.py
?? backend/app/models/operations.py
?? backend/app/models/payment_attempt.py
?? backend/app/models/payment_intent.py
?? backend/app/models/simulated_ledger.py
?? backend/app/schemas/homepassport.py
?? backend/app/schemas/operations.py
?? backend/app/services/admin_audit.py
?? backend/app/services/admin_customers.py
?? backend/app/services/admin_dashboard.py
?? backend/app/services/document_storage.py
?? backend/app/services/homepassport.py
?? backend/app/services/mock_payment_provider.py
?? backend/app/services/mock_webhooks.py
?? backend/app/services/operations_audit.py
?? backend/app/services/reviews.py
?? backend/app/services/simulated_finance.py
?? backend/app/services/simulated_ledger.py
?? backend/app/services/support.py
?? backend/migrations/versions/0006_homepassport.py
?? backend/migrations/versions/0007_operations.py
?? backend/migrations/versions/0008_technician_phone.py
?? backend/migrations/versions/0009_simulated_intent.py
?? backend/migrations/versions/0010_simulated_attempt.py
?? backend/migrations/versions/0011_mock_webhooks.py
?? backend/migrations/versions/0012_simulated_ledger.py
?? backend/migrations/versions/0013_booking_location_sharing.py
?? backend/tests/conftest.py
?? backend/tests/test_audit_probe.py
?? backend/tests/test_booking_location_sharing.py
?? backend/tests/test_homepassport.py
?? backend/tests/test_mock_payment_attempt.py
?? backend/tests/test_mock_webhook.py
?? backend/tests/test_operations.py
?? backend/tests/test_phase14_discovery.py
?? backend/tests/test_privileged_mutation_reasons.py
?? backend/tests/test_rate_limiting.py
?? backend/tests/test_security_headers_and_cors.py
?? backend/tests/test_simulated_finance.py
?? backend/tests/test_simulated_ledger.py
?? backend/tests/test_simulated_payment_drafts.py
?? backend/tests/test_technician_approval_access.py
?? backend/tests/test_technician_registration.py
?? frontend/app/admin/audit/page.tsx
?? frontend/app/admin/customers/page.tsx
?? frontend/app/admin/homepassport/page.tsx
?? frontend/app/admin/page.tsx
?? frontend/app/admin/reviews/page.tsx
?? frontend/app/admin/support/page.tsx
?? frontend/app/api/auth/login/route.ts
?? frontend/app/api/auth/recover/route.ts
?? frontend/app/api/auth/resend/route.ts
?? frontend/app/api/auth/reset-password/route.ts
?? frontend/app/api/auth/signup/route.ts
?? frontend/app/api/auth/verify/customer/route.ts
?? frontend/app/api/auth/verify/technician/route.ts
?? frontend/app/dashboard/claims/page.tsx
?? frontend/app/dashboard/documents/page.tsx
?? frontend/app/dashboard/homepassport/[applianceId]/page.tsx
?? frontend/app/dashboard/reviews/page.tsx
?? frontend/app/dashboard/simulated-payments/page.tsx
?? frontend/app/dashboard/support/page.tsx
?? frontend/app/dashboard/warranties/[warrantyId]/page.tsx
?? frontend/app/forgot-password/page.tsx
?? frontend/app/login/page.tsx
?? frontend/app/reset-password/page.tsx
?? frontend/app/signup/page.tsx
?? frontend/app/signup/technician/page.tsx
?? frontend/app/technician/reviews/page.tsx
?? frontend/app/verify-email/page.tsx
?? frontend/features/admin/components/AdminAuditPage.tsx
?? frontend/features/admin/components/AdminCustomersPage.tsx
?? frontend/features/admin/components/AdminOverviewPage.tsx
?? frontend/features/admin/components/AdminReviewsPage.tsx
?? frontend/features/admin/components/AdminShell.tsx
?? frontend/features/admin/components/admin-errors.ts
?? frontend/features/auth/components/RecoveryForm.tsx
?? frontend/features/auth/components/SignupForm.tsx
?? frontend/features/auth/components/VerifyEmailForm.tsx
?? frontend/features/bookings/components/BookingLocationSharing.tsx
?? frontend/features/bookings/components/SimulatedPaymentStatus.tsx
?? frontend/features/homepassport/components/AdminHomePassportPage.tsx
?? frontend/features/homepassport/components/ApplianceDetailPage.tsx
?? frontend/features/homepassport/components/ApplianceForm.tsx
?? frontend/features/homepassport/components/ClaimsPage.tsx
?? frontend/features/homepassport/components/DocumentsPage.tsx
?? frontend/features/homepassport/components/HomePassportPageContent.tsx
?? frontend/features/homepassport/components/WarrantiesPageContent.tsx
?? frontend/features/homepassport/components/WarrantyDetailPage.tsx
?? frontend/features/homepassport/components/passport-ui.tsx
?? frontend/features/reviews/components/CustomerReviewsPage.tsx
?? frontend/features/reviews/components/TechnicianReviewsPage.tsx
?? frontend/features/services/components/LeafletCoverageMap.tsx
?? frontend/features/support/components/AdminSupportDeskPage.tsx
?? frontend/features/support/components/CustomerSupportPage.tsx
?? frontend/host-policy.d.mts
?? frontend/host-policy.mjs
?? frontend/lib/api/admin.ts
?? frontend/lib/api/homepassport-utils.ts
?? frontend/lib/api/homepassport.ts
?? frontend/lib/api/reviews.ts
?? frontend/lib/api/support.ts
?? frontend/proxy.ts
?? frontend/security-headers.d.mts
?? frontend/security-headers.mjs
?? frontend/tests/homepassport-utils.test.mjs
?? frontend/tests/host-policy.test.mjs
?? frontend/tests/login-api.test.mjs
?? frontend/tests/recovery-api.test.mjs
?? frontend/tests/request-origin.test.mjs
?? frontend/tests/security-headers.test.mjs
?? frontend/tests/signup-api.test.mjs
```
