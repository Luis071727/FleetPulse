# Feature Specification: FleetPulse AI — Dispatcher MVP (Phase 1)

**Feature Branch**: `001-fleetpulse-dispatcher-mvp`  
**Created**: 2026-03-17  
**Status**: Ready for Planning  
**Phases Covered**: Phase 1 (Weeks 1–7)

## Clarifications

### Session 2026-03-17

- Q: What drives a carrier's status (Active, Idle, Issues) on the roster? → A: System auto-computes based on load activity and system alerts: Active when load exists in last 30 days; Idle when no load activity in 60+ days; Issues when invoice outstanding 30+ days OR CSA/MVR alert triggered.
- Q: When does an invoice record first appear in the system? → A: Automatically when the load is created (logged). Invoice is created as a peer record to the load at log time, ensuring the Invoice Tracker always reflects the current load portfolio.
- Q: How are CSA BASIC scores populated into the system for Phase 2? → A: On-demand pull from FMCSA when IRS calculation runs; cache result for 30 days before re-pulling. Mirrors the existing Phase 1 FMCSA lookup pattern (FR-006, FR-007) and keeps CSA data reasonably fresh.
- Q: How is the carrier portal accessed? → A: Path-based route on the same app domain with shared auth session. Next.js App Router route groups (e.g., `app/(portal)/accept-invite`) do NOT create URL segments. The carrier magic link routes to `/accept-invite?token=...` at the root domain. See FR-032a for implementation details.
- Q: What is the default trust score for a first-seen broker? → A: Compute from FMCSA authority fields (authority status 70%, operating history 30%); typical initial score lands in 55–65 range. Display "Score based on FMCSA data only" inline, setting dispatcher expectation that payment data will refine the score.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Dispatcher Adds a Carrier via DOT Number (Priority: P1)

A dispatcher signs up, lands on the Carrier Roster, and adds their first carrier by typing a DOT number. The system automatically retrieves the carrier's legal name, MC number, safety rating, and power unit count from the federal FMCSA database and pre-fills the form. The dispatcher confirms the details, and the new carrier card appears immediately on the roster with all FMCSA-sourced data visible.

**Why this priority**: This is the Phase 1 gate — no other feature works without at least one carrier in the system. It also demonstrates the core FMCSA integration value proposition in under 60 seconds.

**Independent Test**: Can be fully tested by signing up as a dispatcher, opening the Add Carrier modal, entering DOT# 3812044, and verifying that the carrier card for "Rodriguez Trucking" appears on the roster with correct legal name and MC number.

**Acceptance Scenarios**:

1. **Given** a new dispatcher account exists, **When** the dispatcher enters DOT# 3812044 in the Add Carrier modal, **Then** the system retrieves and pre-fills the carrier's legal name, MC number, power unit count, and safety rating without manual entry.
2. **Given** a carrier's FMCSA data was already retrieved today, **When** the same DOT# is queried again, **Then** the system returns the cached result instantly without calling the external FMCSA service again.
3. **Given** a dispatcher enters a DOT# that does not exist in the federal database, **When** the lookup completes, **Then** an inline error message reads "DOT# not found in FMCSA database" and the Add Carrier button remains disabled.
4. **Given** valid FMCSA data is loaded, **When** the dispatcher submits the form, **Then** the carrier card appears on the roster without a page reload and the detail drawer opens for the new carrier.

---

### User Story 2 — Dispatcher Views and Filters the Carrier Roster (Priority: P2)

A dispatcher with multiple carriers on file opens the roster page and sees a card grid summarizing each carrier's outstanding accounts receivable, Insurance Readiness Score, and upcoming renewal date. The dispatcher uses the search bar and status filter chips to narrow the list to carriers with issues, then clicks a card to open the detail drawer and review the full insurance sub-score breakdown.

**Why this priority**: The roster is the dispatcher's daily home screen. Filtering and the detail drawer give it immediate practical value beyond a simple list.

**Independent Test**: Add at least three carriers, then verify that typing a carrier name in the search box filters the visible cards and that clicking a card opens the detail drawer with fleet overview and IRS sub-scores.

**Acceptance Scenarios**:

