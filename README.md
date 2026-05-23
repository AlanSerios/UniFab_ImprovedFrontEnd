# UniFab

UniFab is a university 3D printing service web app for the USTP-CDO Fabrication Laboratory. It lets users upload or select 3D designs, generate slicer-based quotes, submit print requests, and track request progress. Lab administrators use the system to manage pricing, materials, slicer profiles, design readiness, requests, and public website content.

This README is the working reference for the approved product workflow. The project may still evolve, but new work should stay aligned with the rules and scope below.

## Tech Stack

| Area | Technology |
|---|---|
| Frontend | React, Vite, Tailwind CSS |
| Backend | Node.js, Express.js |
| Database | MySQL |
| File uploads | Multer |
| Auth | JWT access and refresh tokens |
| Quote engine | PrusaSlicer CLI |
| External design source | MyMiniFactory API |

## Core Product Scope

### Current Workflow Status

| Route | Status | Notes |
|---|---|---|
| Quote Route | Complete | Thumbnail-first quote cards, click-to-open 3D model viewer, cart support, restored quote previews, and specific slicer-based pre-flight warnings are part of the approved flow. |
| Print Request Route | Complete | Multi-object cart submission, Terms acceptance, final confirmation, visual status timeline, backend-generated PDF payment slips, structured physical receipt verification, admin model inspection, client cancellation before approval, and auditable status correction are part of the approved flow. |
| Design Library Route | Complete | Discovery-first public browsing with multi-file UniFab-hosted entries, ordered preview galleries, Print Ready, Official Lab, Community, Featured, and External Reference sections; My Designs publishing; private saved bookmarks; full-asset AI moderation with durable run evidence; admin curation; audit history; file-level Print Ready separation; and MMF cached-file diagnostics are part of the approved flow. |
| Admin Routes | In Progress | Core quote, request, pricing/material/profile, community design, MMF override, health/status, content, maintenance, and filtering workflows are implemented. Remaining admin work is broader operational polish and reporting depth. |
| Auth Route | Complete | Registration creates a pending account; unverified users can only access the verification screen, resend verification, refresh status, or log out. Verified users can access protected client/admin workflows according to role. |

### In Scope

- Public quote calculation without login.
- Verified-client print request submission with Terms & Conditions acceptance.
- Backend quote persistence through configurable quote records/tokens and reusable quote assets that avoid duplicate model files during recalculation.
- Slicer-based quote calculation using PrusaSlicer-generated G-code.
- Thumbnail-first model snapshots with click-to-open WebGL model preview for `.stl`, `.obj`, and `.3mf` uploads before submission.
- Specific pre-flight warnings based on PrusaSlicer output, including long print time, model size near printer limits, and material-specific TPU/PETG warnings.
- Material and slicer profile management (including rich material specs).
- Admin-managed pricing configuration.
- Client request history and visual request status tracking.
- Backend-generated PDF payment slip artifacts, admin-only model inspection, and structured physical in-person receipt verification.
- Managed file registry for local uploads, snapshots, payment slips, slicer profiles, Design Library assets, and MMF cached printable files.
- Design library using UniFab-hosted official lab designs, user-submitted community designs with automated appropriateness screening, and MyMiniFactory external references.
- "Print Ready" instant quoting for verified library files. A single design entry can contain multiple model files and preview images.
- Private saved design bookmarks for verified users.
- Creator Dashboard / My Designs management for draft, screening, auto-approved, needs-admin-review, auto-rejected, admin-approved, admin-rejected, and hidden user designs.
- Rules + OpenAI text moderation + thumbnail image moderation + generated 3D render moderation for client-uploaded design metadata, filenames, ownership/policy acknowledgement, thumbnails, and uploaded `.stl`, `.obj`, and `.3mf` files.
- Admin override, public-library curation, and audit history for automated Design Library decisions.
- Admin readiness control for MyMiniFactory designs through in-context Design Library actions, OAuth-backed MMF API file inspection, cached printable artifacts, diagnostics, and the `/admin/mmf-overrides` dashboard for existing overrides.
- Admin-managed Design Library categories/tags for consistent filtering and discovery.
- Printer information display.
- Mandatory email verification before registered users become fully active clients or admins.
- Admin dashboard sorting and filtering.
- Production database migration, preflight, retention cleanup, and file-reference consistency checks.
- Website/content management for homepage content, contact details, images, lab hours, and service notices.

