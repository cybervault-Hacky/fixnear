# fixnear

> **FixNear — Home repairs. Without the guesswork.**

FixNear is a responsive home-services technology platform being built for Pune, Maharashtra, with a foundation designed to scale across India. The product is intended to make home repairs easier to understand through clear quotations, repair documentation, and service accountability.

## Current development status

**Phases 1–9 remain in place; Phase 10 adds a database-backed review system (verified-customer ratings, 30-day edit window, admin hide/restore moderation with mandatory reasons, and a report queue), a database-backed support-ticket desk (customer submission, categorised tickets, staff replies, private internal notes, escalation, and audited status trails), an admin platform overview with inline-SVG trend charts and database-computed metrics, admin customer management with audited suspend/reactivate and mandatory reasons, and a unified admin audit log across modules.** Phase 10 customer routes live at `/dashboard/reviews` and `/dashboard/support`; technician reviews live at `/technician/reviews`; admin routes live at `/admin` (overview), `/admin/customers`, `/admin/reviews`, `/admin/support`, and `/admin/audit`. Reviews and tickets are database-backed throughout; the remaining `/dashboard` sections stay explicitly labelled session-only samples. Admin metrics that cannot be computed from existing tables are shown as unavailable, never fabricated; opening any admin screen without the server-managed admin role shows an unavailable/forbidden state instead of partial data.

**Phase 9 adds a database-backed HomePassport appliance registry, verified and customer-reported service history, replaced parts, a warranty vault, warranty claims with an audited support decision workflow, a private document vault foundation, and in-app maintenance reminders.** HomePassport routes live at `/dashboard/homepassport`, `/dashboard/homepassport/[applianceId]`, `/dashboard/warranties`, `/dashboard/warranties/[warrantyId]`, `/dashboard/claims`, and `/dashboard/documents`; support claim review, warranty verification and audit oversight live at `/admin/homepassport`. HomePassport, warranties, claims and documents read and write real records from the FastAPI backend through the session-based BFF, so they show unauthorized/empty states until a provisioned account is used; the remaining `/dashboard` sections remain explicitly labelled session-only samples. Appliance records, verified service history from completed bookings, replaced parts, warranty records with server-computed statuses, claims and reminders are all database-backed. Customer-entered service history and parts are labelled unverified; FixNear-verified records come only from completed, quote-approved jobs linked to the appliance and cannot be edited or deleted by customers. Warranty statuses are computed from recorded dates and claim state, never client input, and filing or approving a claim never promises coverage. Document uploads require a configured Cloudinary/S3-compatible adapter; until `DocumentStorage` is configured the app reports uploads as unavailable (503) rather than pretending they succeeded. Reminder reminders are stored in-app only; email, SMS and push delivery are not configured.

The public service directory and guide pages prefer active records from the FastAPI catalog, with the existing six local guides preserved as an explicitly illustrative preview when the API is unavailable. Customer booking routes live at `/bookings`, `/bookings/new`, and `/bookings/[bookingId]`; technician assignment, inspection, quote, and progress tools live at `/technician/bookings`; admin filters, eligible assignment, manual visit status/ETA updates, quote oversight, cancellation, escalation, and audit history live at `/admin/bookings`. The technician demo routes, including `/technician`, and customer demo routes, including `/dashboard`, remain available. Profile management, admin catalog, and technician review remain at `/technician/manage`, `/admin/service-catalog`, and `/admin/technicians`. The Next.js BFF proxies same-origin API calls without exposing bearer tokens to browser code and validates mutation idempotency keys. Customer and technician email-code signup and email-OTP password recovery are implemented but require provider template configuration; provider link callbacks are not implemented. Technician application details are collected through the existing onboarding workflow after email verification. Password login is available for verified, externally provisioned Supabase and application accounts. No live Supabase or Neon project is configured. Payments/refunds, live file storage, production identity/database setup, catalog prices, and real-time technician availability are not included; PriceLock amounts are entered as itemized proposals by the assigned technician after inspection. Active database-backed service guides include nearby discovery on their detail pages: browser geolocation is requested only after a user taps the location button, with area/city/PIN search as the manual fallback. Discovery coordinates are sent in a no-store JSON request body, not a URL query string. The map is an explicitly labeled local schematic using only coarse technician-entered service-area centers; no street tiles, geocoder, live technician location, ETA, availability or appointment is inferred. Booking addresses and optional device coordinates stay private; every exact-location response is access-audited, and the assigned technician receives it only after accepting. Visit status/ETA updates are manual; live location sharing is unavailable and no background tracking occurs. The map-provider contract is replaceable, but no external SDK or provider is configured: future tiles require a selected provider adapter, origin-restricted public key, approved style/tile URLs, required attribution, and privacy/data-processing review; no map-provider environment variable is read today.

