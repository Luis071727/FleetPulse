# Feature Specification: Phase 1 UI Polish

**Feature Branch**: `002-ui-polish-phase1`  
**Created**: 2026-03-18  
**Status**: Draft  
**Input**: User description: "Polish UI: replace emojis with icons, add load/invoice buttons, manual carrier entry form, scaffold coming-soon integrations"

---

## Clarifications

### Session 2026-03-18

- Q: Should the system enforce DOT uniqueness to prevent duplicate carrier records when entering manually? → A: Yes — block the add, show an error that a carrier with this DOT already exists, and link to the existing record.
- Q: Should the icon replacement scope include the carrier portal pages or only the dispatcher Command Center? → A: Replace icons everywhere — both dispatcher Command Center and carrier portal.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Replace Emojis with SVG Icons (Priority: P1)

A dispatcher navigates the Command Center and sees consistent, professional SVG icons throughout the interface instead of browser-rendered emoji characters. All navigation items, status indicators, close buttons, and decorative symbols use a unified icon set that renders identically across all operating systems and browsers.

**Why this priority**: Emojis render differently on Windows, macOS, iOS, and Android — producing an inconsistent, unprofessional appearance. This is the most visually impactful change and affects every page.

**Independent Test**: Can be fully tested by loading any dispatcher page and visually confirming that no emoji characters remain in the sidebar, headers, modals, or status badges.

**Acceptance Scenarios**:

1. **Given** the dispatcher opens the Command Center sidebar, **When** the page loads, **Then** all five navigation items (Dashboard, Carriers, Loads, Invoices, Insurance IQ) display inline SVG icons instead of emoji characters.
2. **Given** the dispatcher views any page with a close button (carrier drawer, modals), **When** the close button renders, **Then** it displays an SVG "X" icon instead of the Unicode ✕ character.
3. **Given** the dispatcher views the sidebar header, **When** the page loads, **Then** the FleetPulse logo area uses an SVG bolt icon instead of the ⚡ emoji.
4. **Given** the dispatcher opens the mobile hamburger menu, **When** the button renders, **Then** it uses an SVG menu icon instead of the Unicode ☰ character.
5. **Given** the dispatcher views the invoice list, **When** an overdue invoice is displayed, **Then** the warning indicator uses an SVG alert-triangle icon instead of the ⚠ emoji.
6. **Given** the dispatcher loads any page on Windows, macOS, or a mobile browser, **When** comparing the rendered icons side-by-side, **Then** every icon appears identical across platforms.

---

### User Story 2 — Add Load Button on Loads Page (Priority: P2)

A dispatcher viewing the Loads page sees a prominent "Add Load" button in the page header area. Clicking it opens a modal where the dispatcher can log a new load by selecting a carrier, entering broker info, rate, origin, destination, and other load details — without needing to navigate to a carrier's detail drawer first.

**Why this priority**: Currently load creation is buried inside the carrier detail flow. A top-level entry point on the Loads page reduces friction and matches standard dispatcher workflows where the load arrives first and the carrier is assigned second.

**Independent Test**: Can be tested by navigating to the Loads page, clicking "Add Load," filling out the form, submitting, and confirming the new load appears in the list.

**Acceptance Scenarios**:

1. **Given** the dispatcher is on the Loads page, **When** the page renders, **Then** an "Add Load" button is visible in the page header area.
2. **Given** the dispatcher clicks "Add Load," **When** the modal opens, **Then** it contains a carrier selector (dropdown or search of existing carriers), broker field, rate, origin, destination, and all current LogLoadModal fields.
3. **Given** the dispatcher fills out the load form and submits, **When** the submission succeeds, **Then** the new load appears in the Loads list and the modal closes.
4. **Given** the dispatcher submits the load form with missing required fields, **When** validation runs, **Then** the form shows inline field-level error messages and does not submit.

---

### User Story 3 — Add Invoice Button on Invoices Page (Priority: P2)

A dispatcher viewing the Invoices page sees a prominent "Add Invoice" button in the page header. Clicking it opens a modal to manually create an invoice by selecting an existing load (or entering load reference details), setting due date, amount, and broker — separate from the auto-generated invoice flow.

**Why this priority**: Auto-generation covers the common case, but dispatchers sometimes need to create invoices for loads entered outside the system, adjustments, or accessorial charges. A manual entry point provides needed flexibility.

**Independent Test**: Can be tested by navigating to the Invoices page, clicking "Add Invoice," filling out the form, submitting, and confirming the new invoice appears in the list.

**Acceptance Scenarios**:

1. **Given** the dispatcher is on the Invoices page, **When** the page renders, **Then** an "Add Invoice" button is visible in the page header area.
2. **Given** the dispatcher clicks "Add Invoice," **When** the modal opens, **Then** it contains fields for: carrier, broker, amount, issue date, due date, and an optional load reference.
3. **Given** the dispatcher fills out the invoice form and submits, **When** the submission succeeds, **Then** the new invoice appears in the Invoices list and the modal closes.
4. **Given** the auto-generated invoice flow still exists, **When** a load is created, **Then** auto-invoicing still creates an invoice automatically (existing behavior is preserved).

