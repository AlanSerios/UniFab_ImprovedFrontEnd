# UniFab

UniFab is a university 3D printing service web app for the USTP-CDO Fabrication Laboratory. It lets users upload or select 3D designs, generate slicer-based quotes, submit print requests, request custom designs, and track request progress. Lab administrators use the system to manage pricing, materials, slicer profiles, design readiness, requests, and public website content.

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
| Quote Route | Complete | Interactive 3D model viewer and specific slicer-based pre-flight warnings are part of the approved flow. |
| Print Request Route | Complete | Terms acceptance, final confirmation, visual status timeline, auto-generated payment slip, physical receipt verification, and admin undo are part of the approved flow. |
| Design Library Route | In Progress | My Designs, draft-to-publish publishing, automated appropriateness screening, admin override, and Print Ready instant quoting are in the active workflow. |
| Admin Routes | Pending | In-context MMF administration and `/admin/mmf-overrides` are pending admin workflows. |
| Auth Route | Pending | Mandatory email verification is pending and must block print request submission for unverified users. |

### In Scope

- Public quote calculation without login.
- Authenticated print request submission with Terms & Conditions acceptance.
- Backend quote persistence through short-lived quote records/tokens.
- Slicer-based quote calculation using PrusaSlicer-generated G-code.
- Interactive WebGL model preview for `.stl`, `.obj`, and `.3mf` uploads before quote calculation.
- Specific pre-flight warnings based on PrusaSlicer output, including long print time, model size near printer limits, and material-specific TPU/PETG warnings.
- Material and slicer profile management (including rich material specs).
- Admin-managed pricing configuration.
- Client request history and visual request status tracking.
- Automated payment slip generation and physical in-person receipt verification.
- Design library using local admin designs, user-submitted designs with automated appropriateness screening, and MyMiniFactory results.
- "Print Ready" instant quoting for verified library designs.
- Creator Dashboard / My Designs management for draft, screening, auto-approved, needs-admin-review, auto-rejected, admin-approved, admin-rejected, and hidden user designs.
- Rules + AI moderation for client-uploaded design metadata, filenames, thumbnails, and generated model renders when practical.
- Admin override and audit history for automated Design Library decisions.
- Admin readiness control for MyMiniFactory designs through in-context Design Library actions, MMF API file mapping when possible, and the `/admin/mmf-overrides` dashboard for existing overrides.
- Custom design requests with reference file uploads.
- Local design categories/tags for filtering.
- Printer information display.
- Mandatory email verification for registered users before they can submit print requests.
- Admin dashboard sorting and filtering.
- Website/content management for homepage content, contact details, images, lab hours, and service notices.

### Out of Scope for the Current Version

- Full e-commerce checkout.
- Online payment gateway integration.
- Public seller/vendor accounts.
- Shipping and delivery logistics.
- Multi-vendor fulfillment.
- Designer marketplace or designer portal.
- Client-controlled printer selection affecting quotes.
- Cart or batch checkout unless approved later as a separate enhancement.
- Promo codes.

## User Roles

| Role | Capabilities |
|---|---|
| Guest | Browse public pages, search the design library, upload a model, configure print settings, and view a quote. |
| Client | Submit print requests after email verification, submit design requests, view request history, manage uploaded designs, pay at the campus cashier, verify physical receipts in person, and track statuses. |
| Admin | Manage pricing, materials, slicer profiles, printer information, design library, design readiness, print requests, design requests, and website content. |

## Approved Workflow Rules

1. Guests can view calculated quotes without logging in.
2. Print request submission requires login and verified email.
3. Custom design request submission requires login.
4. A print request cannot be submitted without a successful quote.
5. Quote calculation must be based on validated PrusaSlicer output.
6. Users must accept Terms & Conditions before final print request submission.
7. A final confirmation page must show the quote, material, quality, and other important details before submission.
8. If slicing fails, the user must revise the file/settings or use the custom design/request-for-review path.
9. Quote data should persist through login using backend quote records and short-lived quote tokens.
10. Submitted print requests must keep quote snapshots to avoid unexpected changes after admin pricing updates.
11. Admin-confirmed cost is authoritative after review.
12. Payment verification is based on physical receipt checking at the FabLab; the system does not use client receipt upload.
13. MyMiniFactory designs are not automatically ready for printing.
14. Only admin-approved MyMiniFactory designs can proceed to direct print submission. Direct MMF quoting must use an admin-linked local printable file so PrusaSlicer remains the source of quote metrics.
15. Client-uploaded library designs should pass automated appropriateness screening before public visibility decisions.
16. Automated screening may auto-approve low-risk content, auto-reject clearly prohibited content, or route uncertain submissions to admin review.
17. Admins can view, override, approve, reject, hide, restore, and manage automated library decisions.
18. Content approval controls public visibility only; Print Ready approval is separate and required for Instant Quote.
19. Local designs can support categories/tags, but tags are not required for the core request workflow.
20. Printer information can be displayed to users, but printer/profile selection remains backend/admin-controlled.
21. Website/content management is approved, but it is secondary to the core quote and request workflow.