1. **Given** seven carriers exist, **When** the dispatcher types "Rodriguez" in the search bar, **Then** only cards whose name, MC#, or DOT# include "Rodriguez" are shown.
2. **Given** the roster is open, **When** the dispatcher selects the "Issues" filter chip, **Then** only carriers with at-risk status or overdue insurance renewals remain visible.
3. **Given** the dispatcher clicks a carrier card, **When** the detail drawer opens, **Then** it shows fleet overview KVs, portal access status, IRS score ring with sub-score bars, a four-item activity timeline, and action buttons.
4. **Given** the dispatcher switches from grid to list view using the toggle, **When** the page reloads or the user returns later, **Then** the chosen view is remembered without re-selecting.

---

### User Story 3 — Dispatcher Logs a Load and Tracks Its Invoice (Priority: P3)

A dispatcher logs a completed load by entering the route, gross rate, broker MC#, driver pay, and fuel cost. The system computes net profit and RPM live while the form is filling. After the load is saved, the dispatcher navigates to the Invoice Tracker, where the associated invoice appears sorted by urgency. When the invoice passes 30 days with no payment, it is automatically flagged red.

**Why this priority**: Load and invoice data are the financial core of the dispatcher's workflow. Without this, the AI recommendations in Week 5 have nothing to analyze.

**Independent Test**: Log one load for Rodriguez Trucking with a gross rate of $2,400, driver pay of $800, and fuel cost of $400. Verify the estimated net profit preview shows $1,200 and that the invoice appears on the Invoice Tracker tab.

**Acceptance Scenarios**:

1. **Given** the Log Load modal is open, **When** the dispatcher enters rate, driver pay, and fuel cost, **Then** the estimated net profit and rate-per-mile update in real time at the bottom of the form without submitting.
2. **Given** a broker MC# is entered, **When** the field loses focus, **Then** the system shows the broker's trust score inline; if the score is below 50 a "High-risk broker" warning appears in red.
3. **Given** a load is saved, **When** the dispatcher opens the Invoice Tracker, **Then** the new invoice row appears with the correct carrier name, broker name, invoice number, amount, and a green days badge.
4. **Given** an invoice has been outstanding for 30 or more days, **When** the Invoice Tracker is viewed, **Then** the days badge is red and the invoice is sorted to the top of the list above newer overdue invoices.
5. **Given** the dispatcher clicks "Mark Paid", **When** the action completes, **Then** the row immediately reflects paid status and moves to the bottom of the list without a full page reload; if the server call fails the row reverts.

---

### User Story 4 — Dispatcher Gets an AI Load Recommendation (Priority: P4)

A dispatcher fills in the Load Analysis form with route, miles, rate, broker MC#, and cost fields, then clicks "Analyze with AI." Within a few seconds the system returns either GO, NEGOTIATE, or PASS with a one-to-two-sentence plain-English explanation and, for NEGOTIATE decisions, a suggested target rate. High-risk broker flags appear as a visible caution chip on the result.

**Why this priority**: The AI recommendation is the primary differentiator of the product. It converts the dispatcher's existing load data into a real-time decision signal.

**Independent Test**: Enter a load with gross rate $1,800, 600 miles, driver pay $700, fuel $300, and a broker with a trust score of 45. Verify the AI returns PASS with a broker risk flag present in the result.

**Acceptance Scenarios**:

1. **Given** all required load fields are filled, **When** the dispatcher clicks "Analyze with AI", **Then** GO, NEGOTIATE, or PASS is returned with a plain-English reasoning string within 15 seconds.
2. **Given** net RPM ≥ 1.50 and broker trust score ≥ 70, **When** analysis completes, **Then** the recommendation is GO with a green badge.
3. **Given** net RPM < 1.00 or broker trust score < 50, **When** analysis completes, **Then** the recommendation is PASS with a red badge and no negotiation target is shown.
4. **Given** the AI service is unavailable, **When** the dispatcher clicks "Analyze with AI", **Then** an error toast reads "AI service temporarily unavailable" and the dispatcher can still use the manual net profit preview.
5. **Given** a NEGOTIATE recommendation is returned, **When** the result panel is displayed, **Then** a "Target rate: $X,XXX" tip is visible.

---

