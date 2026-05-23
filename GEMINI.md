# GEMINI.md

## Project Overview
- **Project:** UniFab
- **Purpose:** University 3D printing service web app for the USTP-CDO Fabrication Laboratory.
- **Primary users:** Guests, authenticated clients, and lab administrators.
- **Stack:** Express.js backend, MySQL database, React + Vite frontend, Tailwind CSS, PrusaSlicer CLI, MyMiniFactory API integration.
- **Current direction:** Build from the approved workflow/PRD decisions in the root `README.md`. Requirements may evolve, so keep implementation flexible and well documented.

## Current Workflow Status
- **Quote Route:** Complete, including thumbnail-first model snapshots, click-to-open model preview, cart support, restored quote preview, final confirmation, and specific slicer-based pre-flight warnings.
- **Print Request Route:** Complete, including multi-object cart submission, Terms acceptance, final confirmation, visual status timeline, backend-generated PDF payment slips, structured physical receipt verification, admin model inspection, client cancellation before approval, and auditable status correction.
- **Design Library Route:** Complete, including discovery-first public browsing, multi-file UniFab-hosted design entries, ordered preview galleries, Featured/Print Ready/Official Lab/Community/External Reference sections, My Designs, private saved bookmarks, draft-to-publish publishing, full-asset AI moderation, moderation rechecks, admin curation/override, audit history, file-level Print Ready verification, and MMF cached-file diagnostics.
- **Admin Routes:** In progress. Core quote, request, pricing/material/profile, community design, and MMF override workflows are implemented; remaining work is broader operational polish such as health dashboards, content management, and advanced filtering.
- **Auth Route:** Complete, including verified-before-active registration, JWT refresh, frontend email verification links, resend verification, protected routes, admin guards, and limited access for unverified users.

## Product Rules
- Guests may upload/configure models and view calculated quotes without logging in.
- Registered accounts are pending until email verification; unverified users may only access verification actions and logout.
- Print request submission requires login and verified email.
- A print request must not be submitted without a successful quote.
- A cart order is server-owned by a verified user and may contain multiple quote records; request submission must use a short-lived server request draft that records the exact cart item selection, and every drafted item must have a valid unexpired quote snapshot for submission.
- Users must accept Terms and Conditions before final print request submission, and the final confirmation step must show the quote, material, quality, and other important details.
- Quote calculation must be slicer-based and must include validated print time, filament usage, and pricing.
- Material color is a material option selected during quote/request flow and stored in quote/request snapshots; color does not affect slicer profile selection unless a future workflow explicitly changes that.
- The quote route uses backend-generated model snapshots by default and opens the interactive WebGL 3D model viewer for `.stl`, `.obj`, and `.3mf` files only when users click the snapshot.
- The system provides specific pre-flight warnings using PrusaSlicer output (e.g., long print time, model size near printer limits, and material-specific TPU/PETG warnings).
- Quote data should persist through login using backend quote records with configurable quote tokens.
- Cart data is server-side and tied to a logged-in, verified user; guests can quote but must log in before adding to cart.
- Submitted print requests must store a quote snapshot so later pricing changes do not silently affect them.
- Request drafts are the checkout intent layer: quote-page submission creates a one-item draft, cart submission creates a full-cart draft, and `/requests/new/:draftToken` must preview/submit only that draft.
- Print request status should be shown as a visual stepper/timeline with the main stages: Submitted, Awaiting Payment, Payment Verified, Printing, and Completed.
- Payment slips are generated and stored as PDFs by the backend with university/lab branding, itemized costs, reference numbers, and signature lines; payment verification relies on in-person physical receipt checking by admins (no client upload) and stores the receipt/reference number, note, verifier, and verification time.
- "Print Ready" library files offer instant quoting using secure, backend-managed files. A design may contain multiple model files, and Print Ready is reviewed per file.
- Public Design Library browsing should be discovery-first when no search or filter is active, with Featured, Print Ready, Official Lab Designs, Community Designs, and External References shown as separate sections.
- Users can manage uploaded designs in My Designs / Creator Dashboard states such as Draft, Screening, Auto Approved, Needs Admin Review, Auto Rejected, Admin Approved, Admin Rejected, and Hidden; rejected designs stay visible to the owner with feedback.
- Verified users can privately save or unsave public UniFab-hosted designs as bookmarks; saved designs are not public social collections.
- Users can save library submissions as drafts before publishing. Publishing runs automated appropriateness screening before public visibility decisions.
- Design Library screening currently uses full-asset AI moderation: metadata and filenames, gallery images, model snapshots, generated renders for every active uploaded `.stl`, `.obj`, and `.3mf` file, and a UniFab-specific AI policy classifier.
- Automated screening may auto-approve low-risk content or route flagged/uncertain submissions to admin review. It should not auto-reject AI-flagged designs in the v1 rollout. Admins must be able to view, override, approve, reject, hide, restore, and manage these decisions.
- Content approval only controls public Design Library visibility. Print Ready approval is separate, file-level, requires admin local slicer verification, and remains stricter because it allows Instant Quote from an admin-verified file.
- Editing an approved design returns it to screening/review, removes public visibility until re-approved, and clears Print Ready status for newly replaced or affected files until each file is reverified.
- Automated and admin moderation decisions should be auditable with stored flags, summaries, feedback, status transitions, and actor/timestamp history.
- MyMiniFactory designs marked "Needs Review" are not hosted on UniFab; instead, an outbound link directs users to the source.
- Admins manage MyMiniFactory designs in context from Design Library detail pages using admin-only actions such as Pin, Hide, Add/Edit Client Note, Mark as Print Ready, and editing other override fields. MMF Print Ready requires a connected lab-owned MMF OAuth account, exact file or ZIP-entry selection, local verification confirmation, and stores mapping status, one or more cached printable artifact records, verification metadata, and failure reasons. MMF cached files must not become UniFab-hosted Local Design records.
- Admins should use quote readiness diagnostics to verify active materials, slicer profiles, dry-run validation, profile files, pricing, and recent quote failures.
- `/admin/mmf-overrides` is a dashboard for viewing and editing existing MMF overrides, with a redirect button back to the Design Library for finding new MMF designs to manage.
- UniFab-hosted designs use `local_designs` internally, with `source_kind = 'lab'` for official lab catalog records and `source_kind = 'community'` for user submissions. Admin lab catalog screens must not mix these workflows.
- Admins manage official lab catalog records through `/admin/lab-designs`; `/admin/local-designs` may remain as a compatibility alias.
- Admin library curation fields such as featured rank, library note, and public-library hidden state affect catalog presentation only; they do not approve content or grant Print Ready status.
- UniFab-hosted designs may use categories/tags for filtering and organization, but categories and tags must come from the approved admin-managed taxonomy rather than free-form user input.
- Printer information is managed by admins and may be shown publicly to clients. Printer selection must not affect quote generation or request submission in the current scope.
- System status can be monitored by admins only.
- Website/content management is approved but secondary to the core quote and request workflow.

