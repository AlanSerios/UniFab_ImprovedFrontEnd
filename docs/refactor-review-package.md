# Refactor Review Package

This package summarizes the route-by-route modernization sweep so reviewers can inspect it in small, behavior-preserving chunks.

## Review Goal

Review structural refactors that slim oversized route/controller/page files, remove repeated response and display logic, and move workflow-specific behavior into helper modules.

This sweep is intended to preserve:

- Public routes and HTTP methods.
- Request and response payload shapes.
- Auth cookie names and token behavior.
- Database schema and migrations.
- Frontend route paths, labels, and core user flows.
- Admin guard, verified-user, quote, cart, request draft, and Print Ready rules.

## Validation Run

Completed checks:

- `cd frontend && npm.cmd run lint`
- `cd frontend && npm.cmd run build`
- Backend syntax sweep: `node --check` over `backend/src/**/*.js`
- `git diff --check`
- Conflict marker scan for `<<<<<<<`, `=======`, and `>>>>>>>`

Known validation note:

- Vite still reports the existing large chunk warning after frontend builds. No build errors were reported.
- `git diff --check` reported only CRLF normalization warnings.

## Suggested Review Chunks

### 1. Baseline Docs

Files:

- `docs/refactor-parity-checklist.md`
- `docs/refactor-review-package.md`

Current behavior:

- Documents the review/parity strategy only.

Structural improvement:

- Adds route-by-route preservation checks and review guidance before and after implementation.

Validation:

- Docs-only review. Confirm no runtime behavior is implied by these files.

### 2. Auth

Key files:

- `backend/src/controllers/auth.controller.js`
- `backend/src/middlewares/auth.middleware.js`
- `backend/src/utils/auth-response.util.js`

Current behavior:

- Registration, login, logout, email verification, refresh, password reset, and JWT middleware behavior remain stable.

Structural improvement:

- Centralizes safe user response mapping, auth cookie options, token hashing, and frontend auth URL construction.

Validation:

- Review response shapes and cookie option call sites.
- Backend syntax check passed.

### 3. Quote And Cart Backend

Key files:

- `backend/src/controllers/quote.controller.js`
- `backend/src/services/cart.service.js`
- `backend/src/utils/quote-response.util.js`
- `backend/src/utils/quote-readiness-response.util.js`
- `backend/src/utils/cart-response.util.js`
- `backend/src/utils/managed-file-response.util.js`

Current behavior:

- Quote calculation responses, quote readiness diagnostics, managed file URLs, and cart item response fields remain stable.

Structural improvement:

- Moves repeated quote/cart response shaping and file URL normalization out of controllers/services.

Validation:

- Review quote response fields, cart response fields, and readiness response fields against existing callers.
- Backend syntax check passed.

### 4. Print Request Backend

Key files:

- `backend/src/controllers/print-request.controller.js`
- `backend/src/routes/print-request.routes.js`
- `backend/src/services/print-request.service.js`
- `backend/src/services/request-draft-workflow.service.js`
- `backend/src/utils/print-request-submission.util.js`
- `backend/src/utils/payment-slip.util.js`
- `backend/src/utils/print-request-status.util.js`
- `backend/src/utils/print-request-response.util.js`

Current behavior:

- Request drafts, submission, Terms acceptance, quote snapshot promotion, payment slip generation, status transitions, cancellation, and correction behavior remain stable.

Structural improvement:

- Extracts request draft workflow, submission payload shaping, payment slip generation, status lifecycle decisions, and response shaping from the oversized service/controller.

Validation:

- Review draft token preview/submit flow, payment slip fields, status transition guards, and response shapes.
- Backend syntax check passed.

### 5. Design Library And MMF Backend

Key files:

- `backend/src/controllers/designs.controller.js`
- `backend/src/services/local-design-assets.service.js`
- `backend/src/services/local-design-asset-intent.service.js`
- `backend/src/services/design-moderation-workflow.service.js`
- `backend/src/services/mmf-design-override-workflow.service.js`
- `backend/src/utils/design-library-response.util.js`

Current behavior:

- Local design upload/assets, asset intents, moderation workflow, curation fields, Print Ready status, MMF override/detail behavior, and cached-file mapping remain stable.

Structural improvement:

- Moves asset workflow, moderation workflow, MMF override workflow, and response/asset URL shaping out of the large controller.

Validation:

- Review local design create/update asset handling, moderation recheck/override flows, and MMF Print Ready mapping.
- Backend syntax check passed.

### 6. Admin Backend, Maintenance, Health

Key files:

- `backend/src/controllers/admin.controller.js`
- `backend/src/controllers/admin-file-registry.controller.js`
- `backend/src/controllers/healthcheck.controller.js`
- `backend/src/services/healthcheck.service.js`
- `backend/src/utils/admin-response.util.js`
- `backend/src/utils/admin-maintenance-request.util.js`