### User Story 5 — Dispatcher Drafts an Invoice Follow-up with AI (Priority: P5)

A dispatcher clicks "Draft Follow-up" on an overdue invoice row. The system determines the appropriate tone based on how many days the invoice is outstanding, generates a message draft pre-addressed to the broker, and opens a modal where the dispatcher can edit the subject and body before copying the text or marking it as sent.

**Why this priority**: Invoice follow-up is a daily pain point for dispatchers managing multiple carriers. AI-drafted messages save time and enforce professional tone escalation.

**Independent Test**: Set an invoice to 32 days outstanding, click "Draft Follow-up," and verify the modal shows a "final notice" tone badge and a pre-filled message body referencing the correct broker name and amount.

**Acceptance Scenarios**:

1. **Given** an invoice is 7–14 days outstanding, **When** the follow-up draft is generated, **Then** the tone badge reads "Polite Reminder."
2. **Given** an invoice is 30+ days outstanding, **When** the follow-up draft is generated, **Then** the tone badge reads "Final Notice" and an amber escalation note is visible below the message body.
3. **Given** the dispatcher edits the message body, **When** they click "Mark as Sent", **Then** the invoice's follow_up_count increments and the last_follow_up_at date is updated.
4. **Given** the AI returns the draft, **When** the modal opens, **Then** the subject line and body are both pre-filled and editable.

---

### User Story 6 — Carrier Accepts Portal Invite and Views Their Dashboard (Priority: P6)

A dispatcher sends a portal invite to a carrier by email. The carrier clicks the magic link, sets a password, and lands on their read-only dashboard. The overview tab shows their active loads, outstanding invoices, and their Insurance Readiness Score. A persistent read-only notice explains the dashboard origin and offers an upgrade to Pro.

**Why this priority**: This completes the Phase 1 gate by proving end-to-end user flow from dispatcher invite to carrier viewing their data.

**Independent Test**: Send an invite for Rodriguez Trucking to a test email, click the magic link, set a password, and verify the carrier's overview tab shows at least one active load and the IRS score ring.

**Acceptance Scenarios**:

1. **Given** the dispatcher clicks "Invite" on a carrier card, **When** the invite is submitted with a valid email, **Then** the carrier's portal status changes to "Invite Sent" and an email is delivered within 5 minutes.
2. **Given** a carrier clicks the magic link and sets a password, **When** the account is activated, **Then** the carrier is redirected to the portal Overview tab with their loads and invoices visible.
3. **Given** a carrier is on the free tier, **When** they attempt any write action or AI feature, **Then** the action is blocked and a message appears explaining that upgrade is required.
4. **Given** the carrier portal loads, **When** the page is viewed on a screen narrower than 720 px, **Then** the sidebar collapses, navigation converts to a tab bar, and KPI tiles stack to a single column.

---

### Edge Cases

- What happens when the FMCSA service is rate-limited or returns a 429? The system must queue the request and show a "temporarily unavailable" state rather than fail the user.
- What happens when a carrier is added with a DOT# belonging to a company that has an inactive or revoked authority status? The FMCSA data still loads, but the carrier is flagged with an "Issues" status badge.
- What happens when the dispatcher deletes a carrier? The record is soft-deleted and hidden from all views; loads and invoices associated with it remain intact in the database.
- What happens when an AI call exceeds 15 seconds? The request times out, a toast message appears, and the dispatcher can retry without losing form data.
- What happens when the CSV export is triggered with zero carriers visible (all filtered out)? The export button produces an empty CSV with the correct header row rather than an error.
- What happens when a carrier magic link is clicked after its 24-hour expiry? The page shows a clear expiry message and a button allowing the dispatcher to resend a fresh invite.
- What happens when IRS sub-score inputs are missing (e.g., no drivers enrolled)? Each missing data point uses defined default values (driver quality defaults to 50) and the overview note explains the limitation.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Authentication & Access Control