## Commands
- **Backend install:** `cd backend && npm install`
- **Backend dev:** `cd backend && npm run dev`
- **Backend start:** `cd backend && npm start`
- **Backend migrate:** `cd backend && npm run db:migrate`
- **Backend seed:** `cd backend && npm run db:seed`
- **Backend check:** `cd backend && npm run db:check`
- **Backend preflight:** `cd backend && npm run db:preflight`
- **Frontend install:** `cd frontend && npm install`
- **Frontend dev:** `cd frontend && npm run dev`
- **Frontend build:** `cd frontend && npm run build`
- **Frontend lint:** `cd frontend && npm run lint`

## Implementation Priorities
1. Maintain the completed authentication and protected-route behavior, including JWT refresh, email verification, admin guards, and Terms & Conditions acceptance before submission.
2. Maintain the completed public quote route: quote-token persistence, Interactive 3D Model Viewer, and specific slicer-based pre-flight warnings.
3. Require a valid successful quote before print request submission.
4. Maintain the completed print request route: Terms acceptance, final confirmation, visual status timeline, backend PDF payment slips, physical receipt verification, admin model inspection, and auditable status correction.
5. Build admin workflows for pricing, materials (rich specs), slicer profiles, quote readiness diagnostics, and print requests.
6. Maintain the completed Design Library workflow: discovery sections, Creator Dashboard / My Designs, private saved bookmarks, sectioned upload form, automated appropriateness screening, moderation rechecks, admin curation/moderation/override, separate Print Ready review, audit trail, and MyMiniFactory OAuth cached-file diagnostics.
7. Continue broader admin workflow polish for health dashboards, content management, sorting/filtering, and operational reporting.
8. Support additional features including admin-managed UniFab-hosted design categories/tags, printer information management, system status healthchecks, and admin dashboard sorting/filtering.
9. Add supporting features such as website/content management (including DFM guidelines).

## Backend Guidance
- Keep quote generation fully backend-controlled.
- Never let clients submit raw slicer flags, slicer executable paths, or profile file paths.
- Validate upload type, size, and request body fields before processing.
- Store server-managed quote snapshots for traceability, and use `quote_assets` for reusable uploaded model assets.
- Quote recalculation for the same uploaded model must reuse the existing quote asset and must not duplicate model or thumbnail files.
- Keep pricing, material, profile, and design snapshots attached to submitted requests.
- Keep selected material color snapshots attached to quote records and submitted requests.
- Keep cart and checkout flows server-owned. Request submission must use `request_drafts` and immutable quote/request snapshots.
- Use `file_objects` and `file_references` for managed local files, snapshots, payment slips, slicer profiles, Design Library assets, and MMF cached files. Do not add new canonical flows that load local model files from raw `/storage/...` URLs.
- Promote uploaded quote files into durable print-request storage only when a print request is submitted. Adding to cart should not promote or duplicate quote files.
- Treat Design Library uploads as durable managed assets after draft save. Owner deletion should hide public access immediately while preserving owner/admin access until retention cleanup.
- Dry-run validate uploaded slicer profiles before activation and keep validation events auditable.
- Enforce role-based access on admin routes.
- Record status history for request lifecycle changes.
- Allow admins to correct the latest unreverted print request status transition by restoring the previous immutable snapshot, requiring a correction reason, and appending correction history instead of deleting history.
- Allow clients to cancel their own print request only before admin approval; record cancellation as a terminal audited status.
- Clean up temporary files after quote expiration, failed validation, or failed processing.
- Cleanup jobs must be retention-aware, auditable, and must re-check active file references before physical deletion.
- Treat MyMiniFactory API access as backend-only; never expose API keys to the frontend.
- Keep automated Design Library moderation explainable and reviewable; do not hide the reason a design was auto-approved, flagged, hidden, or restored. Preserve AI run/item evidence, moderation flags, policy summaries, and admin overrides.
- Require Print Ready verification metadata before enabling instant quote for local or MMF designs. Moderation rechecks and approved-design edits must clear Print Ready until the current file is verified again.