---

### User Story 4 — Manual Carrier Entry After Failed FMCSA Lookup (Priority: P3)

A dispatcher enters a DOT number that does not return results from FMCSA, or the FMCSA service is unavailable. Instead of being blocked, the dispatcher is presented with a manual entry form to type in the carrier's legal name, MC number, physical address, phone number, and power unit count. The carrier is added to the roster with a visual indicator showing that FMCSA verification is pending.

**Why this priority**: New carriers, recently registered entities, or FMCSA service outages currently block the dispatcher entirely. Manual entry ensures the dispatcher can always onboard a carrier and continue working.

**Independent Test**: Can be tested by entering a bogus DOT number (e.g., 9999999), confirming the FMCSA lookup fails, clicking "Enter Manually," filling out the form, and confirming the carrier is added with a "Not Verified" badge.

**Acceptance Scenarios**:

1. **Given** the dispatcher enters a DOT number and FMCSA lookup returns no match, **When** the error appears, **Then** a clearly labeled "Enter Manually" option is presented alongside the error message.
2. **Given** the dispatcher clicks "Enter Manually," **When** the manual form appears, **Then** it contains fields for: legal name (required), MC number, DOT number (pre-filled), physical address, phone number, and power units.
3. **Given** the dispatcher fills out the manual form and submits, **When** the carrier is created, **Then** it appears on the carrier roster with a visual "Not Verified" or "Pending Verification" badge.
4. **Given** a manually-entered carrier exists on the roster, **When** its DOT number later matches a valid FMCSA record (e.g., on a subsequent lookup or background re-check), **Then** the system can update the carrier's data and remove the unverified badge. *(Deferred: Re-verification logic is out of scope for this iteration. The `verification_status` field is stored so re-verification can be implemented in a future iteration without schema changes.)*
5. **Given** the FMCSA service is unreachable (network error), **When** the lookup times out, **Then** the same "Enter Manually" option is presented.

---

### User Story 5 — Scaffold Coming-Soon Integration Placeholders (Priority: P3)

The dispatcher explores sections of the app that will eventually connect to external services (ELD/Terminal API, MVR/Embark Safety, Stripe billing, Twilio SMS, SendGrid email). Each of these areas displays a professional "Coming Soon" placeholder that communicates the future capability, shows a relevant icon, and provides a brief description — rather than an empty page or missing link.

**Why this priority**: Scaffolding communicates the product roadmap to users, prevents confusion from blank pages, and ensures the UI structure is in place so that wiring real integrations later requires only swapping the placeholder content.

**Independent Test**: Can be tested by navigating to the Insurance IQ page and any area referencing ELD, billing, or notifications, and confirming each shows a styled placeholder card instead of broken or empty content.

**Acceptance Scenarios**:

1. **Given** the dispatcher opens the Insurance IQ page, **When** sections for IRS scoring, MVR pulls, and DataQs challenges render, **Then** each shows a "Coming in Phase 2" placeholder card with an icon and one-line description of the feature.
2. **Given** the dispatcher looks for ELD/HOS monitoring references, **When** any ELD-related UI element renders, **Then** it shows a "Coming in Phase 3" placeholder.
3. **Given** the dispatcher looks for billing or subscription management, **When** any Stripe-related section renders, **Then** it shows a "Coming in Phase 4" placeholder.
4. **Given** each placeholder card is displayed, **When** inspecting the code, **Then** the card is implemented as a reusable component that accepts a title, description, phase label, and icon — so it can be swapped for real content later without restructuring the page.

---

### Edge Cases

- What happens if the browser has cached old emoji-based markup? The new SVG icons load on next navigation or hard refresh; no migration needed.
- What happens if a dispatcher creates an invoice manually and then a load auto-generates another invoice for the same load? The system allows both to exist; manual invoices are standalone records.
- What happens if a manually-entered carrier has a DOT number that later conflicts with a different carrier's FMCSA data? The manual carrier retains its unverified badge; no automatic merge occurs without dispatcher action.
- What happens if the dispatcher dismisses the "Enter Manually" option and re-enters the same DOT? The lookup runs again and the manual option reappears on failure.

---

## Requirements *(mandatory)*

### Functional Requirements

**Icon System**

- **FR-001**: The application MUST replace all emoji characters (📊, 🚛, 📦, 💰, 🛡️, ⚡, ☰, ✕, ⚠) with inline SVG icons that render identically across operating systems. This applies to both the dispatcher Command Center and the carrier portal.
- **FR-002**: The icon set MUST be implemented as lightweight inline SVGs within the codebase (no external icon font or CDN dependency) to maintain the project's zero-external-UI-dependency posture.
- **FR-003**: Each icon MUST inherit the current text color via `currentColor` so it adapts to active/inactive/hover states defined in the existing CSS design system.

