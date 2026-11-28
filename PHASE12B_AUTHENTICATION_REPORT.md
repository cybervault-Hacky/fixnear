# Phase 12B authentication — incomplete

## Verified audit checklist

- [x] Supabase integration exists in server-only Next.js session/refresh/logout code; backend independently validates JWT signature and required claims.
- [x] Backend `/auth/me` and authorization use database roles and active status, not client role metadata.
- [x] Fixed-role backend self-provisioning exists for already authenticated users; technician profiles begin `not_submitted` and require onboarding before `pending_review`.
- [x] Existing admin-only technician review records decisions and reasons and blocks self-review; existing approval guard protects technician bookings and reviews.
- [x] Existing session cookies are HttpOnly, Secure in production, SameSite=Strict; existing logout validates Origin and CSRF and attempts provider sign-out.
- [x] This phase adds `/login` and a mocked-tested BFF password grant for verified, existing provider accounts.
- [ ] Customer and technician signup; new profile provisioning from registration; pending-on-registration onboarding.
- [ ] Email verification, resend, OTP, callback, forgot-password and reset routes and pages.
- [ ] Browser-level authentication tests and live integration validation.

## Features genuinely implemented

Existing-account password login sends credentials only to the server and then Supabase's password-grant endpoint. The server requires a confirmed-email field in the provider response, produces the existing HttpOnly session cookies, and does not return provider tokens or error bodies. Bad credentials and unconfirmed email return the same generic response. The form provides input labels, visibility toggle, busy/error states and role navigation based on backend `/auth/me` rather than provider metadata. It does not provision an account; a successful provider login with no backend account displays an error.

The new anonymous backend `/api/v1/auth/attempt` endpoint is used by the login BFF as a fail-closed abuse gate. It has a configurable `RATE_LIMIT_AUTH_LIMIT` and `RATE_LIMIT_AUTH_WINDOW_SECONDS` and uses the existing shared rate-limit store. Rate limiting keys the network identity of the BFF as seen by the backend; it **does not provide individual browser IP limits**. Users behind a BFF may share a bucket. Production ingress must independently rate-limit clients and restrict exposure. A 429 passes Retry-After to the login response. Backend/store outage fails closed with 503. Origin and CSRF validation occur before the provider request. The pre-existing approval guard is unchanged.

## Phase 12B files

Created: `frontend/app/login/page.tsx`, `frontend/app/api/auth/login/route.ts`, `frontend/tests/login-api.test.mjs`, `PHASE12B_AUTHENTICATION_REPORT.md`.

Modified: `frontend/lib/server/auth.ts`, `backend/app/api/v1/accounts.py`, `backend/app/core/config.py`, `backend/app/core/rate_limit.py`, `backend/tests/test_rate_limiting.py`, `README.md`, `.env.example`. No files deleted in this phase. Git status below also contains prior-phase changes.

## Database changes

None. Existing roles, profiles and approval status are unchanged.

## Local mock coverage

Four login tests use deterministic fetch mocks: provider and gate calls, normalized email, secure cookies and no response token leakage; CSRF, Origin and input-role rejection; rate-limit and outage fail-closed behavior; and uniform invalid-credential/unconfirmed-email errors. Backend test covers gate 429 and storage failure. Existing suites cover backend approval, authz, JWT, session, logout, CSRF and Phase 11 controls; they do not test missing features.

## External configuration and limitations

Existing Supabase URL and anon key, email confirmation policy, FastAPI base URL, backend JWKS/issuer/audience, and provisioned backend identity/role are required. Production must configure the existing Redis, trusted proxy and allowed-host protections plus a trusted-edge per-client auth rate limit. No live Supabase, Neon, Redis, email or SMS service was contacted, and provider behavior was tested only with local mocks. Dependency installation contacted the permitted npm and Python package registries.

No signup, technician registration, verification/OTP, resend, callback, password recovery or reset was added. The requested complete flow and corresponding form/browser tests are missing. Supabase response compatibility, delivery, infrastructure and real accounts remain unverified. Phase 12 is **not complete** and production readiness is not claimed.

## Checks