## Main Client Workflows

### 1. Upload File and View Quote

1. User opens the quote/upload page.
2. User uploads a supported model file: `.stl`, `.obj`, or `.3mf`.
3. User chooses material, print quality, infill, and quantity.
4. Backend validates the file and settings.
5. Backend resolves the active material and active slicer profile.
6. Backend runs PrusaSlicer CLI.
7. Backend parses generated G-code for print time, filament weight, and filament length.
8. Backend calculates the estimated price using current pricing configuration.
9. Backend analyzes slicer data and displays specific pre-flight warnings, such as long print time, model size near printer limits, and material-specific TPU/PETG warnings.
10. Backend stores a temporary quote record and returns a quote token.
11. User views the quote in an interactive 3D viewer without needing to log in.

### 2. Submit Print Request

1. User reviews a successful quote.
2. User clicks submit.
3. If unauthenticated, the user is redirected to login with the quote token preserved.
4. After login, the frontend restores the quote from the backend.
5. User accepts Terms & Conditions; the submit button remains disabled until accepted.
6. User reviews a final confirmation page showing the quote, material, quality, and other important details.
7. Backend validates the quote token.
8. Backend creates a print request from the quote snapshot.
9. Request starts as `pending_review` and is shown to the client with a visual status stepper/timeline.

### 3. Search Design Library & Submit Designs

1. User opens the design library.
2. User searches or filters designs.
3. User views design details.
4. **Verified Designs:** If a design is tagged as "Print Ready," the user can click "Instant Quote" to bypass manual upload and proceed directly to quoting using the cached file.
5. **Unverified MMF Designs:** If a MyMiniFactory design needs review, the user is provided an outbound link to download it directly from MyMiniFactory, after which they can manually upload it to the quote engine.
6. **Community Submissions:** Authenticated users can manage their designs in My Designs / Creator Dashboard across Draft, Screening, Auto Approved, Needs Admin Review, Auto Rejected, Admin Approved, Admin Rejected, and Hidden states.
7. Users can save designs as drafts before publishing. Publishing runs automated appropriateness screening using local rules plus AI moderation.
8. Screening checks metadata, filenames, license/ownership confirmation, policy acknowledgement, thumbnails, and generated 3D model renders when practical.
9. Screening can auto-approve low-risk designs, auto-reject clearly prohibited designs, or send uncertain designs to admin review.
10. Rejected designs remain visible to the owner with moderation/admin feedback when policy allows.
11. If an approved design is edited and the model file is replaced, it returns to screening/review, is hidden from the public library until approved again, and loses Print Ready status until the file is reverified.

### 4. Request Custom Design

1. User opens the custom design request form.
2. User must log in before submission.
3. User submits object details, dimensions, preferred material, intended use, quantity, and reference files.
4. Admin reviews the request.
5. Admin updates the design request status and notes.
6. If the request produces a printable design, admin may convert it into a local design or support a linked print request.

### 5. Track Requests and Verify Payment

1. Client opens request history and uses the visual order status timeline.
2. Client views request status, reference number, quote/confirmed cost, and status history.
3. After admin approval, the system automatically generates a viewable/printable payment slip.
4. Client pays in person at the designated university cashier.
5. Client presents the physical receipt to lab staff during operational hours.
6. Admin manually marks the request as `payment_verified` in the system.
7. Admins can undo the last status update when an accidental operational update needs correction.

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
- Set material cost per gram.
- Upload `.ini` slicer profiles.
- Maintain profile versions for material-quality combinations.

A quote cannot be calculated unless an active material and active slicer profile exist for the selected material-quality pair.

### Print Request Management

Admins review submitted requests, confirm feasibility, set confirmed cost, and issue payment slips (which the system auto-generates).

When a client presents a physical receipt, admins verify it in-person and manually update the request status to `payment_verified`. Admins can undo accidental status changes.

Admin dashboards support sorting and filtering for efficient request management.

Rejected print requests can be archived to remove them from the active admin queue. Archived rejected print requests may be permanently deleted afterward as an admin cleanup action.

### Design Request Management

Admins review custom design requests, inspect reference files, update request status, and add admin notes.

Rejected design requests can be archived to remove them from the active admin queue. Archived rejected design requests may be permanently deleted only when no print requests still reference them.

### Design Library Management

Admins manage:

- Local designs
- Local design categories and tags
- User-submitted community designs, including automated screening decisions, admin overrides, feedback notes, file previews/renders, and audit history
- MyMiniFactory design overrides through in-context Design Library admin actions and the `/admin/mmf-overrides` dashboard.