**Add Load Flow**

- **FR-004**: The Loads page MUST display an "Add Load" button in its header area.
- **FR-005**: Clicking the "Add Load" button MUST open a modal containing: carrier selector, broker name/MC, rate, origin, destination, and any other fields currently in LogLoadModal.
- **FR-006**: The carrier selector in the Add Load modal MUST allow the dispatcher to search and select from existing carriers in their roster.
- **FR-007**: Successful load submission from the Loads page MUST produce the same backend result (load created, auto-invoice generated) as the existing carrier-detail-drawer flow.

**Add Invoice Flow**

- **FR-008**: The Invoices page MUST display an "Add Invoice" button in its header area.
- **FR-009**: Clicking the "Add Invoice" button MUST open a modal containing fields for: carrier, broker, amount, issue date, due date, and an optional load reference.
- **FR-010**: Manual invoice creation MUST NOT interfere with the existing auto-invoice generation triggered by load creation.

**Manual Carrier Entry**

- **FR-011**: When an FMCSA lookup returns no results or fails due to a service error, the Add Carrier modal MUST present an "Enter Manually" action.
- **FR-012**: The manual entry form MUST include: legal name (required), MC number (optional), DOT number (pre-filled from lookup attempt), physical address (optional), phone number (optional), and power unit count (optional).
- **FR-013**: Carriers created via manual entry MUST be stored with a verification status field indicating they are unverified.
- **FR-013a**: The system MUST enforce DOT number uniqueness across all carriers (verified and unverified). If a carrier with the same DOT already exists, the manual entry form MUST block submission and display a link to the existing carrier record.
- **FR-014**: Unverified carriers MUST display a visible "Not Verified" badge on the carrier roster and detail views.

**Coming-Soon Scaffolding**

- **FR-015**: A reusable "Coming Soon" placeholder component MUST be created, accepting props for: title, description, phase label, and icon.
- **FR-016**: The Insurance IQ page MUST display Coming Soon placeholders for: IRS Scoring, MVR Driver Reports, and DataQs Challenges (Phase 2 features).
- **FR-017**: If any ELD or HOS monitoring UI references exist in the current codebase, they MUST display a Coming Soon placeholder labeled "Phase 3." *(Note: No ELD page currently exists — this requirement is conditional and deferred until an ELD nav entry is added.)*
- **FR-018**: If any billing or subscription management UI references exist in the current codebase, they MUST display a Coming Soon placeholder labeled "Phase 4." *(Note: No billing page currently exists — this requirement is conditional and deferred until a billing nav entry is added.)*

### Key Entities

- **Carrier**: Gains a new `verification_status` attribute (values: `verified`, `unverified`) to distinguish FMCSA-confirmed carriers from manually entered ones. All other attributes remain unchanged.
- **Load**: No structural changes. The Add Load modal reuses the existing load creation flow, now accessible from the Loads page in addition to the carrier detail drawer.
- **Invoice**: No structural changes. Manual invoices are created via the same invoice entity; the optional load reference field may be null for standalone invoices.
- **Coming Soon Card**: A presentational component (not a data entity) used across pages to represent future integrations.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero emoji characters remain in the rendered application across all dispatcher pages, modals, and carrier portal views.
- **SC-002**: Icons render with no visible differences in shape, color, or alignment when comparing on Windows and macOS side by side.
- **SC-003**: A dispatcher can create a new load from the Loads page in under 60 seconds without navigating to a carrier detail view.
- **SC-004**: A dispatcher can create a manual invoice from the Invoices page in under 45 seconds.
- **SC-005**: A dispatcher can add a carrier manually when FMCSA lookup fails, completing the flow in under 90 seconds.
- **SC-006**: Every future-phase feature area (Insurance IQ sub-features, ELD, billing) displays a styled placeholder — no blank sections or broken links exist.
- **SC-007**: The existing auto-invoice and carrier-detail-drawer load-logging flows continue to function after these changes (no regressions).

---

## Assumptions

- Inline SVGs will be hand-crafted or adapted from open-source icon sets (e.g., Lucide, Heroicons) and embedded directly in the codebase. No icon library package will be added to keep the dependency footprint minimal.
- The carrier `verification_status` field will be stored in the existing in-memory backend carrier store for now and will be persisted to the database when Supabase write access is fully operational.
- Manual invoices use the same backend invoice creation endpoint as auto-generated invoices; the `load_id` field is made optional to support standalone invoices.
- Coming Soon placeholder content (descriptions, phase labels) is based on the constitution's phase definitions and can be updated without code changes by editing the placeholder component props.
- The existing LogLoadModal component will be refactored so its form logic is reusable from both the carrier detail drawer and the new top-level Add Load modal, avoiding code duplication.