- Backend: 178 pytest tests passed; one Starlette/httpx deprecation warning. Ruff and Python compilation passed. Alembic has one head (`0007_operations`), and offline upgrade/downgrade SQL generation passed; SQLite migration checks run in pytest.
- Frontend: 49 API/security tests passed; ESLint, TypeScript, Prettier and production build passed with synthetic `FIXNEAR_ALLOWED_HOSTS=fixnear.example,localhost:3000`.
- Playwright was not run: the configured Chromium executable was not installed. No browser pass is claimed.

## Branch and HEAD

Branch `arena/e2b50fbe-fixnear`  
HEAD `ed3f11e7d3545787fa6c158e29ad99187e1d255e`

## Full Git status

No staged changes. Complete `git status --short -uall`:

```text
 M .env.example
 M README.md
 M backend/app/api/v1/__init__.py
 M backend/app/api/v1/accounts.py
 M backend/app/api/v1/admin_technicians.py
 M backend/app/api/v1/admin_users.py
 M backend/app/api/v1/bookings.py
 M backend/app/auth/authorization.py
 M backend/app/core/config.py
 M backend/app/main.py
 M backend/app/models/__init__.py
 M backend/app/models/booking_management.py
 M backend/app/models/user_management.py
 M backend/app/schemas/accounts.py
 M backend/app/schemas/booking_management.py
 M backend/app/schemas/technician_management.py
 M backend/app/services/admin_user_management.py
 M backend/app/services/booking_management.py
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
 M frontend/features/technician/components/TechnicianDashboardShell.tsx
 M frontend/lib/server/auth.ts
 M frontend/next.config.ts
 M frontend/tests/backend-api.test.mjs
?? PHASE11_SECURITY_FOLLOWUP_REPORT.md
?? PHASE12B_AUTHENTICATION_REPORT.md
?? PHASE12_AUTHENTICATION_REPORT.md
?? backend/app/api/v1/admin_operations.py
?? backend/app/api/v1/homepassport.py
?? backend/app/api/v1/reviews.py
?? backend/app/api/v1/support.py
?? backend/app/core/rate_limit.py
?? backend/app/core/rate_limit_middleware.py
?? backend/app/core/security_headers.py
?? backend/app/models/homepassport.py
?? backend/app/models/operations.py
?? backend/app/schemas/homepassport.py
?? backend/app/schemas/operations.py
?? backend/app/services/admin_audit.py
?? backend/app/services/admin_customers.py
?? backend/app/services/admin_dashboard.py
?? backend/app/services/document_storage.py
?? backend/app/services/homepassport.py
?? backend/app/services/operations_audit.py
?? backend/app/services/reviews.py
?? backend/app/services/support.py
?? backend/migrations/versions/0006_homepassport.py
?? backend/migrations/versions/0007_operations.py
?? backend/tests/conftest.py
?? backend/tests/test_audit_probe.py
?? backend/tests/test_homepassport.py
?? backend/tests/test_operations.py
?? backend/tests/test_privileged_mutation_reasons.py
?? backend/tests/test_rate_limiting.py
?? backend/tests/test_security_headers_and_cors.py
?? backend/tests/test_technician_approval_access.py
?? frontend/app/admin/audit/page.tsx
?? frontend/app/admin/customers/page.tsx
?? frontend/app/admin/homepassport/page.tsx
?? frontend/app/admin/page.tsx
?? frontend/app/admin/reviews/page.tsx
?? frontend/app/admin/support/page.tsx
?? frontend/app/api/auth/login/route.ts
?? frontend/app/dashboard/claims/page.tsx
?? frontend/app/dashboard/documents/page.tsx
?? frontend/app/dashboard/homepassport/[applianceId]/page.tsx
?? frontend/app/dashboard/reviews/page.tsx
?? frontend/app/dashboard/support/page.tsx
?? frontend/app/dashboard/warranties/[warrantyId]/page.tsx
?? frontend/app/login/page.tsx
?? frontend/app/technician/reviews/page.tsx
?? frontend/features/admin/components/AdminAuditPage.tsx
?? frontend/features/admin/components/AdminCustomersPage.tsx
?? frontend/features/admin/components/AdminOverviewPage.tsx
?? frontend/features/admin/components/AdminReviewsPage.tsx
?? frontend/features/admin/components/AdminShell.tsx
?? frontend/features/admin/components/admin-errors.ts
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
?? frontend/tests/request-origin.test.mjs
?? frontend/tests/security-headers.test.mjs
```

Nothing was staged, committed, pushed, or deployed. Existing working-tree changes were preserved and no branch was switched.