**Client-uploaded Design Moderation:** Published user designs run through automated appropriateness screening before public visibility. The screening pipeline combines auditable local rules with AI moderation for text metadata, filenames, thumbnails, and generated 3D model renders when practical. The system can auto-approve low-risk content, auto-reject clearly prohibited content, or send uncertain submissions to admin review. Admins remain able to view all decisions and override them by approving, rejecting, hiding, restoring, or sending a design back to review.

Content approval and Print Ready approval are separate. Content-approved designs may appear in the public library, but only Print Ready designs use an admin-verified file for Instant Quote.

**MyMiniFactory Workflow:** Admins can browse the public Design Library like users. MMF detail pages show an admin-only toolbar with actions such as Pin, Hide, Add/Edit Client Note, Mark as Print Ready, and editing other override fields already supported by the backend. When marking an MMF design as Print Ready, the system should warn admins to verify the design locally first. The system should map files through the MMF API when possible instead of requiring manual upload or manual local-file linking.

The `/admin/mmf-overrides` page is a dashboard for viewing and editing existing MMF overrides. It should include a button that redirects admins to the Design Library to find new MMF designs to manage.

Unavailable local designs can be archived to hide them from the default admin list. Archived unavailable local designs may be permanently deleted only when no print requests or design requests still reference them.

Recommended MyMiniFactory readiness statuses:

| Status | Behavior |
|---|---|
| `not_reviewed` | Visible, but cannot be submitted directly for printing. |
| `ready_for_printing` | Can proceed to quote/request flow only when linked to an active local printable file. |
| `not_printable` | Visible as unavailable or blocked from submission. |
| `hidden` | Excluded from client-facing results. |

### Printer Information

Admins manage the list of available printers (including technology, build volume, and supported materials). This information can be displayed publicly. Printer selection does not affect client quote generation or request submission in the current scope.

### System Status

The system provides a health check endpoint to monitor API and database latency/uptime, viewable on the frontend by admins only.

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
| `payment_slip_issued` | Confirmed cost and payment slip have been issued; client should pay at the campus cashier and verify the physical receipt in person. |
| `payment_verified` | Admin has verified the physical receipt in person. |
| `printing` | Print job is in progress. |
| `completed` | Print job is finished. |
| `rejected` | Request was declined. |

### Design Request Statuses

| Status | Meaning |
|---|---|
| `pending` | Request has been submitted. |
| `under_review` | Admin is reviewing the request. |
| `approved` | Admin accepted the request for design work. |
| `rejected` | Admin declined the request. |
| `completed` | Design request has been completed or resolved. |

### Library Design States

| State | Meaning |
|---|---|
| `draft` | Owner is still preparing the design; it is not public and has not entered admin review. |
| `screening` | Owner published the design and automated appropriateness checks are running. |
| `auto_approved` | Automated screening found low risk; design is visible publicly but is not automatically Print Ready. |
| `needs_admin_review` | Automated screening found uncertainty or risk; design is hidden until an admin decides. |
| `auto_rejected` | Automated screening found a clear policy issue; design stays visible to the owner with feedback when policy allows. |
| `admin_approved` | Admin approved the design for public visibility. |
| `admin_rejected` | Admin rejected the design; it remains visible to the owner with admin feedback when policy allows. |
| `hidden` | Admin removed the design from public browsing after approval. |

If an approved design is edited and its model file is replaced, it returns to screening/review, is hidden from the public library until approved again, and loses Print Ready status until the file is reverified.

### Design Moderation Records

Automated and admin moderation decisions should preserve:

- Decision source: rules, AI, render moderation, or admin.
- Moderation flags, severity, summary, and matched policy categories.
- Admin feedback shown to the owner when applicable.
- Status transitions with actor and timestamp.
- Whether the design is content-approved, hidden, or Print Ready.

## Important Data Snapshots

Submitted print requests should preserve quote-related data so requests remain traceable after pricing/profile changes.

Recommended quote snapshot fields:

- Quote token or quote ID
- Source type
- File or design source reference
- Material
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
npm run dev
```

The backend runs on `http://localhost:5000` by default.

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
- MyMiniFactory API settings
- PrusaSlicer executable path
- Design Library AI moderation:
  - `DESIGN_AI_MODERATION_ENABLED=false`
  - `OPENAI_API_KEY=`
  - `OPENAI_MODERATION_MODEL=omni-moderation-latest`

Do not commit real production secrets.

## Verification

Use these checks when changing the app:

```bash
cd frontend
npm run lint
npm run build
```

Backend currently has no test script defined. Verify backend changes manually through API behavior until automated tests are added.

## Development Notes

- Keep quote viewing and request submission separate.
- Keep user-facing workflows simple and guided.
- Keep admin workflows focused on operational tasks.
- Prefer backend-controlled validation for anything related to pricing, slicing, profiles, uploads, and permissions.
- Update this README and `AGENTS.md` when approved workflow decisions change.