## Technology stack

- **Frontend:** Next.js App Router, React, strict TypeScript, Tailwind CSS, Motion for React, Lucide React
- **Backend:** Python, FastAPI, Pydantic Settings, SQLAlchemy 2.x, Alembic
- **Testing and quality:** ESLint, Prettier, Pytest, and Playwright for frontend browser checks
- **Database target:** PostgreSQL / Neon; temporary SQLite is used for backend isolation tests

## Repository structure

```text
fixnear/
├── .env.example
├── .gitignore
├── README.md
├── frontend/             # Next.js application; install and run independently
├── backend/              # FastAPI application; install and run independently
├── database/seeds/       # Reserved for approved, non-sensitive seed data
└── docs/                 # Product and engineering documentation
```

The frontend and backend are intentionally separate packages. Install frontend dependencies from `frontend/` and Python dependencies from `backend/`; there is no root-level JavaScript workspace.

## Requirements

- Node.js 22 (or a supported newer LTS release) and npm
- Python 3.10 or newer
- Git

## Environment setup

From the repository root, create a local environment file:

```sh
cp .env.example .env
```

The example values are placeholders. Health checks and offline tests do not require credentials; live account endpoints require a configured `DATABASE_URL` and Supabase JWKS URL/issuer. For Next.js local development, copy `frontend/.env.example` to `frontend/.env.local` so the server-only API proxy target is loaded by Next.js. Set `FIXNEAR_API_BASE_URL` to the FastAPI origin; in production it must be HTTPS. `.env` files are ignored by Git; keep real credentials out of tracked files and chat. Neon/Supabase provisioning and credential setup have not been attempted.

## Run the frontend

```sh
cd frontend
npm ci
npm run dev
```

The development server binds to `0.0.0.0` for preview compatibility. On the same Android phone, open `http://localhost:3000` in the browser.

Useful frontend checks:

```sh
npm run lint
npm run typecheck
npm run build
npm run test:api
npm run test:e2e
```

The Next.js server exposes `GET /api/auth/session`, `POST /api/auth/logout`, and a same-origin `/api/backend/v1/*` BFF proxy. Set server-only `FIXNEAR_API_BASE_URL` in `frontend/.env.local`; the proxy limits request size, permits only the versioned API paths and JSON mutations, enforces same-origin double-submit CSRF checks, forwards only the access token from its `HttpOnly` cookie, validates and forwards UUID `Idempotency-Key` headers, and does not pass backend `Set-Cookie` headers to the browser. The proxy never accepts a browser-supplied bearer token. The session endpoint returns only a minimal user record plus a CSRF token and refreshes expired sessions server-side; logout requires the exact configured origin and matching `X-CSRF-Token`. A password-login BFF and `/login` page issue secure cookies to verified existing accounts. Signup and email verification use provider email codes; recovery uses an email code and server-side Supabase verification and password update. Link callbacks are not implemented. Customer `/bookings*`, technician `/technician/bookings*`, `/technician/manage`, and admin screens call the authenticated API and show unauthorized/unavailable states until a valid account session and server-managed role are provisioned. `npm run test:api` covers the mocked auth handlers and API proxy; tests make no live database or identity-provider calls.

Before enabling real registration or sign-in, the missing BFF flows must be implemented and all flows configured and tested against a controlled Supabase project: trusted site/redirect URLs, email delivery (SMTP), confirmation and OTP policies/templates, and password-recovery redirect behavior must agree with `FRONTEND_URL`. Live session validation also requires server-only `SUPABASE_URL` and `SUPABASE_ANON_KEY`; backend role provisioning and protected account routes additionally require Neon/PostgreSQL `DATABASE_URL`, migrations, and the matching Supabase JWKS URL/issuer/audience. None of these live integrations or real account flows have been run.