## Database and Operations Guidance
- Treat `backend/db/schema.sql` as the canonical schema and add timestamped migrations in `backend/db/migrations` for schema changes.
- Use `npm run db:migrate` for production schema changes and `npm run db:preflight` before deployment.
- `npm run db:reset` is destructive and must only be used when explicitly requested and allowed by the environment gates. If the user asks to preserve users during a local reset, keep the `users` table and existing user data intact.
- Keep required seed data deterministic: admin/test users from environment, categories, tags, materials, material colors, pricing config, printers, printer-material links, slicer profiles, and baseline system data.
- Production readiness requires managed MySQL backups, point-in-time recovery, slow-query logs, a completed restore drill, matching file-storage backups, and passing `db:preflight`.
- Prefer cursor pagination and indexed queries for high-growth lists such as print requests, file registry, quote diagnostics, and Design Library search.

## Frontend Guidance
- Clearly separate "View Quote" from "Submit Print Request".
- Make it obvious that quote viewing does not require login.
- Disable submission until a successful quote exists.
- Keep the print request submit action disabled until Terms and Conditions are accepted.
- Show a final confirmation page before submission with quote, material, quality, and other important details.
- Preserve a single pending quote token when redirecting unauthenticated users to login for cart actions; after verified login, create a server request draft before opening request submission.
- Use the shared model preview adapter/snapshot-to-viewer flow for quote, cart, request, Design Library, and admin previews instead of guessing file extensions or loading raw storage model paths.
- Restore the quote after login when possible.
- Show clear user messages for failed slicing, missing profiles, unavailable materials, expired quotes, and unsupported files.
- Show specific pre-flight warnings from slicer metrics rather than generic warnings.
- Use a stepper/timeline for print request statuses instead of plain text.
- Distinguish official lab designs, community designs, MyMiniFactory designs needing review, ready-to-print designs, and unavailable designs.
- Use "UniFab-hosted" or "UniFab Designs" for user-facing copy; keep `local_designs` as internal database/API terminology.
- Use controlled category and tag selectors in design submission forms; do not let user-facing upload flows create free-form public taxonomy.
- Distinguish content-approved designs from Print Ready designs; public visibility does not automatically mean a file is verified for instant quoting.
- Keep rejected or auto-rejected user designs visible to the owner with moderation/admin feedback when policy allows.
- Show admins moderation flags, latest AI run/item results, owner, submitted date, file previews/renders, and override controls for client-uploaded designs.
- Approved UniFab-hosted designs that are not Print Ready may be browsed and downloaded, but instant quote must stay disabled until an admin marks the verified file Print Ready.
- Keep admin screens practical and task-oriented: pending review, awaiting payment, payment verified, active printing, and completed requests should be easy to scan.

## Gemini Guidelines (Do)
- Always act as Gemini, functioning as an expert AI developer for the UniFab project.
- Read the existing code and database shape before changing behavior.
- Match the current project patterns unless there is a clear reason to improve them.
- Keep changes small, scoped, and implementation-aware.
- Update docs when workflow or behavior changes.
- Prefer explicit validation and clear error messages.
- Run the relevant build/lint checks after frontend changes when practical.

## Gemini Constraints (Don't)
- Do not add unrelated marketplace, shipping, seller, or online payment workflows.
- Do not introduce new dependencies without a clear reason.
- Do not hardcode secrets, API keys, or credentials in committed files.
- Do not remove existing user work or rewrite large areas without need.
- Do not allow request submission to bypass quote validation.
- Do not make client printer selection affect quote calculation in the current scope.

## Testing and Verification
- Run `npm run lint` and `npm run build` in `frontend` after significant frontend changes.
- Manually verify public quote viewing, login redirect, quote restoration, and request submission when those flows are implemented.
- Verify backend changes against validation, role access, file upload limits, quote calculation, and request status transitions.
- If automated tests are added later, keep them focused on quote persistence, request submission rules, admin status transitions, and design readiness rules.

## Git
- Keep commits focused and descriptive.
- Do not force push.
- Do not revert unrelated user changes.

## Gemini Response Style
- Be clear, concise, and practical in all responses.
- Explain workflow-impacting decisions in plain English.
- Call out assumptions, gaps, and risks when requirements are still evolving.
- Make sure to follow best practices for code quality and structure as an AI pair programmer.