### Out of Scope for the Current Version

- Full e-commerce purchasing flow.
- Online payment gateway integration.
- Public seller/vendor accounts.
- Shipping and delivery logistics.
- Multi-vendor fulfillment.
- Public seller marketplace or external designer storefront.
- Client-controlled printer selection affecting quotes.
- Promo codes.

## User Roles

| Role | Capabilities |
|---|---|
| Guest | Browse public pages, search the design library, upload a model, configure print settings, and view a quote. |
| Client | After email verification, submit print requests, view request history, manage uploaded designs, pay at the campus cashier, verify physical receipts in person, and track statuses. |
| Admin | After email verification, manage pricing, materials, slicer profiles, quote readiness, printer information, design library, design readiness, print requests, and website content. |

## Approved Workflow Rules

1. Guests can view calculated quotes without logging in.
2. Registered accounts are pending until email verification; unverified users may only access verification actions and logout.
3. Print request submission requires login and verified email.
4. A print request cannot be submitted without a successful quote.
5. A cart order is server-owned by a verified user and may contain multiple successful quote records; request submission uses a short-lived server request draft that locks the intended cart item selection, and each drafted item must still be backed by a valid unexpired quote.
6. Quote calculation must be based on validated PrusaSlicer output.
7. Users must accept Terms & Conditions before final print request submission.
8. A final confirmation page must show the quote, material, quality, and other important details before submission.
9. If slicing fails, the user must revise the file/settings before submitting a print request.
10. Quote data should persist through login using backend quote records and configurable quote tokens; uploaded quote models are tracked as reusable quote assets so parameter changes do not duplicate model or thumbnail files.
11. Adding to cart requires a logged-in, verified account; cart checkout and direct quote submission use server request drafts before creating print requests.
12. Submitted print requests must keep quote snapshots to avoid unexpected changes after admin pricing updates.
13. Admin-confirmed cost is authoritative after review.
14. Payment verification is based on physical receipt checking at the FabLab; the system does not use client receipt upload.
15. Clients may cancel submitted print requests only before admin approval; cancellations are audited and do not delete request history.
16. MyMiniFactory designs are not automatically ready for printing.
17. Only admin-approved MyMiniFactory designs can proceed to direct print submission. Direct MMF quoting must use an admin-verified backend-cached printable artifact, not a UniFab-hosted Local Design row, so PrusaSlicer remains the source of quote metrics while MMF records stay separate.
18. Client-uploaded library designs should pass automated appropriateness screening before public visibility decisions.
19. Automated screening may auto-approve low-risk content or route flagged/uncertain submissions to admin review. AI-flagged designs are not auto-rejected in the v1 rollout.
20. Admins can view, override, approve, reject, hide, restore, and manage automated library decisions.
21. Content approval controls public visibility only; Print Ready approval is separate, requires admin local slicer verification, and is required for Instant Quote.
22. UniFab-hosted designs use `local_designs` internally, with `source_kind = 'lab'` for official lab catalog records and `source_kind = 'community'` for user submissions. Admin lab catalog screens should not mix these workflows.
23. Public Design Library browsing should be discovery-first when no search or filter is active, with sections for Featured, Print Ready, Official Lab Designs, Community Designs, and External References.
24. Categories and tags must come from the approved admin-managed Design Library taxonomy; user and lab design forms must not create free-form public categories or tags.
25. Admin curation fields such as featured rank, library note, and public-library hidden state control discovery placement only; they do not approve content or grant Print Ready status.
26. Saved UniFab-hosted designs are private server-side user bookmarks, not public social collections. Browser-local MyMiniFactory bookmarks may be used only as external reference saves.
27. UniFab-hosted designs can support categories/tags, but tags are not required for the core request workflow.
28. Printer information can be displayed to users, but printer/profile selection remains backend/admin-controlled.
29. Production database changes must use migrations and pass preflight checks before deployment; destructive resets are local-only and explicitly gated.
30. Website/content management is approved, but it is secondary to the core quote and request workflow.

## Main Client Workflows

### 1. Upload File and View Quote