Playwright browser tests need a supported browser binary. On a compatible Linux environment, install it once with `npx playwright install chromium`. Termux/Android may not support Playwright's managed desktop browser; use the live preview in the Android browser and run the automated browser suite in a compatible remote environment when available.

## Run the backend

In a second Termux session (or after stopping the frontend server):

```sh
cd backend
python -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --no-access-log --no-proxy-headers
```

Health endpoints:

- `http://localhost:8000/health`
- `http://localhost:8000/api/v1/health`

Account and authorization routes (require a Supabase bearer token and configured database):

- `POST /api/v1/auth/provision/customer` and `POST /api/v1/auth/provision/technician` — provision the fixed customer or technician role from a `display_name`; clients cannot set roles or account status.
- `GET /api/v1/auth/me`, `GET /api/v1/account/customer/profile`, and `GET /api/v1/account/technician/profile` — read the current account or role-protected profile.
- `GET /api/v1/services`, `/api/v1/services/categories`, and `/api/v1/services/{slug}` — public active-only guide and category reads, with category/search filters.
- `POST /api/v1/services/{slug}/nearby-technicians/search` and `GET /api/v1/technicians/{technician_id}/services/{service_slug}` — public service-area discovery and eligible public profile reads. Searches accept either manual area fields (`area`, `city`, `state`, `postal_code`) or a user-provided coordinate pair (`latitude`, `longitude`) with an optional radius; search input is sent in a JSON body rather than a URL, only technician-entered approximate service-area centers are returned, and distance sorting/filtering is used only when those centers exist.
- `PUT /api/v1/technician/bookings/{booking_id}/visit` and `PUT /api/v1/admin/bookings/{booking_id}/visit` — assignment-scoped manual visit status/ETA updates. Live tracking is unavailable; no coordinates or simulated movement are provided.
- `/api/v1/admin/service-catalog/*` — admin-only category/service create, edit, list, and soft-deactivate operations.
- `/api/v1/technician/*` — owner-scoped private profile, self-reported skills, coverage areas, weekly availability preferences, onboarding, and verification submission.
- `/api/v1/customer/addresses*` and `/api/v1/customer/bookings*` — customer-owned private addresses and booking create/list/detail, cancellation before work starts, and approval/rejection of the current PriceLock quote.
- `/api/v1/technician/bookings*` — assigned booking list/detail, accept/decline, inspection/work/completion transitions, and itemized quote creation/revisions.
- `/api/v1/admin/bookings*` — filtered list/detail, eligible-technician lookup, validated assignment/reassignment, cancellation, escalation/resolution, quote oversight, and ordered audit history.
- `/api/v1/customer/homepassport*` — appliance CRUD/archive/safe delete, verified-or-customer-reported service history, replaced parts, warranty create/list/detail/update, claims with customer respond flow, document metadata with storage-gated upload intents, and reminders with duplicate prevention.
- `/api/v1/admin/homepassport*` — claim review queue and transitions with audited notes, evidence listing, warranty verification oversight, audited service-history corrections, and the HomePassport audit trail.
- `/api/v1/admin/technicians/*` — admin-only private review queue, dossier, and explicit approve/reject decisions.
- `GET /api/v1/admin/users/{user_id}`, `PUT`/`DELETE /api/v1/admin/users/{user_id}/roles/{role_code}`, and `PATCH /api/v1/admin/users/{user_id}/status` — admin-only account management. Mutations are audited, and the last active admin cannot be removed or disabled.
- `/api/v1/customer/reviews*` — eligible-booking listing, idempotent review submission for completed jobs with an assigned technician, list/edit your reviews (30-day edit window), and review reporting.
- `/api/v1/technician/reviews*` — received published reviews and an aggregate rating summary.
- `/api/v1/admin/reviews*` — list published/hidden reviews, hide/restore with a mandatory audited reason, and a report queue with reviewed/dismissed resolution. Review content is never rewritten by moderation.
- `/api/v1/customer/support/tickets*` — categorised support tickets with owner-only visibility, customer replies, and status timeline. Internal staff notes are never exposed.
- `/api/v1/admin/support/tickets*` — filtered queue (status, priority, escalation, search), ticket detail with customer display, staff assignment from the active admin roster (`GET /api/v1/admin/support/assignees`), staff replies, private internal notes, audited status transitions, and escalation with reason.
- `/api/v1/admin/overview` — database-computed platform metrics and trends for 7/30/90-day windows (booking trend, status distribution, category popularity, technician performance, satisfaction trend, recent audited activity).
- `/api/v1/admin/customers*` — searchable, paginated customer directory with booking/review/ticket/warranty footprint, and suspend/reactivate with a mandatory audited reason. Self-suspension is rejected.
- `/api/v1/admin/audit` — unified, append-only audit view across user, booking, technician, warranty, review and support modules, filterable by date range, action and entity type.

