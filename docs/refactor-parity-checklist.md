# Refactor Parity Checklist

This checklist is the baseline for route-by-route modernization work. Each refactor pass should preserve current behavior unless a separate migration task explicitly changes it.

## Working Tree Safety

- Start every pass with `git status --short` and review any dirty files before editing.
- Treat unrelated dirty files as user work. Do not revert, reformat, or mix them into the current pass.
- Keep each pass reviewable: one route or workflow at a time, with shared helper edits only when they directly support that route.
- Keep public URLs, request bodies, response shapes, database schema, and user-visible workflow behavior stable unless the pass is explicitly a migration.

## Known Hotspots

- `backend/src/controllers/designs.controller.js`: oversized Design Library controller combining public catalog, My Designs, admin moderation, taxonomy, MMF overrides, asset cleanup, and response normalization.
- `backend/src/models/local-design.model.js`: broad data-access module covering design CRUD, hydration, taxonomy, audit history, saved designs, search, and library sections.
- `backend/src/services/print-request.service.js`: broad workflow service covering request drafts, quote validation, file promotion, PDF slips, status transitions, email notification, admin actions, and model resolution.
- Large frontend pages: `frontend/src/pages/MyDesignForm.jsx`, `frontend/src/pages/MmfDesignDetail.jsx`, `frontend/src/pages/DesignLibrary.jsx`, and admin detail/maintenance screens carry page state, parsing, helper components, and API orchestration in single files.
- Legacy and compatibility surfaces: retired direct request submission, `/admin/local-designs` compatibility routes, legacy MMF/local-design fallback copy, and historical moderation/status values.
- Repeated preview and asset URL helpers: asset URL building, gallery normalization, file extension checks, model preview permissions, and raw storage URL handling appear across multiple pages.

## Auth Route

Current behavior to preserve:
- Users can register, verify email, log in, refresh JWTs, log out, request verification emails, request password resets, and change passwords.
- Registered accounts remain limited until email verification.
- Protected routes require authentication, and admin routes require verified admin users.
- Refresh behavior and cookie/token handling remain compatible with the current frontend API client.

Likely structural refactor targets:
- Simplify controller helper functions and repeated response handling.
- Keep validator, controller, and middleware responsibilities clearly separated.
- Normalize auth error responses without changing status codes or response shapes.

Validation checks:
- Register a user, verify email, log in, refresh session, fetch current user, log out.
- Confirm unverified users can reach verification/logout actions but cannot use verified-only flows.
- Confirm non-admin users cannot access admin routes.
- Run frontend auth pages through `npm.cmd run lint` and `npm.cmd run build` after frontend changes.

## Quotes Route

Current behavior to preserve:
- Guests can upload/configure models and view slicer-based quotes without logging in.
- Quote tokens persist through login and support quote review/recalculation.
- Quote calculation includes slicer metrics, print time, filament usage, pricing, material/color snapshots, thumbnails, and specific pre-flight warnings.
- Local Design and MMF Print Ready quote paths use backend-managed files and snapshots.
- Interactive model preview opens only through the supported snapshot-to-viewer flow.

Likely structural refactor targets:
- Extract quote response shaping, quote source resolution, snapshot metadata, and common warning/result mapping.
- Keep slicer profile selection backend-controlled.
- Keep reusable quote asset logic separate from request submission file promotion.

Validation checks:
- Upload quote, recalculate by quote token, load quote review by token.
- Quote a Print Ready UniFab-hosted design and an MMF cached file.
- Confirm unsupported files, expired quotes, unavailable materials, and missing profiles return clear errors.
- Confirm snapshots render and model preview still allows only `.stl`, `.obj`, and `.3mf`.

## Cart And Request Drafts

Current behavior to preserve:
- Guests can quote but must log in with verified email before adding to cart.
- Cart data is server-owned and tied to a verified user.
- Request drafts are short-lived checkout intents containing the exact selected quote/cart items.
- Every drafted item must have a valid, unexpired quote snapshot before submission.

Likely structural refactor targets:
- Isolate cart ownership checks, draft token handling, quote snapshot validation, and preview response shaping.
- Keep one-item quote-page drafts and full-cart drafts using the same validation path.
- Keep cart mutation routes separate from final print request submission.

Validation checks:
- Add a quote to cart, list cart, remove cart item, clear cart.
- Create a one-item request draft from a quote and a multi-item draft from cart selections.
- Preview a valid draft and reject missing, expired, or unauthorized draft tokens.
- Confirm unauthenticated and unverified users cannot add to cart or create drafts.

## Print Requests Route

Current behavior to preserve:
- Print request submission requires login, verified email, accepted Terms, and a valid request draft.
- Submitted requests store immutable quote/request snapshots so later pricing changes do not alter them.
- Backend-generated PDF payment slips include branding, itemized costs, reference numbers, and signature lines.
- Admins verify physical receipts, inspect models, update statuses, undo the latest unreverted status transition with a reason, archive/delete where allowed, and clients may cancel only before approval.
- Client status is shown as the established visual timeline stages.