1. User opens the quote/upload page.
2. User uploads a supported model file: `.stl`, `.obj`, or `.3mf`.
3. User chooses material, material color when configured, print quality, infill, and quantity.
4. Backend validates the file and settings.
5. Backend resolves the active material and active slicer profile.
6. Backend runs PrusaSlicer CLI.
7. Backend parses generated G-code for print time, filament weight, and filament length.
8. Backend calculates the estimated price using current pricing configuration.
9. Backend analyzes slicer data and displays specific pre-flight warnings, such as long print time, model size near printer limits, and material-specific TPU/PETG warnings.
10. Backend stores the uploaded model and generated snapshot as a reusable quote asset, creates a quote record, and returns a quote token.
11. If the user changes material, color, quality, infill, or quantity for the same uploaded model, the backend creates a fresh quote record that reuses the existing quote asset instead of duplicating the model or thumbnail.
12. User sees a thumbnail-first quote card and may open the full 3D viewer on demand.
13. Logged-in verified users may submit the quote immediately or add it to their server-side cart; guests are redirected to login before carting. Immediate submission creates a one-item request draft before opening the request form.

### 2. Submit Print Request

1. User reviews a successful quote.
2. User clicks submit.
3. If unauthenticated, the user is redirected to login with the quote token preserved.
4. After login, the frontend adds the pending quote to the server cart and creates a request draft for that cart item.
5. The request form loads from `/requests/new/:draftToken`; cart checkout creates a draft for the full active cart, while quote submission creates a single-item draft.
6. User accepts Terms & Conditions; the submit button remains disabled until accepted.
7. User reviews a final confirmation page showing the drafted quote items, material, quality, and other important details.
8. Backend revalidates the request draft, cart item ownership, quote validity, and file availability.
9. Backend promotes uploaded quote files into durable print-request storage when needed, creates one print request with one or more request items from quote snapshots, marks only drafted cart items submitted, and marks the draft submitted.
10. Request starts as `pending_review` and is shown to the client with a visual status stepper/timeline.

### 3. Search Design Library & Submit Designs

1. User opens the design library and sees discovery sections for Featured, Print Ready, Official Lab Designs, Community Designs, and External References when no search/filter is active.
2. User searches or filters designs by source, Print Ready status, category, tags, and sort when they need a specific model.
3. User views design details.
4. **Verified Files:** If a specific model file is tagged as "Print Ready," the user can click "Instant Quote" to bypass manual upload and proceed directly to quoting using that backend-managed file.
5. **Non-Print Ready Files:** Approved UniFab-hosted designs may be viewed and downloaded, but Instant Quote remains disabled for each file until FabLab verification marks that exact file Print Ready.
6. **Unverified MMF Designs:** If a MyMiniFactory design needs review, the user is provided an outbound link to download it directly from MyMiniFactory, after which they can manually upload it to the quote engine.
7. **Saved Designs:** Verified users can save or unsave public UniFab-hosted designs as private server-side bookmarks for later. MyMiniFactory references may also be saved as browser-local external bookmarks, separate from UniFab-hosted saved designs.
8. **Community Submissions:** Authenticated verified users can manage their designs in My Designs / Creator Dashboard across Draft, Screening, Auto Approved, Needs Admin Review, Auto Rejected, Admin Approved, Admin Rejected, and Hidden states.
9. Users can save their own submissions as drafts before publishing. Publishing queues automated AI screening before public visibility.
10. Screening checks metadata, filenames, license/ownership confirmation, policy acknowledgement, all gallery images, model snapshots, and generated renders for every active uploaded `.stl`, `.obj`, and `.3mf` file. If any required AI check or render generation fails, the design is routed to admin review rather than public visibility.
11. Screening can auto-approve low-risk designs or send flagged/uncertain designs to admin review; v1 does not auto-reject AI-flagged designs.
12. Rejected designs remain visible to the owner with moderation/admin feedback when policy allows.
13. If an approved design is edited, it returns to screening/review, is hidden from the public library until approved again, and affected model files lose Print Ready status until each file is reverified.
14. Admins can rerun moderation/render checks after transient screening failures; rechecks append audit history and clear affected Print Ready file status until verification is repeated.

### 4. Track Requests and Verify Payment

1. Client opens request history and uses the visual order status timeline.
2. Client views request status, reference number, quote/confirmed cost, and status history.
3. After admin approval, an admin issues the payment slip with a confirmed cost; the backend generates and stores a viewable/printable PDF artifact.
4. Client pays in person at the designated university cashier.
5. Client presents the physical receipt to lab staff during operational hours.
6. Admin manually marks the request as `payment_verified` in the system.
7. Admins can correct the latest unreverted status transition when an accidental operational update needs correction; the system restores the previous snapshot and records a correction event.