Migration `0002_service_catalog_and_technician_management` seeds the six existing service guides without prices. It adds private technician skill, coverage, availability-preference, and verification-review tables; availability is a preference, not a live appointment schedule. Migration `0003_service_catalog_audit` adds append-only metadata for admin catalog changes, including the actor, affected record, action and changed field names. Migration `0004_booking_pricelock` adds saved-address snapshots, customer bookings, ordered booking events, assignment history, itemized immutable quote versions and line items, attachment metadata/upload intents, and mutation-idempotency records. It uses no catalog or fabricated price, enforces customer approval for each current quote version before paid repair work can start, and does not configure live file storage or payment processing. Migration revision `0005_location_visits` (`0005_location_discovery_visits.py`) adds optional coordinates to private saved-address and booking snapshots; optional approximate, technician-entered service-area centers; booking-scoped visit status/ETA records; and an append-only audit table for exact booking-location reads. It does not seed coordinates or real addresses. Migration revision `0006_homepassport` (`0006_homepassport.py`) adds HomePassport appliances, verified/customer-reported service history, replaced parts, warranty records and server-computed claim state, warranty claims with append-only claim history, maintenance reminders, document metadata (storage provider/key are never exposed to clients), HomePassport audit events, and the optional appliance link on bookings. It seeds no customer data and performs no manual schema changes; verify its Alembic upgrade/downgrade path before applying it to a provisioned database. Review its Alembic upgrade/downgrade path before applying it to a provisioned database. Migration revision `0007_operations` (`0007_operations.py`) adds reviews, review reports, support tickets with customer/staff messages, private internal notes and append-only ticket events, and the unified operations audit log, with indexes on the hot query paths; it seeds no customer data. Verification is never granted at registration, and only an authorized admin may record a review decision or assign an eligible technician. Configure `DATABASE_URL`, `SUPABASE_JWKS_URL`, and `SUPABASE_JWT_ISSUER` in the local `.env` before using protected routes. Apply the schema with `cd backend && python -m alembic upgrade head` once PostgreSQL is configured. SQLite tests exercise migration upgrade/downgrade, and a PostgreSQL SQL compilation check does not contact Neon or Supabase. The API runs without an eager database connection for health checks, but catalog and account-route execution need a reachable database.

Run the backend tests from `backend/`:

```sh
python -m pytest
```

### Security boundary and future Next.js BFF requirements