- **FR-001**: The system MUST allow a dispatcher to create an account with an email, password, full name, and company name, resulting in a new organization and a dispatcher_admin user being created together.
- **FR-002**: The system MUST issue a session token upon successful login that is required for all subsequent API calls.
- **FR-003**: The system MUST enforce role-based access so that carrier_free users cannot submit any data-modification action or access any AI feature; blocked requests MUST return a structured upgrade prompt.
- **FR-004**: The system MUST allow a dispatcher to invite a carrier by email; the invite MUST deliver a single-use activation link that expires after 24 hours.
- **FR-004a**: Activation links are single-use and MUST be consumed on successful activation. Reuse of a previously consumed link MUST return HTTP 410 GONE with message "This invite has already been used. Contact your dispatcher for a new invite." Reuse of an expired link MUST return HTTP 400 with error_code EXPIRED_TOKEN.
- **FR-005**: The system MUST allow a carrier to set their initial password via the invite link and be redirected to their portal immediately upon activation.

#### Carrier Roster

- **FR-006**: The system MUST allow a dispatcher to look up a carrier by DOT number, retrieving legal name, MC number, safety rating, power unit count, operating states, and cargo types from the federal carrier authority database.
- **FR-007**: The system MUST cache all federal carrier authority lookups for at least 24 hours so that repeated lookups for the same DOT number do not trigger additional external requests.
- **FR-007a**: The FMCSA cache MUST be invalidated when: (a) the 24-hour TTL expires, (b) the dispatcher explicitly forces a refresh via the carrier detail "Refresh FMCSA" action, or (c) a carrier is soft-deleted and re-added with the same DOT number. Stale or expired cache entries MUST be treated as cache misses and trigger a fresh FMCSA lookup.
- **FR-008**: The system MUST display each carrier in a card showing outstanding accounts receivable, Insurance Readiness Score, policy renewal date, active load summary, and portal invite status.
- **FR-009**: The system MUST allow the dispatcher to filter carriers by status (Active, Idle, Issues) and search by carrier name, MC number, or DOT number simultaneously. **Clarification**: The carrier status enum contains exactly three values: Active (load in last 30 days), Idle (no load activity 60+ days), and Issues (invoice 30+ days overdue OR CSA/MVR alert). Portal invite status (Pending, Invited, Active, Inactive) is tracked separately in the carrier.portal_status field and is NOT a filter value on the roster status chip.
- **FR-009a**: The system MUST auto-compute each carrier's status according to these rules: *Active* when the carrier has a load recorded within the last 30 days; *Idle* when no load activity exists for 60 or more days; *Issues* when any of the following are true: (a) an invoice is outstanding for 30 or more days, (b) a CSA score alert has been flagged, or (c) an MVR event with severity ≥ 1 was recorded. Status MUST be recalculated whenever load, invoice, or compliance data changes.
- **FR-010**: The system MUST persist the dispatcher's chosen list-vs-grid view preference across sessions.
- **FR-011**: The system MUST allow the dispatcher to resend a portal invite to one or all pending carriers from the roster page.

#### Load Management

- **FR-012**: The system MUST allow a dispatcher to log a load by entering the route origin and destination, miles, gross rate, broker MC number, pickup date, driver pay, and optional fuel cost and tolls.
- **FR-013**: The system MUST compute and display estimated net profit and rate-per-mile in real time as the dispatcher types cost values into the Log Load form, before the form is submitted.
- **FR-014**: The system MUST look up a broker by MC number when that field loses focus, displaying the broker's trust score inline; if trust score is below 50 a high-risk warning MUST be shown.
- **FR-014a**: For a broker seen for the first time (not yet in the brokers table), the system MUST compute an initial trust score from FMCSA authority fields only: authority status contributes 70%, operating history contributes 30%. The inline display MUST include the text "Score based on FMCSA data only" to set dispatcher expectation that this score will refine as payment history data accumulates.
- **FR-015**: The system MUST store each load with its computed net profit and RPM values.
- **FR-016**: The system MUST allow the load status to be updated to In Transit, At Pickup, Delivered, or Issues.
- **FR-016a**: The system MUST automatically create an invoice record at the moment a load is logged. The invoice MUST inherit the carrier, broker, and amount from the load and appear immediately on the Invoice Tracker tab with an issued date of today.

#### Invoice Tracking

