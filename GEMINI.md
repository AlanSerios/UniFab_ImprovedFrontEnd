# GEMINI.md

## Project Overview
- **Project:** UniFab
- **Purpose:** University 3D printing service web app for the USTP-CDO Fabrication Laboratory.
- **Primary users:** Guests, authenticated clients, and lab administrators.
- **Stack:** Express.js backend, MySQL database, React + Vite frontend, Tailwind CSS, PrusaSlicer CLI, MyMiniFactory API integration.
- **Current direction:** Build from the approved workflow/PRD decisions in the root `README.md`. Requirements may evolve, so keep implementation flexible and well documented.

## Current Workflow Status
- **Quote Route:** Complete, including interactive model preview and specific slicer-based pre-flight warnings.
- **Print Request Route:** Complete, including Terms acceptance, final confirmation, visual status timeline, auto-generated payment slips, physical receipt verification, and admin undo.
- **Design Library Route:** In progress, including My Designs, draft-to-publish publishing, automated appropriateness screening, admin override, and Print Ready instant quoting.
- **Admin Routes:** Pending, including in-context MMF administration and `/admin/mmf-overrides`.
- **Auth Route:** Pending, including mandatory email verification before print request submission.

## Product Rules
- Guests may upload/configure models and view calculated quotes without logging in.
- Print request submission requires login and verified email.
- Custom design request submission requires login.
- A print request must not be submitted without a successful quote.
- Users must accept Terms and Conditions before final print request submission, and the final confirmation step must show the quote, material, quality, and other important details.
- Quote calculation must be slicer-based and must include validated print time, filament usage, and pricing.
- The quote route includes an interactive WebGL 3D model viewer for `.stl`, `.obj`, and `.3mf` uploads so users can inspect geometry, orientation, and scale before calculating a quote.
- The system provides specific pre-flight warnings using PrusaSlicer output (e.g., long print time, model size near printer limits, and material-specific TPU/PETG warnings).
- Quote data should persist through login using backend quote records with short-lived quote tokens.
- Submitted print requests must store a quote snapshot so later pricing changes do not silently affect them.
- Print request status should be shown as a visual stepper/timeline with the main stages: Submitted, Awaiting Payment, Payment Verified, Printing, and Completed.
- Payment slips are auto-generated with university/lab branding, itemized costs, reference numbers, and signature lines; payment verification relies on in-person physical receipt checking by admins (no client upload).
- "Print Ready" library designs offer instant quoting using secure, backend-cached files.
- Users can manage uploaded designs in My Designs / Creator Dashboard states such as Draft, Screening, Auto Approved, Needs Admin Review, Auto Rejected, Admin Approved, Admin Rejected, and Hidden; rejected designs stay visible to the owner with feedback.
- Users can save library submissions as drafts before publishing. Publishing runs automated appropriateness screening before public visibility decisions.
- Design Library screening should combine auditable local rules with AI moderation for metadata, filenames, thumbnails, and generated 3D model renders when practical.
- Automated screening may auto-approve low-risk content, auto-reject clearly prohibited content, or route uncertain submissions to admin review. Admins must be able to view, override, approve, reject, hide, restore, and manage these decisions.
- Content approval only controls public Design Library visibility. Print Ready approval is separate and remains stricter because it allows Instant Quote from an admin-verified file.
- Replacing the model file on an approved design returns it to screening/review, removes public visibility until re-approved, and clears Print Ready status until the file is reverified.
- Automated and admin moderation decisions should be auditable with stored flags, summaries, feedback, status transitions, and actor/timestamp history.
- MyMiniFactory designs marked "Needs Review" are not hosted on UniFab; instead, an outbound link directs users to the source.
- Admins manage MyMiniFactory designs in context from Design Library detail pages using admin-only actions such as Pin, Hide, Add/Edit Client Note, Mark as Print Ready, and editing other override fields already supported by the backend. Print Ready marking should warn admins to verify the design locally first and should map files through the MMF API when possible instead of requiring manual upload or manual local-file linking.
- `/admin/mmf-overrides` is a dashboard for viewing and editing existing MMF overrides, with a redirect button back to the Design Library for finding new MMF designs to manage.
- Local designs may use categories/tags for filtering and organization.
- Printer information is managed by admins and may be shown publicly to clients. Printer selection must not affect quote generation or request submission in the current scope.
- System status can be monitored by admins only.
- Website/content management is approved but secondary to the core quote and request workflow.

## Commands
- **Backend install:** `cd backend && npm install`
- **Backend dev:** `cd backend && npm run dev`
- **Backend start:** `cd backend && npm start`
- **Frontend install:** `cd frontend && npm install`
- **Frontend dev:** `cd frontend && npm run dev`
- **Frontend build:** `cd frontend && npm run build`
- **Frontend lint:** `cd frontend && npm run lint`

## Implementation Priorities
1. Stabilize authentication and protected-route behavior (including email verification and Terms & Conditions acceptance).
2. Maintain the completed public quote route: quote-token persistence, Interactive 3D Model Viewer, and specific slicer-based pre-flight warnings.
3. Require a valid successful quote before print request submission.
4. Maintain the completed print request route: Terms acceptance, final confirmation, visual status timeline, auto payment slips, physical receipt verification, and admin undo.
5. Build admin workflows for pricing, materials (rich specs), slicer profiles, print requests, and design requests.
6. Continue Design Library enhancements: Creator Dashboard / My Designs, sectioned upload form, automated appropriateness screening, admin moderation/override, separate Print Ready review, audit trail, and MyMiniFactory direct file mapping.
7. Build pending admin workflows for in-context MMF management and the `/admin/mmf-overrides` dashboard.
8. Support additional features including local design categories/tags, printer information management, system status healthchecks, and admin dashboard sorting/filtering.
9. Add supporting features such as website/content management (including DFM guidelines).

## Backend Guidance
- Keep quote generation fully backend-controlled.
- Never let clients submit raw slicer flags, slicer executable paths, or profile file paths.
- Validate upload type, size, and request body fields before processing.
- Store server-managed quote snapshots for traceability.
- Keep pricing, material, profile, and design snapshots attached to submitted requests.
- Enforce role-based access on admin routes.
- Record status history for request lifecycle changes.
- Allow admins to undo the last print request status update when an operational mistake is made.
- Clean up temporary files after quote expiration, failed validation, or failed processing.
- Treat MyMiniFactory API access as backend-only; never expose API keys to the frontend.
- Keep automated Design Library moderation explainable and reviewable; do not hide the reason a design was auto-approved, auto-rejected, flagged, hidden, or restored.

## Frontend Guidance
- Clearly separate "View Quote" from "Submit Print Request".
- Make it obvious that quote viewing does not require login.
- Disable submission until a successful quote exists.
- Keep the print request submit action disabled until Terms and Conditions are accepted.
- Show a final confirmation page before submission with quote, material, quality, and other important details.
- Preserve quote token when redirecting unauthenticated users to login.
- Restore the quote after login when possible.
- Show clear user messages for failed slicing, missing profiles, unavailable materials, expired quotes, and unsupported files.
- Show specific pre-flight warnings from slicer metrics rather than generic warnings.
- Use a stepper/timeline for print request statuses instead of plain text.
- Distinguish local designs, MyMiniFactory designs needing review, ready-to-print designs, and unavailable designs.
- Distinguish content-approved designs from Print Ready designs; public visibility does not automatically mean a file is verified for instant quoting.
- Keep rejected or auto-rejected user designs visible to the owner with moderation/admin feedback when policy allows.
- Show admins moderation flags, AI/rule results, owner, submitted date, file previews/renders, and override controls for client-uploaded designs.
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