The FastAPI API continues to use bearer authentication. The Next.js BFF has session/logout handlers and a constrained `/api/backend/v1/*` proxy, with an existing-account password-login endpoint and UI, with email-code signup and verification, but no provider link callback. An email-OTP password-recovery flow is available. Existing Supabase access/refresh tokens are stored in `HttpOnly` cookies, never returned in session JSON. Production uses `Secure` `__Host-` cookies with `Path=/`, no `Domain`, and `SameSite=Strict`; local development omits `Secure` to work over localhost HTTP. `GET /api/auth/session` returns a minimal user plus a CSRF token and refreshes an expired session server-side. `POST /api/auth/logout` requires the exact `FRONTEND_URL` origin and matching `X-CSRF-Token`, then clears local cookies even if provider logout is unavailable. The backend proxy accepts only the access token from its `HttpOnly` cookie, applies same-origin double-submit CSRF checks to mutations, and caps JSON request bodies. `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `FIXNEAR_API_BASE_URL` are server-only settings; no service-role key is used.

The backend CORS middleware allows configured frontend origins, defaults to `FRONTEND_URL`, and does not enable credentialed requests; CORS is not an authorization or CSRF defense. JWKS sets are cached for 300 seconds by default; unknown signing-key IDs trigger PyJWT's refresh behavior subject to the library's cooldown. The API error handler logs only a fixed message and exception class; the Uvicorn error logger is configured to omit tracebacks, and the local command disables access logs so query strings are not written by default.

Never place bearer tokens, passwords, OTPs, or session secrets in URLs, query strings, browser storage, or logs. Prefer same-origin BFF requests; if credentialed cross-origin requests are ever required, allow only exact trusted origins and narrow methods/headers—never combine credentials with wildcard origins. Keep equivalent redaction enabled for any alternate ASGI server or reverse proxy: its access/error logs are outside the API's own logging filters.

## Android-first workflow

Termux is the command-line environment; use its home directory for the checkout rather than shared Android storage, which can cause file-permission and symlink issues with Node packages. A basic Termux install is:

```sh
pkg update
pkg install git nodejs-lts python python-pip
```

Then clone the GitHub repository into `$HOME` when the branch you are working on is available on the remote. Use the GitHub app or mobile browser to review repository pages; use Git in Termux for local status, tests, commits, and pushes.

The frontend can run locally on Android. Some Python dependencies use native extensions and may not publish Android/Termux wheels; if installation fails, keep editing in Termux and run backend setup/tests in a browser-based Codespace when included usage is available, or another remote Python environment. No paid desktop software is required.

### Technician operational authorization

Technician profile and verification endpoints remain available to authenticated technicians for onboarding. Booking and technician-review APIs additionally require a currently approved technician profile, checked against the database on every request. Pending, rejected, unsubmitted, or missing profiles receive 403; later loss of approval takes effect on subsequent requests. Existing administrative review remains the only approval path. This does not implement signup or complete Phase 12 authentication; the missing flows described above remain release blockers.

### Reverse-proxy and rate-limit deployment requirements

Production Next.js requires `FIXNEAR_ALLOWED_HOSTS` at build and server startup: comma-separated exact public hosts, optionally including non-default ports (for example `fixnear.example,fixnear.example:8443`). Wildcards and malformed entries are rejected. Requests to unexpected authorities are rejected across routes. Development may leave the list empty. `FRONTEND_URL` remains required for logout origin checks.

The BFF ignores forwarded host and protocol by default. Enable `FIXNEAR_TRUST_PROXY_HEADERS=true` only behind an isolated trusted ingress that blocks direct access to Next.js and **overwrites**, never appends, both forwarding headers. Multi-valued headers are rejected. Next.js cannot authenticate a peer from route headers; a direct connection in trusted mode could spoof them, so network isolation is mandatory.

The API applies an independent global network-IP bucket before the existing bearer-token and endpoint buckets. Tokens are hashed but are not authenticated at this middleware stage; the independent network limit prevents token rotation bypassing that ceiling. Trusted proxy IP/CIDR entries must be narrow, validated, and controlled. Forwarded-for chains are walked right-to-left until the first untrusted address; other forwarding headers are ignored. Configure Uvicorn with `--no-proxy-headers` and ensure every upstream hop is correctly configured, or the real ASGI peer may be rewritten before the limiter sees it. Shared NATs may share limits; tune network limits for legitimate traffic.

Development defaults to process-local counters. Production requires enabled limiting and a valid `RATE_LIMIT_REDIS_URL`; startup verifies the Redis connection and fails if missing, invalid, or unavailable. Redis is a declared dependency. Runtime failures return 503, never silently fall back. Use a secured shared Redis with appropriate network access, secret handling, availability, and TLS (`rediss://`) as appropriate. No live Redis was used in local tests.

The Next.js production CSP retains `unsafe-inline` for scripts and styles. App Router emits inline hydration/flight scripts and the application uses inline styles; per-request nonces require dynamic rendering, compatible caching/asset handling and browser verification across routes. A future nonce-based policy should be rolled out with those checks; the current policy is not a complete XSS mitigation.

### Password-login implementation and remaining authentication gaps

`/login` uses the existing CSRF session bootstrap, then POSTs credentials to the server-only Supabase password-grant endpoint. The browser receives only a minimal user record and existing HttpOnly cookies; the server rejects missing email confirmation and never returns provider errors or tokens. An anonymous backend `/api/v1/auth/attempt` gate rate-limits requests before the provider call and fails closed if the gate is unavailable. The gate keys on the BFF's network peer, so all users behind a BFF may share a limit and the system needs a separate trusted-edge per-client rate limit and appropriate scaling. It never accepts browser-supplied forwarded IP headers. Configure `RATE_LIMIT_AUTH_LIMIT` and `RATE_LIMIT_AUTH_WINDOW_SECONDS`; existing production Redis and proxy requirements remain mandatory.

