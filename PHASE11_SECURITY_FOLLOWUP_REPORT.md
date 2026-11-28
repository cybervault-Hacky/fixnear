# Phase 11 final security follow-up

## 1. Files changed during this follow-up

Modified existing tracked or pre-existing untracked files:

- `.env.example`, `README.md`
- `backend/app/core/config.py`, `backend/app/core/rate_limit.py`, `backend/app/core/rate_limit_middleware.py`, `backend/app/main.py`, `backend/requirements.txt`, `backend/tests/test_rate_limiting.py`
- `frontend/.env.example`, `frontend/app/api/backend/[...path]/route.ts`, `frontend/next.config.ts`, `frontend/tests/backend-api.test.mjs`, `frontend/tests/request-origin.test.mjs`, `frontend/tests/security-headers.test.mjs`

Created: `frontend/host-policy.mjs`, `frontend/host-policy.d.mts`, `frontend/proxy.ts`, `frontend/tests/host-policy.test.mjs`, `PHASE11_SECURITY_FOLLOWUP_REPORT.md`. Deleted: none. The full Git status below includes all pre-existing work, not just changes made in this follow-up.

## 2. Security issues fixed

Added an independent IP network ceiling ahead of existing global and endpoint buckets; production Redis is mandatory and checked at startup; production Next.js requires an exact host allowlist and rejects unexpected hosts across routes. Forwarded origins are ignored unless explicitly trusted; multiple forwarded host/protocol values are rejected.

## 3. Rate-limit identity

Every non-health request is first charged to a network-IP bucket, regardless of token. Existing per-rule buckets still use the SHA-256 hash of the *presented*, not yet authenticated, bearer token or fall back to IP; they are not verified user-ID buckets. Token rotation cannot avoid the independent network ceiling, though it can still evade a stricter token-specific endpoint bucket until that ceiling is reached. Limits return 429 and Retry-After; store errors return 503.

## 4. Trusted proxies

Set `RATE_LIMIT_TRUSTED_PROXIES` only to controlled exact IPs/CIDRs; invalid or all-address networks fail validation. X-Forwarded-For is walked right-to-left through trusted hops; malformed chains collapse to the peer bucket. Other forwarding IP headers are ignored. Run Uvicorn with `--no-proxy-headers` so ASGI preserves the actual peer, and configure all network hops accurately.

For Next.js, enable `FIXNEAR_TRUST_PROXY_HEADERS=true` only behind an isolated ingress that blocks direct access and overwrites, never appends, both forwarded host and proto. Next.js cannot authenticate its peer from these headers. CSRF origin comparison remains in place.

## 5. Redis

Development defaults to process-local memory. Production requires `RATE_LIMIT_ENABLED=true` and a valid `RATE_LIMIT_REDIS_URL`; setup and ping failure abort startup. Redis is declared in requirements, runtime failures fail closed, increments and expiration are atomic, and the client is closed at shutdown. Mocked Redis tests do not establish production connectivity, ACL, TLS, or failover behavior.

## 6. Host allowlist

`FIXNEAR_ALLOWED_HOSTS` is mandatory at production build and startup. Use comma-separated exact public authorities, with explicit non-default ports; wildcard and malformed entries are rejected. Matching is case-normalized and includes the effective port. Development may omit the list. Keep ingress host filtering and network isolation as defense in depth.

## 7. CSP

Retained the existing policy: Next.js App Router hydration/flight scripts need inline execution and components use inline styles. Per-request nonces require dynamic rendering, caching and asset review, and actual browser verification. The current `unsafe-inline` policy is not a complete XSS defense. No wildcard script sources were introduced.

## 8. Verification

- Backend: 173 pytest tests passed; Ruff and Python compilation passed. One Starlette/httpx deprecation warning.
- Alembic: one head (`0007_operations`); offline upgrade and downgrade SQL generation passed. No live database contacted.
- Frontend: 45 API/security tests passed; ESLint, TypeScript, Prettier and production build passed. Build used synthetic `FIXNEAR_ALLOWED_HOSTS=fixnear.example,localhost:3000`.
- Local startup checks: missing production Redis and missing production host configuration each failed startup. A local Next server returned 200 for an allowed Host and 400 for an unexpected Host despite spoofed forwarding headers. The server was stopped.
- Browser E2E was not run; no claim is made that it passed.

## 9. Remaining security risks

Correct deployment isolation and proxy configuration are mandatory; Next.js cannot verify proxy peers. A shared NAT shares a network bucket, and distributed attackers can use multiple IPs; tune thresholds and add edge protections as appropriate. Bearer-based endpoint buckets still use unverified token hashes. CSP permits inline code. Local mocks do not prove Redis or infrastructure production behavior. Production readiness requires separate operational and browser validation.

## 10. Git branch and HEAD

Branch: `arena/e2b50fbe-fixnear`  
HEAD: `ed3f11e7d3545787fa6c158e29ad99187e1d255e`

## 11. Git status

No staged changes. Complete porcelain status (including individual untracked files):

```text
 M .env.example
 M README.md
 M backend/app/api/v1/__init__.py
 M backend/app/api/v1/admin_technicians.py
 M backend/app/api/v1/admin_users.py
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
 M frontend/next.config.ts
 M frontend/tests/backend-api.test.mjs
?? PHASE11_SECURITY_FOLLOWUP_REPORT.md
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
?? frontend/app/admin/audit/page.tsx
?? frontend/app/admin/customers/page.tsx
?? frontend/app/admin/homepassport/page.tsx
?? frontend/app/admin/page.tsx
?? frontend/app/admin/reviews/page.tsx
?? frontend/app/admin/support/page.tsx
?? frontend/app/dashboard/claims/page.tsx
?? frontend/app/dashboard/documents/page.tsx
?? frontend/app/dashboard/homepassport/[applianceId]/page.tsx
?? frontend/app/dashboard/reviews/page.tsx
?? frontend/app/dashboard/support/page.tsx
?? frontend/app/dashboard/warranties/[warrantyId]/page.tsx
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
?? frontend/tests/request-origin.test.mjs
?? frontend/tests/security-headers.test.mjs
```

## 12. Repository and deployment confirmation

No files were staged, committed or pushed. No branch was switched and no deployment was performed. No live Neon, Supabase, Redis, payment, email or other external service was contacted.
