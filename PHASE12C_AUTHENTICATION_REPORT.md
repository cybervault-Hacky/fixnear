# Phase 12C authentication acceptance report — incomplete

## Feature status

| Feature | Status |
| --- | --- |
| Customer registration and server-assigned customer profile | Not implemented |
| Technician registration and pending-on-registration profile | Not implemented; existing authenticated provisioning starts at `not_submitted` and uses the existing onboarding/review process |
| Signup email verification, resend, callback and signup OTP | Not implemented |
| Forgot-password request and recovery OTP reset | Implemented and tested using deterministic provider mocks; not externally verified |
| Existing-account login, session refresh and logout | Pre-existing; regression tests pass with mocks; not externally verified |
| Technician approval guard | Pre-existing; backend tests pass |
| Authentication frontend | Forgot-password and reset-code pages implemented; signup, technician signup and signup verification pages not implemented |
| Browser E2E | Not run: Playwright Chromium executable unavailable |

**Phase 12 is not complete.** Signup, profile creation from signup, verification and the required end-to-end tests remain release blockers. No claim of production readiness is made.

## Work in this phase

Added a bounded JSON recovery request to the server-only Supabase `/recover` endpoint. The response is the same for provider success and 4xx errors, limiting account enumeration. Added a reset flow that exchanges a user-entered email OTP with Supabase `/verify` using type `recovery`, sends the new password to `/user`, and attempts provider logout for the temporary session. No access or refresh token is returned to browser JavaScript or stored in recovery cookies. Browser auth cookies are cleared on success. Passwords and OTPs are not placed in URLs.

Both mutations require existing Origin and CSRF checks and the fail-closed backend rate gate. That gate is shared by BFF network peer, not per-browser IP; trusted-edge per-client rate limiting remains mandatory. Expired/invalid codes return a generic error. Provider logout is best effort; other sessions and revocation depend on provider behavior. The recovery flow may consume an OTP if a later password update fails; request a new code to retry.

## Files changed in this phase

Created:
- `frontend/app/api/auth/recover/route.ts`
- `frontend/app/api/auth/reset-password/route.ts`
- `frontend/app/forgot-password/page.tsx`
- `frontend/app/reset-password/page.tsx`
- `frontend/features/auth/components/RecoveryForm.tsx`
- `frontend/tests/recovery-api.test.mjs`
- `PHASE12C_AUTHENTICATION_REPORT.md`

Modified: `frontend/lib/server/auth.ts`, `frontend/app/login/page.tsx`, `frontend/.env.example`, `README.md`. No files were deleted in this phase.

## Database migrations

None added. Existing backend provisioning and technician-review models are unchanged.

## Provider integration and external setup

Configure server-only `SUPABASE_URL` and `SUPABASE_ANON_KEY`, `FRONTEND_URL`, and `FIXNEAR_API_BASE_URL`, alongside existing backend JWKS/issuer, production Redis and host/proxy settings. Configure Supabase's recovery email template to display `{{ .Token }}` as a 6–8 digit code and set email delivery and OTP expiry. The implemented flow is code-entry only; it does not accept verification links or callback tokens in URLs. Disable request-body logging for passwords and OTPs at ingress and all intermediaries. Production needs a trusted-edge per-client rate limit. The provider endpoints, actual template configuration, delivery and session revocation have not been checked against a live Supabase project.

No real Supabase, Neon, Redis, email or SMS service was contacted. Dependency installation used the permitted npm and Python package registries.

## Test results

- Backend full pytest: **178 passed**, one Starlette/httpx deprecation warning. This includes prior JWT, approval and rate-limit tests; no new backend recovery endpoint was added.
- Backend Ruff and Python compilation passed. Alembic reports one head (`0007_operations`); offline PostgreSQL upgrade/downgrade SQL generation passed, and local SQLite migration tests passed in pytest.
- Frontend API tests: **55 passed**, including six new recovery tests for enumeration-resistant responses, OTP exchange and password update, token non-disclosure, invalid/expired code, Origin/CSRF and validation, rate gate, and temporary-session logout after update failure.
- ESLint, TypeScript, Prettier and production build passed. The build used synthetic `FIXNEAR_ALLOWED_HOSTS=fixnear.example,localhost:3000`.
- No browser form tests were executed. Playwright Chromium was not installed.

## Branch and HEAD

Branch: `arena/e2b50fbe-fixnear`  
HEAD: `ed3f11e7d3545787fa6c158e29ad99187e1d255e`

## Full Git status

No staged changes. Complete `git status --short -uall` (includes pre-existing work):

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
?? PHASE12C_AUTHENTICATION_REPORT.md
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
?? frontend/app/api/auth/recover/route.ts
?? frontend/app/api/auth/reset-password/route.ts
?? frontend/app/dashboard/claims/page.tsx
?? frontend/app/dashboard/documents/page.tsx
?? frontend/app/dashboard/homepassport/[applianceId]/page.tsx
?? frontend/app/dashboard/reviews/page.tsx
?? frontend/app/dashboard/support/page.tsx
?? frontend/app/dashboard/warranties/[warrantyId]/page.tsx
?? frontend/app/forgot-password/page.tsx
?? frontend/app/login/page.tsx
?? frontend/app/reset-password/page.tsx
?? frontend/app/technician/reviews/page.tsx
?? frontend/features/admin/components/AdminAuditPage.tsx
?? frontend/features/admin/components/AdminCustomersPage.tsx
?? frontend/features/admin/components/AdminOverviewPage.tsx
?? frontend/features/admin/components/AdminReviewsPage.tsx
?? frontend/features/admin/components/AdminShell.tsx
?? frontend/features/admin/components/admin-errors.ts
?? frontend/features/auth/components/RecoveryForm.tsx
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
?? frontend/tests/recovery-api.test.mjs
?? frontend/tests/request-origin.test.mjs
?? frontend/tests/security-headers.test.mjs
```

Nothing was staged, committed, pushed, or deployed. No branch was switched; all prior working-tree changes were preserved.