Likely structural refactor targets:
- Split draft submission orchestration, payment slip PDF generation, status transition policy, receipt verification, notification, and model/file resolution.
- Keep status history append-only and correction behavior auditable.
- Keep controller handlers thin and service functions focused.

Validation checks:
- Submit a request draft with Terms accepted and reject submission without Terms.
- Confirm quote snapshots, material/color snapshots, and request items persist after submission.
- Generate and download a payment slip.
- Admin status update, receipt verification, undo correction, model inspection, archive/delete, and client cancellation rules.

## Files And Storage Access

Current behavior to preserve:
- Managed file objects and file references are the canonical access path for durable files.
- Raw `/storage/...` model URLs must not become a new canonical model loading flow.
- Public thumbnails may render where intended, while protected model/payment/design files require the current access rules.
- Download responses preserve safe filenames and inline/download behavior.

Likely structural refactor targets:
- Centralize file-object resolution, content disposition handling, inline/download response options, and preview URL normalization.
- Reduce repeated raw storage URL checks in frontend pages.
- Keep backend path resolution constrained to approved storage roots.

Validation checks:
- Download quote/request/design/MMF files through file-object routes.
- Confirm thumbnails still load from allowed static paths.
- Confirm model preview uses approved download URLs and blocks unsupported raw storage paths.
- Confirm admin-only and owner-only file access remains enforced.

## Materials, Pricing, Slicer Profiles, And Printers

Current behavior to preserve:
- Public users can view active materials and public printer information.
- Admins manage materials, colors, pricing config, slicer profiles, profile validation, quote readiness diagnostics, and printers.
- Material color is stored in quote/request snapshots and does not affect slicer profile selection.
- Printer selection does not affect quote generation or request submission in the current scope.

Likely structural refactor targets:
- Normalize CRUD controller/validator patterns across admin configuration routes.
- Extract repeated frontend admin form/list loading patterns.
- Keep profile dry-run validation and activation audit trails explicit.

Validation checks:
- Public active material and printer reads.
- Admin create/update/deactivate material, color, pricing, profile, and printer records.
- Slicer profile dry-run validation and quote readiness diagnostics.
- Quote behavior remains unchanged after admin config refactors.

## Design Library Route

Current behavior to preserve:
- Public browsing is discovery-first with Featured, Print Ready, Official Lab Designs, Community Designs, and External References sections.
- UniFab-hosted and MMF designs remain clearly distinguished.
- Users can create drafts, publish for screening, manage My Designs, keep rejected designs visible to owners, and privately save/unsave public UniFab-hosted designs.
- Automated full-asset AI moderation remains explainable and auditable.
- Admins can moderate, recheck, hide/restore, curate, manage taxonomy, mark files Print Ready, and manage MMF overrides/cached-file diagnostics.
- Content approval and Print Ready approval remain separate.

Likely structural refactor targets:
- Split backend controller concerns into public catalog, My Designs, admin local designs, taxonomy, moderation/Print Ready, and MMF overrides.
- Extract response normalizers, asset intent handling, taxonomy resolution, moderation orchestration, and MMF mapping diagnostics.
- Split large frontend pages into page-local components/hooks while preserving layout and copy unless explicitly changed.

Validation checks:
- Browse discovery sections, search, filter, and pagination.
- Local design detail, MMF detail, save/unsave, My Designs draft save, publish, owner edit, owner delete.
- Admin approve/reject/hide/restore/recheck, audit history, latest AI run/item visibility, curation fields, taxonomy management.
- File-level Print Ready verification for local and MMF designs, instant quote enablement only for verified files, and MMF diagnostics.

## Admin Dashboard, Maintenance, And Health

Current behavior to preserve:
- Admin dashboards show practical operational queues and metrics.
- Admin audit, users, content, maintenance, file registry, cleanup, and health/status views remain admin-only.
- Cleanup jobs and manual cleanup actions are retention-aware, auditable, and support dry-run where implemented.
- System status and database health remain visible only to admins when required.

Likely structural refactor targets:
- Extract repeated admin list/filter/loading UI patterns.
- Keep maintenance commands explicit rather than hiding destructive operations behind generic helpers.
- Normalize backend admin list query parsing and response shaping where patterns repeat.

Validation checks:
- Admin dashboard loads expected counts and queues.
- Audit pagination/filtering, user management, content editing, file registry summary/list/detail.
- Cleanup dry-runs and real cleanup actions preserve retention and active reference checks.
- Healthcheck/database status routes maintain current access behavior.

## Standard Validation Commands

- Frontend after significant frontend changes: `cd frontend && npm.cmd run lint`
- Frontend production build after significant frontend changes: `cd frontend && npm.cmd run build`
- Backend database check where configured: `cd backend && npm run db:check`
- Backend production preflight where configured: `cd backend && npm run db:preflight`
- Backend migration verification when schema changes are explicitly planned: `cd backend && npm run db:migrate`

Docs-only passes do not require app build checks, but they should confirm no runtime files changed.

## Per-Pass Review Note Template

Use this short note in each refactor pass summary:

```md
### Refactor Parity Note

- Route/workflow:
- Current behavior preserved:
- Structural improvement:
- Public API/schema/UI changes:
- Validation run:
- Residual risk or follow-up:
```