## Main Admin Workflows

### Pricing Management

Admins manage values used in quote calculation:

- Machine hour rate
- Base fee
- Waste factor
- Support markup factor
- Electricity cost per kWh
- Power consumption watts
- Currency

Pricing changes affect future quotes. Existing submitted requests keep their original quote snapshots.

### Material and Slicer Profile Management

Admins can:

- Add, edit, activate, or deactivate materials.
- Configure available color options per material.
- Set material cost per gram.
- Upload `.ini` slicer profiles.
- Maintain profile versions for material-quality combinations.
- Dry-run validate uploaded profiles before they become active.
- Review quote readiness and recent quote diagnostics from the admin dashboard.

A quote cannot be calculated unless an active material and active slicer profile exist for the selected material-quality pair.

### Print Request Management

Admins review submitted requests, securely preview or download the submitted model, confirm feasibility, set confirmed cost, and issue payment slips (which the backend generates and stores as printable PDF artifacts).

When a client presents a physical receipt, admins verify it in-person and store the receipt/reference number, verification note, verifier, and timestamp while moving the request to `payment_verified`. Admins correct accidental status changes through immutable correction events rather than destructive undo.

Admin dashboards support sorting and filtering for efficient request management.

Rejected or cancelled print requests can be archived to remove them from the active admin queue. Archived rejected or cancelled print requests may be permanently deleted afterward as an admin cleanup action.

### Design Library Management

Admins manage:

- Official Lab Designs through `/admin/lab-designs` (`/admin/local-designs` remains a compatibility alias)
- Approved UniFab-hosted design categories and tags through `/admin/design-taxonomy`
- User-submitted community designs, including automated screening decisions, admin overrides, feedback notes, file previews/renders, and audit history
- Public-library curation fields such as Featured, featured rank, library note, and hidden-from-library state
- MyMiniFactory design overrides through in-context Design Library admin actions and the `/admin/mmf-overrides` dashboard.

**Client-uploaded Design Moderation:** Published user designs queue automated AI screening before public visibility. The current screening pipeline records a durable moderation run, checks all relevant text fields and filenames with OpenAI moderation, checks every gallery image and model snapshot, generates PNG render views for every active `.stl`, `.obj`, and `.3mf` file, and runs a UniFab-specific AI policy classifier. Any provider error, malformed response, missing render, flagged content, or uncertain policy result routes the design to admin review. Only completed low-risk AI runs can auto-approve public visibility. Admins can view run/item evidence, flags, summaries, decision sources, audit history, and override decisions by approving, rejecting, hiding, restoring, or sending a design back to review.

Content approval and Print Ready approval are separate. Content-approved designs may appear in the public library, but only file-level Print Ready entries can use an admin-verified file for Instant Quote. Approved designs that contain non-Print Ready files can be browsed and downloaded, but instant quote stays disabled for those files.

Public-library curation is also separate from both moderation and Print Ready. Featuring, ranking, adding a library note, or hiding a design from discovery changes catalog presentation only; it must not bypass moderation or enable Instant Quote.

**MyMiniFactory Workflow:** Admins can browse the public Design Library like users. MMF detail pages show admin-only controls for Pin, Hide, Add/Edit Client Note, and Print Ready cached-file setup. Enabling MMF Print Ready requires a connected lab-owned MMF OAuth account, admin selection of exact API-visible STL/OBJ/3MF files or printable ZIP entries, and local slicer verification. UniFab stores selected backend-managed printable artifacts in MMF Print Ready storage, while overrides keep MMF identity, status, verification metadata, and failure reasons for diagnostics. MMF cached files must not become UniFab-hosted Local Design records.

The `/admin/mmf-overrides` page is a dashboard for viewing and editing existing MMF overrides. It includes a redirect back to the Design Library for finding new MMF designs, and it surfaces cached-file diagnostics such as needs-file, mapped, manual-link legacy fallback, or failed states.

Unavailable official lab designs can be archived to hide them from the default admin list. Archived unavailable lab designs may be permanently deleted only when no print requests still reference them.

Recommended MyMiniFactory readiness statuses:

| Status | Behavior |
|---|---|
| `not_reviewed` | Visible, but cannot be submitted directly for printing. |
| `ready_for_printing` | Can proceed to quote/request flow only when a cached MMF Print Ready artifact is available. |
| `not_printable` | Visible as unavailable or blocked from submission. |
| `hidden` | Excluded from client-facing results. |

### Printer Information

Admins manage the list of available printers (including technology, build volume, and supported materials). This information can be displayed publicly. Printer selection does not affect client quote generation or request submission in the current scope.

### System Status

The system provides health check and admin database metrics endpoints for monitoring API latency, database latency, table sizes, quote failure rate, cleanup failures, slow-query count, and file-reference consistency. Admin-facing status views should remain operational and task-focused.

### File Lifecycle And Cleanup

Local model and artifact files are tracked through the managed file registry. Backend responses should use secure file download routes for model previews and downloads instead of exposing raw storage paths, except for intentionally public static image previews.

Quote uploads first live in quote-managed temporary storage and are linked to reusable quote assets. Recalculating a quote for the same uploaded model creates a new immutable quote record while reusing the same model and thumbnail. Adding an item to cart keeps the quote asset in place; submitting a print request promotes uploaded quote files into durable print-request storage. Submitted request files, payment slips, and request snapshots must remain durable according to request retention policy.

Design Library uploads are durable managed assets after draft save. Public deletion hides the design immediately while preserving owner/admin access during the retention window. Design Library and database retention cleanup jobs must re-check active references before deleting physical files, and cleanup should remain auditable through dry-run/manual admin paths.

### Database And Deployment Operations

The backend schema is managed from `backend/db/schema.sql` plus timestamped migrations in `backend/db/migrations`. Use `npm run db:migrate` for production schema changes and `npm run db:preflight` before release. `npm run db:reset` is destructive, local-only, and environment-gated.

Production deployment should use managed MySQL with automated backups, point-in-time recovery, slow-query logging, a completed restore drill, and matching file-storage backups. See `backend/docs/production-database-readiness.md` for the launch checklist.

### Website and Content Management

Admins may manage:

- Homepage content
- Contact details
- Lab hours
- Service notices
- Homepage/service images

This feature is approved but should come after the core quote and request workflow.

## Request Statuses

### Print Request Statuses

Client-facing print request progress should use a stepper UI with these main stages: Submitted, Awaiting Payment, Payment Verified, Printing, and Completed.

| Status | Meaning |
|---|---|
| `pending_review` | Request has been submitted and awaits admin review. |
| `design_in_progress` | Design work or adjustment is in progress. |
| `approved` | Request has been approved. |
| `payment_slip_issued` | Confirmed cost and a backend-generated PDF payment slip have been issued; client should pay at the campus cashier and verify the physical receipt in person. |
| `payment_verified` | Admin has verified the physical receipt in person and recorded the receipt/reference number. |
| `printing` | Print job is in progress. |
| `completed` | Print job is finished. |
| `rejected` | Request was declined. |
| `cancelled` | Client cancelled the request before admin approval. |

### Library Design States

| State | Meaning |
|---|---|
| `draft` | Owner is still preparing the design; it is not public and has not entered admin review. |
| `screening` | Owner published the design and automated appropriateness checks are running. |
| `auto_approved` | Automated screening found low risk; design is visible publicly but is not automatically Print Ready. |
| `needs_admin_review` | Automated screening found uncertainty or risk; design is hidden until an admin decides. |
| `auto_rejected` | Legacy automated rejection status; v1 AI screening routes flagged designs to admin review instead. |
| `admin_approved` | Admin approved the design for public visibility. |
| `admin_rejected` | Admin rejected the design; it remains visible to the owner with admin feedback when policy allows. |
| `hidden` | Admin removed the design from public browsing after approval. |

If an approved design is edited and its model file is replaced, it returns to screening/review, is hidden from the public library until approved again, and loses Print Ready status until the file is reverified.

### Design Moderation Records

Automated and admin moderation decisions should preserve:

- Decision source: AI or admin.
- Moderation flags, severity, summary, and matched policy categories.
- Admin feedback shown to the owner when applicable.
- Status transitions with actor and timestamp.
- Whether the design is content-approved, hidden, or Print Ready.

### Current Route 3 Implementation Notes