Current behavior:

- Admin dashboard, maintenance request parsing, file registry responses, and healthcheck response shapes remain stable.

Structural improvement:

- Moves response shaping, maintenance query/body parsing, and health aggregation out of controllers.

Validation:

- Review admin response envelopes and maintenance cleanup payload parsing.
- Backend syntax check passed.

### 7. Frontend Client Workflow Pages

Key pages:

- `frontend/src/pages/UploadQuote.jsx`
- `frontend/src/pages/QuoteReview.jsx`
- `frontend/src/pages/Cart.jsx`
- `frontend/src/pages/PrintRequestSubmission.jsx`
- `frontend/src/pages/PrintRequestDetail.jsx`
- `frontend/src/pages/PrintRequests.jsx`

Key helpers:

- `frontend/src/utils/upload-quote.js`
- `frontend/src/utils/quote-review.js`
- `frontend/src/utils/cart.js`
- `frontend/src/utils/print-request-submission.js`
- `frontend/src/utils/print-request-detail.js`
- `frontend/src/utils/print-requests.js`
- `frontend/src/utils/display-format.js`

Current behavior:

- Quote upload/review, cart checkout, request draft creation, request submission, request detail, and request list behavior remain stable.

Structural improvement:

- Extracts preview-source shaping, API envelope fallback handling, draft/quote/request extraction, money/date/metric formatting, item display fallbacks, expiry checks, and route construction.

Validation:

- Frontend lint/build passed.
- Review especially login redirect state, draft token navigation, quote expiry handling, cart requote URLs, and request status display.

### 8. Frontend Design Library And Admin Pages

Key pages:

- `frontend/src/pages/DesignLibrary.jsx`
- `frontend/src/pages/LocalDesignDetail.jsx`
- `frontend/src/pages/MmfDesignDetail.jsx`
- `frontend/src/pages/MyDesignForm.jsx`
- `frontend/src/pages/MyDesigns.jsx`
- `frontend/src/pages/SavedDesigns.jsx`
- `frontend/src/pages/admin/AdminCommunityDesignDetail.jsx`
- `frontend/src/pages/admin/AdminLocalDesignForm.jsx`
- `frontend/src/pages/admin/AdminMaintenance.jsx`
- `frontend/src/pages/admin/AdminMmfOverrides.jsx`
- `frontend/src/pages/admin/AdminPrintRequestDetail.jsx`

Key helpers:

- `frontend/src/utils/design-library.js`
- `frontend/src/utils/local-design-detail.js`
- `frontend/src/utils/mmf-design-detail.js`
- `frontend/src/utils/my-design-form.js`
- `frontend/src/utils/my-designs.js`
- `frontend/src/utils/saved-designs.js`
- `frontend/src/utils/admin-community-design-detail.js`
- `frontend/src/utils/admin-local-design-form.js`
- `frontend/src/utils/admin-maintenance.js`
- `frontend/src/utils/admin-mmf-overrides.js`
- `frontend/src/utils/admin-print-request-detail.js`

Current behavior:

- Public library browsing, local/MMF detail pages, My Designs, saved bookmarks, admin local design editing, admin moderation detail, maintenance, MMF overrides, and admin print request detail behavior remain stable.

Structural improvement:

- Extracts page-specific constants, query parsing, asset URL helpers, payload builders, response unwrapping, form defaults, curation/moderation payloads, and display fallbacks.

Validation:

- Frontend lint/build passed.
- Review Design Library tab/filter persistence, saved MMF localStorage behavior, local design edit FormData, admin moderation payloads, and admin status update payloads.

## Deferred Work

These were intentionally not included in this refactor sweep:

- Security hardening such as CSRF changes, cookie policy changes, password policy changes, rate limiting, Helmet/CSP changes, or auth architecture changes.
- Dependency upgrades or framework migrations.
- Database schema changes or migrations.
- New backend automated tests.
- Code splitting for the existing Vite large chunk warning.
- Full admin/system formatting polish for older pages that still have inline date formatting.
- Broad consolidation of every asset URL helper, because some helpers preserve route-specific slash behavior and asset-source assumptions.

## Reviewer Checklist

- Confirm no public route path or method changed unintentionally.
- Confirm no frontend route path or navigation state changed unintentionally.
- Confirm response envelopes and field names match previous callers.
- Confirm auth cookies, JWT middleware `req.user` shape, and verified/admin guard behavior remain stable.
- Confirm quote, cart, request draft, and request submission still enforce successful unexpired quotes.
- Confirm Design Library moderation and Print Ready rules are still separate.
- Confirm MMF API and cached file access remain backend-managed.
- Confirm unrelated dirty work is not reverted or mixed with a functional change.