- **FR-017**: The system MUST display all invoices sorted by days outstanding in descending order, with invoices 0–7 days shown in green, 8–21 days in amber, and 22 or more days in red.
- **FR-018**: The system MUST compute days outstanding dynamically so that no manual update is required as time passes.
- **FR-019**: The system MUST allow a dispatcher to mark an invoice as paid; the status change MUST be reflected immediately on screen and revert if the server request fails.
- **FR-019a**: The "Mark Paid" action MUST be idempotent: repeated submissions for the same invoice_id MUST produce the same result without creating duplicate state changes or incrementing counters. Similarly, invite send (FR-004), AI analyze (FR-021), and invoice follow-up draft (FR-026) MUST be safely retryable within a 60-second deduplication window using the request's natural key (invoice_id, load_id, carrier_id+email).
- **FR-020**: The system MUST display the total outstanding amount across all active invoices in the Invoice Tracker header.

#### AI Load Analysis

- **FR-021**: The system MUST accept route, miles, gross rate, broker MC number, fuel cost, and driver pay as inputs and return a GO, NEGOTIATE, or PASS recommendation with a plain-English reasoning string.
- **FR-022**: The system MUST apply the defined thresholds: GO when net RPM ≥ 1.50 and broker trust score ≥ 70; PASS when net RPM < 1.00 or trust score < 50 or fraud flags exist; NEGOTIATE otherwise.
- **FR-023**: The system MUST include a suggested negotiation target rate when the recommendation is NEGOTIATE.
- **FR-024**: The system MUST flag high-risk broker status visually when the broker's trust score is below 50.
- **FR-025**: The system MUST return a structured error response and show a user-friendly toast if the AI service is unavailable, without preventing the dispatcher from using the manual net profit preview.

#### AI Invoice Follow-up

- **FR-026**: The system MUST generate an invoice follow-up message draft calibrated to the days outstanding: polite reminder (7–14 days), firm follow-up (15–21 days), assertive with deadline (22–29 days), final notice (30+ days).
- **FR-027**: The system MUST pre-fill the follow-up draft with the broker name, invoice amount, and invoice number; both the subject line and message body MUST be editable before use.
- **FR-028**: The system MUST increment the follow-up counter and record the timestamp when the dispatcher marks a follow-up as sent.

#### Carrier Portal

- **FR-029**: The system MUST display a persistent read-only notice to carrier_free users identifying which dispatcher organization shared their dashboard.
- **FR-030**: The system MUST show carrier_free users their active loads, outstanding invoices, and IRS score, all scoped to their own data only.
- **FR-031**: The system MUST present a Pro upgrade prompt to carrier_free users on the load list and invoice list tabs.
- **FR-032**: The carrier portal MUST be usable on screens as narrow as 320 px with a single-column layout and collapsible navigation.
- **FR-032a**: The carrier portal MUST be accessed via a path-based route on the same application domain using the same auth session as the dispatcher app. The carrier accept-invite flow MUST route to `/accept-invite?token={magic_token}`. **Implementation Note**: Next.js App Router route groups (e.g., `app/(portal)/accept-invite/page.tsx`) do not create URL path segments — the actual routes will be `/accept-invite`, `/overview`, `/invoices` at the root domain level, not nested under `/portal/`. Contract tests MUST verify the actual HTTP GET paths match this behavior.

#### Insurance Readiness Score (Phase 2)

- **FR-033**: The system MUST calculate an IRS for each carrier as a weighted composite of six sub-scores: Safety Record (25%), Driver Quality (20%), Compliance (20%), Fleet Risk Profile (15%), Safety Technology (10%), and Market Readiness (10%).
- **FR-034**: The system MUST recalculate the IRS automatically after any change to the carrier's insurance profile, CSA score history, driver profiles, or MVR events.
- **FR-035**: Drivers MUST provide signed consent before any Motor Vehicle Record is pulled; the system MUST prevent MVR retrieval without a recorded consent acknowledgement.
- **FR-036**: The system MUST generate a prioritized AI improvement plan per carrier that includes an estimated projected IRS score, estimated annual insurance savings, and ranked action items with effort and timeline indicators.
- **FR-037**: The system MUST generate a formal DataQs challenge letter for a specified CSA violation, including eligibility assessment and confidence level.
- **FR-038**: The system MUST pull CSA BASIC percentile scores from the federal carrier authority on-demand when the IRS calculation is triggered, and cache the result for 30 days before re-pulling. CSA data MUST be fetched fresh if the cache is older than 30 days.