- Community design drafts, owner editing, publishing, admin moderation, moderation rechecks, Print Ready separation, and audit history are implemented.
- Publishing queues an asynchronous full-asset AI moderation run with per-item audit evidence.
- Public Design Library visibility requires an active approved UniFab-hosted design. Auto-approved designs additionally require the latest completed AI moderation run to match the current content hash.
- Print Ready requires a separate admin verification checklist and stores audit metadata. Moderation rechecks and approved-design edits clear Print Ready until the current file is verified again.
- MMF Print Ready stores mapping status, verification metadata, cached printable artifact metadata, and failure reasons. Legacy linked local files are compatibility fallbacks only.
- Instant Quote from a UniFab-hosted design additionally requires `is_print_ready = TRUE`.
- Admins review community submissions in `/admin/community-designs`.
- Moderation decision source values are `none`, `ai`, and `admin`; legacy `rules` and `render` values may exist only in historical data.

## Important Data Snapshots

Submitted print requests should preserve quote-related data so requests remain traceable after pricing/profile changes.

Recommended quote snapshot fields:

- Quote token or quote ID
- Source type
- File or design source reference
- Material
- Material color
- Quality
- Infill
- Quantity
- Estimated print time
- Filament weight
- Filament length
- Pricing breakdown
- Total estimated price
- Pricing config snapshot
- Material cost snapshot
- Slicer profile/version snapshot
- Quote creation timestamp
- Quote expiration timestamp

## Setup

### Backend

```bash
cd backend
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

The backend runs on `http://localhost:5000` by default.

Useful database commands:

- `npm run db:migrate` applies pending migrations or reports migration status with `-- --status`.
- `npm run db:seed` applies required baseline system data without dropping tables.
- `npm run db:check` verifies schema drift, seeds, foreign keys, storage references, slicer files, and high-traffic indexes.
- `npm run db:preflight` runs the deployment gate checks.
- `npm run db:reset` is destructive and must only be used for intentional local resets with the required environment flags.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on the Vite development server, usually `http://localhost:5173`.

## Environment Requirements

The backend expects environment variables for:

- Server port
- CORS origin
- MySQL connection
- JWT secrets and expiration
- Mail settings
- MyMiniFactory API settings, plus OAuth credentials for admin Print Ready file inspection and caching:
  - `MMF_API_KEY`
  - `MMF_CLIENT_ID`
  - `MMF_CLIENT_SECRET`
  - `MMF_REDIRECT_URI`
  - `INTEGRATION_TOKEN_ENCRYPTION_KEY`
- PrusaSlicer executable path
- Design moderation settings:
  - `OPENAI_API_KEY`
  - `OPENAI_MODERATION_MODEL` (defaults to `omni-moderation-latest` when unset)
  - `OPENAI_POLICY_MODEL` (defaults to `gpt-4.1-mini` when unset)
  - `OPENAI_MODERATION_TIMEOUT_MS`
  - `DESIGN_MODERATION_CONCURRENCY`
- Cleanup and production readiness settings:
  - `QUOTE_CLEANUP_INTERVAL_MINUTES`
  - `DESIGN_FILE_CLEANUP_INTERVAL_MINUTES`
  - `DB_RETENTION_CLEANUP_INTERVAL_MINUTES`
  - `PROD_DB_BACKUPS_CONFIRMED`
  - `PROD_DB_PITR_CONFIRMED`
  - `PROD_DB_RESTORE_DRILL_CONFIRMED`
  - `MYSQL_SLOW_QUERY_LOGS_CONFIRMED`
  - `FILE_STORAGE_BACKUP_CONFIRMED`

Do not commit real production secrets.

## Verification

Use these checks when changing the app:

```bash
cd frontend
npm run lint
npm run build
```

Backend currently has no test script defined. Verify backend changes manually through API behavior until automated tests are added.

For backend database or storage changes, also run:

```bash
cd backend
npm run db:preflight
```

## Development Notes

- Keep quote viewing and request submission separate.
- Keep user-facing workflows simple and guided.
- Keep admin workflows focused on operational tasks.
- Prefer backend-controlled validation for anything related to pricing, slicing, profiles, uploads, and permissions.
- Preserve the managed file lifecycle: quote assets are temporary until request submission, print-request files are durable, and Design Library assets use retention-aware cleanup.
- Update this README and `AGENTS.md` when approved workflow decisions change.