Email-code signup and verification are implemented with local mocks; technician application data still requires the existing post-verification onboarding workflow and no provider link callback exists. No claim of full authentication is made. A login can only navigate to an existing backend-provisioned account, and a failed account lookup leaves a signed-in provider session that the existing logout can clear. The provider must require email confirmation, and its existing email-confirmed field must be present. No live Supabase test was performed.

### Email-OTP password recovery

The `/forgot-password` and `/reset-password` pages use the server-only Supabase Auth `/recover`, `/verify` with type `recovery`, and `/user` password-update endpoints. Configure Supabase's recovery email template to display `{{ .Token }}` as a 6–8 digit code; this flow intentionally does not consume confirmation links or tokens in URLs. Configure the provider's OTP expiry and email delivery, and test the configured template in a controlled environment before enabling it. No callback URL is required for this code-entry flow. Never include credentials, OTPs or passwords in reverse-proxy request-body logs. The BFF returns the same message for provider 2xx and 4xx recovery requests and uses the existing shared, fail-closed rate gate. Production requires a separate trusted-edge per-client rate limit: Next.js cannot authenticate the peer itself. On a successful reset, browser auth cookies are cleared and the recovery session is signed out best-effort; revocation of other sessions depends on provider policy. Tests mock the provider; no live email or Supabase interaction has been performed. Signup verification and other requested Phase 12 features remain unimplemented.

### Signup and verification using email codes

`/signup` and `/signup/technician` use a server-side Supabase `/signup` request. Configure Supabase to require confirmed emails and edit the signup email template to display `{{ .Token }}` as a 6–8 digit code. `/verify-email` verifies that code with `/verify` type `signup`, then uses the verified bearer token against the backend's fixed customer or technician provisioning endpoint. The browser cannot request an admin role. Duplicate provider responses are normalized. A provider-verified session is stored in HttpOnly cookies; if backend provisioning fails, retry profile setup on the verification page. If the browser is closed, sign in again and choose “Verify email or finish account setup”; provisioning is idempotent. Signup and confirmation are separate non-atomic operations.

The application uses OTP entry, not a provider redirect callback; link callbacks are not implemented and must not be substituted without a separate secure PKCE/state design. Technician signup creates a `not_submitted` profile rather than `pending_review`; applicants must fill out services, area and experience using `/technician/manage` and submit for review. Only then does it enter `pending_review`; approval remains server-controlled. No documents are collected. These limitations mean Phase 12 is not complete. Supabase configuration, delivery and browser flows have not been externally verified.

### Technician application during signup

The technician signup form collects a phone number in E.164 form, selected active services, professional description and years, and area/city/state/Indian six-digit PIN. After email-code verification, it submits those fields to the verified-identity-only `POST /api/v1/auth/provision/technician-application` endpoint. The backend validates them, uses the existing technician profile, skills and coverage records, then submits a complete application as `pending_review`; restricted work remains blocked until approval. The phone column is introduced by migration `0008_technician_phone`. Profile information in `sessionStorage` is a temporary retry aid, not an authentication token. If the browser tab or its storage is lost before submission, complete the existing `/technician/manage` onboarding manually. A retry for an already-pending application does not overwrite it.

The existing signup email-code workflow does **not** initiate PKCE and has no provider link callback. PKCE callback initiation, state binding, replay protection and tests are still unimplemented. Do not configure verification links as though they were supported; use the documented email OTP template. This phase does not establish live provider compatibility or complete Phase 12.

### Optional interactive service-area map

Set a public, domain-restricted `NEXT_PUBLIC_MAPTILER_KEY` for both frontend build and runtime to enable an optional Leaflet/MapTiler tile adapter. Never use a private server key. Map tiles load only after the visitor selects map view and explicitly chooses to load them; MapTiler receives the visitor IP and the approximate map viewport. Without a valid-format key the app uses a labelled schematic fallback. Provider availability, credentials, terms and domain restrictions must be verified separately. Markers are rounded technician-entered coverage centers, not live positions or verified coverage boundaries; no technician location tracking or live availability is provided.

### Notification delivery (Phase 15 partially complete)

See [notification architecture and event coverage](NOTIFICATION_ARCHITECTURE.md). The optional manual queue worker uses the existing database configuration and deterministic local simulation only; no external notification delivery is enabled.