### Key Entities

- **Organization**: Represents a dispatching company. One organization owns all carriers and users within it. Has a billing plan and a payment processor subscription record.
- **User**: A person who can log in, belonging to one organization. Has one of four roles: dispatcher_admin, carrier_free, carrier_pro, or carrier_fleet. Carrier users are linked to a specific carrier record.
- **Carrier**: A trucking carrier managed by the dispatcher's organization. Holds FMCSA data, portal_status (Pending/Invited/Active/Inactive), and soft-delete state. Status (Active/Idle/Issues) is auto-computed from load activity, invoice aging, and compliance alerts and updated in real time. Note: IRS (Insurance Readiness Score) and insurance renewal details are Phase 2 features and will be added when Phase 2 is authorized.
- **Load**: A freight movement logged by a dispatcher for a specific carrier and broker. Stores rate, costs, computed net profit, RPM, and an optional AI recommendation.
- **Invoice**: An accounts-receivable record linked to a load, carrier, and broker. Tracks issuance date, due date, payment status, follow-up history, and optional AI draft.
- **Broker**: A freight broker identified by MC number. Stores FMCSA authority data, trust score, payment history patterns, and fraud flag count. Initial trust score is computed from FMCSA authority fields (authority status 70%, operating history 30%) on first encounter; payment data refines the score over time as loads are logged.
- **FMCSA Cache**: A stored snapshot of a federal carrier or broker authority record, keyed by DOT or MC number, with a timestamp used to enforce the 24-hour cache window.
- **Carrier Insurance Profile**: Per-carrier insurance metadata including all six IRS sub-scores, their inputs, the latest AI playbook, and renewal tracking data.
- **Driver Insurance Profile**: Per-driver data feeding the Driver Quality sub-score, including MVR severity events and PSP inspection history.
- **CSA Score History**: Snapshots of a carrier's FMCSA CSA BASIC percentile scores over time, used as the primary input to the Safety Record sub-score. Populated on-demand from the federal source and cached for 30 days per pull. Includes timestamp to enforce cache window.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A dispatcher can complete the full flow from account creation to the first carrier card appearing on the roster in under 3 minutes.
- **SC-002**: Carrier data appears pre-filled in the Add Carrier modal within 3 seconds of a valid DOT number being entered, and a cached hit returns in under 500 milliseconds.
- **SC-003**: An AI load recommendation is returned and displayed within 15 seconds of the dispatcher clicking "Analyze with AI" under normal service conditions.
- **SC-004**: 100% of invoices outstanding 30 or more days are displayed with a red urgency badge and sorted to the top of the Invoice Tracker without any manual dispatcher action.
- **SC-005**: A carrier can activate their portal account and view their real load data within 5 minutes of receiving the invite email.
- **SC-006**: The carrier portal is fully functional at viewport widths as small as 320 px, with no horizontal scroll or overlapping elements.
- **SC-007**: IRS scores for all carriers update automatically within 60 seconds of any change to carrier insurance data, driver records, or CSA history.
- **SC-008**: The AI Insurance Playbook returns a ranked, actionable improvement plan within 30 seconds of the dispatcher requesting it.
- **SC-009**: The system correctly enforces multi-tenant data isolation: no carrier or dispatcher can view or modify data belonging to another organization under any circumstances.
- **SC-009a**: Multi-tenant isolation MUST be enforced at the API boundary: every authenticated request MUST include the caller's organization_id (derived from JWT claims, never from request parameters), and every database query MUST be RLS-scoped to that organization_id. Contract tests MUST verify that cross-org access attempts return 404 (not 403) to prevent organization enumeration.
- **SC-010**: The total monthly infrastructure cost for the running system remains under $30 at MVP launch.
- **SC-010a**: Per-call AI cost budget: load analysis MUST average under $0.005/call, invoice follow-up under $0.008/call, and insurance playbook (Phase 2) under $0.03/call. Prompt caching MUST achieve ≥60% cache hit rate to keep total AI spend within the $30/month infrastructure target.

---

## Assumptions

- FMCSA SAFER API returns structured data in a consistent format; DOT numbers entered by dispatchers are assumed to be for US-registered carriers.
- Broker trust score during Phase 1 (Weeks 3–4) is computed from available FMCSA authority data only; payment history patterns are populated progressively as loads are logged over time.
- IRS scores default to a baseline of 50 for any sub-score category where supporting data has not yet been provided, with a visible note surfaced to the dispatcher.
- The carrier portal is English-only at launch; no internationalization is required for Phase 1 or Phase 2.
- Driver MVR consent is recorded as a boolean checkbox acknowledgement within the platform; no external e-signature service is required for Phase 2.
- ELD connectivity (Terminal API) is not available until Phase 3; fleet radius and HOS compliance fields in the IRS engine will use dispatcher-entered values as a substitute in Phase 2.
- Email delivery and payment processing service accounts will be provisioned by the product owner; credentials will be available as environment variables before the relevant sprint begins.
- Email delivery (invite links, follow-up notifications) is expected to complete within 5 minutes of the triggering API action under normal provider conditions. The system MUST NOT block the dispatcher's workflow while waiting for email delivery confirmation; invites and follow-ups are fire-and-forget from the API perspective.
- No free trial is offered; carriers must be added by a dispatcher on a paid plan before receiving a portal invite.

### Ambiguity Clarifications

- **"Instantly"** (US1 Acceptance #2, cached FMCSA lookup): Response MUST return within 500 milliseconds.
- **"Immediately"** (US3 Acceptance #5, mark-paid UI update): Frontend state MUST update within 1 second of the user action, with server confirmation following asynchronously.
- **"Temporarily unavailable"** (Edge Cases, FMCSA 429): The degraded state MUST resolve within 5 minutes; if FMCSA remains unavailable after 3 retries with exponential backoff, display a persistent "Service unavailable" banner with a manual retry button.

### Empty Result Behavior

All list endpoints (carriers, loads, invoices, brokers) MUST return a valid response envelope when zero results match the filter criteria: `{ "data": [], "meta": { "total": 0, "limit": <requested>, "offset": 0 }, "error": null }`. The frontend MUST display an appropriate empty-state message (e.g., "No carriers found. Add your first carrier to get started.") rather than an error.

### Spec-to-Contract Cross-Reference

| Spec Requirement | Contract File | Endpoint | Status Codes |
|-----------------|---------------|----------|--------------|
| FR-001 (Signup) | auth.json | POST /signup | 201, 400 |
| FR-002 (Login/Session) | auth.json | POST /login | 200, 401 |
| FR-003 (Role access) | All contracts | All endpoints | 403 |
| FR-004 (Invite) | auth.json | POST /invite/carrier | 200, 403 |
| FR-004a (Link reuse) | auth.json | POST /accept-invite | 200, 400 (410 for consumed) |
| FR-006 (DOT lookup) | carriers.json, fmcsa.json | POST /carriers, GET /fmcsa/carrier/{dot} | 201, 400, 503 |
| FR-007 (FMCSA cache) | fmcsa.json | GET /fmcsa/carrier/{dot} | 200 (cached=true) |
| FR-009 (Filter/search) | carriers.json | GET /carriers | 200 |
| FR-012 (Log load) | loads.json | POST /loads | 201, 400, 503 |
| FR-014 (Broker lookup) | brokers.json | GET /brokers/mc/{mc} | 200, 404 |
| FR-017 (Invoice list) | invoices.json | GET /invoices | 200 |
| FR-019 (Mark paid) | invoices.json | PATCH /invoices/{id} | 200, 400 |
| FR-021 (AI analysis) | ai.json | POST /ai/load/analyze | 200, 503 |
| FR-023 (Negotiate rate) | ai.json | POST /ai/load/analyze | 200 (target_rate) |
| FR-025 (AI error) | ai.json | POST /ai/load/analyze | 503 |
| FR-026 (Follow-up draft) | ai.json, invoices.json | POST /ai/invoice/followup | 200 |
| FR-030 (Carrier portal) | carriers.json | GET /carriers | 200 (RLS-scoped) |
| FR-032a (Portal routes) | auth.json | POST /accept-invite | 200 |
