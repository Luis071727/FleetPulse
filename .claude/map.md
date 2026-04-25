# FleetPulse Codebase Connection Map

Use this file before any implementation task. Find the feature area, read only those files.
Update this map after any research phase that reveals new connections.

Last updated: 2026-04-22 (Carrier compliance lifecycle: renew flow, central status engine, pending-actions sync)

---

## Global Wiring

```
Browser → services/api.ts (apiFetch) → GET/POST/PATCH/DELETE http://localhost:8000/api/v1
                                        ↓
                               app/main.py (FastAPI)
                                        ↓
                     api_v1 router → domain routers (prefix /api/v1)
                                        ↓
                              routes.py → service.py → Supabase DB
                                                      → in-memory fallback (_LOADS, _INVOICES, _CARRIERS)
```

**Auth gate (Dispatcher):**
- `services/api.ts:73` — injects `Authorization: Bearer <token>` from localStorage `fleetpulse:token`
- `services/api.ts:84` — 401 → clears auth → redirects to `/login`
- `backend/app/middleware/auth.py` — `require_dispatcher` / `require_authenticated` decorators on every route

**Auth gate (Carrier Portal):**
- `FleetPulse/middleware.ts` — Supabase session check → redirects to `/auth/login` if unauthenticated

**Response shape (all backend routes):**
```json
{ "data": <T>, "error": null | "message", "error_code": null | "CODE", "meta": { "total": N, "limit": N, "offset": N } }
```
Helper: `app/common/schemas.py` → `ok()`, `ResponseEnvelope`

---

## Feature Areas

---

### AUTH — Dispatcher Login/Signup

| Layer | File | Notes |
|-------|------|-------|
| Page (login) | `fleetpulse-dispatcher/frontend/app/(auth)/login/page.tsx` | Calls `login()` from api.ts |
| Page (signup) | `fleetpulse-dispatcher/frontend/app/(auth)/signup/page.tsx` | Calls `signup()` from api.ts |
| Page (accept-invite) | `fleetpulse-dispatcher/frontend/app/(portal)/accept-invite/page.tsx` | Carrier invite flow |
| API calls | `services/api.ts:103–129` | `login`, `signup`, `inviteCarrier`, `acceptInvite` |
| Backend route | `backend/app/auth/routes.py` | `POST /auth/login`, `/auth/signup`, `/auth/invite/carrier`, `/auth/accept-invite` |
| Backend service | `backend/app/auth/service.py` | Supabase Auth Admin API |
| Middleware | `backend/app/middleware/auth.py` | JWT decode, `CurrentUser`, role checks; fallback: if no `users` row found, looks up `carriers.user_id = sub` and builds virtual CurrentUser (covers magic-link carrier portal sessions); even when a `users` row IS found, also checks `carriers.user_id = sub` to populate `carrier_id` if not set — handles dispatcher users who are also linked to a carrier account |
| Token storage | `services/api.ts:22–36` | `getToken()`, `setToken()`, `clearAuth()` stored in localStorage `fleetpulse:token` |

**Auth flow:** Login → JWT returned → stored in localStorage → injected on every `apiFetch` call.

---

### AUTH — Carrier Portal

| Layer | File | Notes |
|-------|------|-------|
| Page | `FleetPulse/app/auth/login/page.tsx` | Supabase client-side sign-in |
| Middleware | `FleetPulse/middleware.ts` | Session guard, redirects to `/auth/login` |
| Server client | `FleetPulse/lib/supabase-server.ts` | Server-side Supabase (cookies) |
| Browser client | `FleetPulse/lib/supabase.ts` | Client-side Supabase |
| Root layout | `FleetPulse/app/layout.tsx` | Session provider wraps all pages |

---

### LOADS — Dispatcher

| Layer | File | Notes |
|-------|------|-------|
| Page | `fleetpulse-dispatcher/frontend/app/(dispatcher)/loads/page.tsx` | Summary metrics bar, search, sortable table, clickable rows → LoadDetailModal |
| Create modal | `components/LogLoadModal.tsx` | `createLoad()` → POST /loads; shown in overlay from loads page |
| **Detail modal** | `components/LoadDetailModal.tsx` | **Tabbed modal** (Load Details / Messages / AI Analysis); replaces old inline EditLoadModal |
| Details tab | `components/LoadDetailModal.tsx` | Status pill selector, route/broker/financials form, live net profit + margin, Save Changes |
| Messages tab | `components/LoadDetailModal.tsx` | Carrier↔dispatcher thread; auto-fetches on tab open; send box with Enter support |
| AI Analysis tab | `components/LoadDetailModal.tsx` | Auto-runs `analyzeLoad` on open; GO/NEGOTIATE/PASS badge, target rate, reasoning, Refresh |
| API calls | `services/api.ts:185–226` | `listLoads`, `getLoad`, `createLoad`, `updateLoad`, `deleteLoad`, `analyzeLoad`, `listMessages`, `sendMessage` |
| Backend route | `backend/app/loads/routes.py` | CRUD + document-requests + messages sub-routes |
| Financials | `backend/app/loads/routes.py:61–65` | `_compute_financials()` — net_profit, rpm, net_rpm |
| Auto-invoice | `backend/app/loads/routes.py:132–163` | Invoice auto-created on load insert (in-memory + DB) |
| In-memory store | `backend/app/loads/routes.py:19–21` | `_LOADS`, `_INVOICES` — fallback when RLS blocks |
| DB table | `loads` | Columns: id, organization_id, carrier_id, broker_id, route, origin/destination, load_rate, miles, fuel_cost, driver_pay, tolls, net_profit, rpm, net_rpm, status, pickup_date, delivery_date, rc_reference, customer_ap_email, deleted_at |

**Load statuses:** `logged` → `in_transit` → `delivered` / `cancelled` (pill selector in modal + inline dropdown in table)

**Page summary metrics:** total loads, in-transit count, delivered count, avg net RPM — computed client-side from loaded data

**Dependencies:** broker MC → `BrokerService.get_or_create_by_mc()` in `backend/app/brokers/service.py`

---

### LOADS — Carrier Portal

| Layer | File | Notes |
|-------|------|-------|
| List page | `FleetPulse/app/loads/page.tsx` | Carrier's own loads only (filtered by carrier_id); "Log Load" form gated on `portal_mode === 'self_managed'`; splits into Active (logged/in_transit/pending) and History (delivered/cancelled) |
| Detail page | `FleetPulse/app/loads/[loadId]/page.tsx` | Full load detail + messages + doc requests; self-managed: status advance button (`STATUS_SEQUENCE`), inline edit form, delete with confirmation (calls FastAPI with Supabase Bearer token) |
| Components | `FleetPulse/components/LoadCard.tsx` | Load summary card |
| Components | `FleetPulse/components/MessageThread.tsx` | Dispatcher ↔ carrier messaging |
| Components | `FleetPulse/components/DocRequestItem.tsx` | Document request list item |
| Same API | `backend/app/loads/routes.py` | Shared backend; auth relaxed to `require_authenticated`; carriers POST without org_id (carrier_id from JWT); PATCH/DELETE filter by carrier_id for carriers vs organization_id for dispatchers |

**portal_mode gating (loads):**
- `managed` (default): read-only — no Log Load button, no status advance, no edit, no delete
- `self_managed`: full CRUD — Log Load form visible, status advance/edit/delete on detail page

**Self-managed load creation:** `POST /api/v1/loads` — body: `{origin, destination, pickup_date?, delivery_date?, rate, broker_name?, customer_ap_email?, notes?}`; `carrier_id` and `org_id` both resolved from JWT via auth middleware (`user.carrier_id`, `user.organization_id`)

**Status advance:** `STATUS_SEQUENCE = ["logged", "in_transit", "delivered"]`; `NEXT_STATUS_LABEL = {logged: "Start Transit", in_transit: "Mark Delivered"}`; calls `PATCH /api/v1/loads/{id}`

**Bug fixed (2026-04-21):** `loads.organization_id` was NOT NULL → carrier inserts always failed (backend 500). Migration `20260421_carrier_self_managed.sql` drops NOT NULL and adds auth.uid()-based RLS SELECT/INSERT/UPDATE policies. Frontend now does optimistic prepend on success then background re-fetch.

**Bug fixed (2026-04-22, org_id):** `create_load` set `org_id = None` for carrier callers — NOT NULL violation. Fixed to use `user.organization_id` (populated by middleware from carriers table).

**Bug fixed (2026-04-22, dual-role):** If the carrier's Supabase auth UID also had a `public.users` row with role=`dispatcher_admin` (e.g. same account used for dispatcher signup), `create_load` entered the dispatcher branch and raised 400 "carrier_id required". Fixed in two places: (1) middleware now always checks `carriers.user_id = sub` even when a users row is found, populating `carrier_id`; (2) `create_load` adds a middle branch — `is_dispatcher` with no `payload.carrier_id` but `user.carrier_id` set → falls through to carrier creation path.

**Bug fixed (2026-04-22):** `create_load` wrote rate to `load_rate` only — `loads.rate` stayed NULL. Carrier portal reads `rate` from Supabase, so rate/net-profit/RPM all showed blank. Fix: `create_load` now writes both `rate` and `load_rate`; `update_load` keeps both in sync. `LoadRow` type now includes `load_rate`, `net_profit`, `rpm`, `net_rpm`, `broker_name`, `customer_ap_email`, `deleted_at`. Load detail page (`[loadId]/page.tsx`) has a financial summary card (Rate / Net Profit / Rate per Mile). List-page `LoadCard` and edit-form rate init both fall back to `load_rate` for pre-fix loads.

---

### DOCUMENT REQUESTS (sub-resource of Loads)

> **Removed from dispatcher UI.** Document requests are now handled via the Invoice and Carrier compliance flows. Backend routes remain for the Carrier Portal.

| Layer | File | Notes |
|-------|------|-------|
| API calls | `services/api.ts` | `listDocumentRequests`, `createDocumentRequest`, `updateDocumentRequest`, `deleteDocumentRequest` — no longer used in dispatcher loads page |
| Backend | `backend/app/loads/routes.py` | Sub-routes on `/loads/{load_id}/document-requests` — kept for carrier portal |
| DB table | `document_requests` | id, load_id, doc_type, label/notes, status, carrier_id |
| Carrier view | `FleetPulse/components/ComplianceDocRow.tsx` | Renders doc request in compliance page |

---

### MESSAGES (sub-resource of Loads)

| Layer | File | Notes |
|-------|------|-------|
| API calls | `services/api.ts:351–358` | `listMessages`, `sendMessage` |
| Backend | `backend/app/loads/routes.py` | Sub-routes on `/loads/{load_id}/messages` |
| In-memory fallback | `backend/app/loads/routes.py` | `_MESSAGES` list — mirrors `_LOADS`/`_INVOICES` pattern; populated on every insert so GET works even when DB blocked |
| DB table | `messages` | id, load_id, sender_id, sender_role, body, created_at (DEFAULT NOW()) |
| Migration | `20260331_messages_table.sql` | Creates table, enables RLS, org-scoped + carrier self policies, grants to service_role |
| Dispatcher UI | `components/LoadDetailModal.tsx` | Messages tab — auto-fetches on tab switch, send box with Enter support |
| Carrier component | `FleetPulse/components/MessageThread.tsx` | Renders thread, handles send (carrier portal) |

**Bug fixed (2026-03-31):** Messages table was missing from all migrations — INSERTs hit RLS fallback and were discarded. GET silently returned `[]`. Fix: migration creates table; `_MESSAGES` in-memory list ensures messages survive within a session even if DB is still unavailable.

---

### INVOICES — Dispatcher

| Layer | File | Notes |
|-------|------|-------|
| Page | `fleetpulse-dispatcher/frontend/app/(dispatcher)/invoices/page.tsx` | Lists, filters, actions; **hides paid invoices by default** (`hidePaid` state = true); toggle chip "✓ Hiding paid / ○ Show paid"; "Paid history → Monthly Reports" link |
| Row component | `components/InvoiceRow.tsx` | Invoice table row with actions |
| Follow-up modal | `components/FollowUpModal.tsx` | AI-drafted follow-up email (tone escalation) |
| Add modal | `components/AddInvoiceModal.tsx` | Manual invoice creation |
| **Send modal** | `components/InvoiceSendModal.tsx` | Pre-filled Gmail compose (To/Subject/Body) + client-side PDF download; lists attached docs; calls `sendInvoice()` to mark status; triggered from InvoiceRow and InvoiceDetailModal Details tab |
| API calls | `services/api.ts:230–280` | `listInvoices`, `createInvoice`, `getInvoice`, `markInvoicePaid`, `updateInvoice`, `deleteInvoice`, `sendInvoice` |
| Backend route | `backend/app/invoices/routes.py` | CRUD; all write routes now use `require_authenticated`; carriers filtered by `carrier_id`, dispatchers by `organization_id` |
| Enrichment | `backend/app/invoices/routes.py:_enrich_invoices()` | Adds days_outstanding, carrier_name, broker_name |
| In-memory | `backend/app/invoices/routes.py:_get_invoices_mem()` | Imports `_INVOICES` from loads.routes |
| DB table | `invoices` | id, organization_id, load_id, carrier_id, broker_id, amount, status, followups_sent, invoice_number, issued_date, due_date, customer_ap_email, deleted_at |
| Trigger | `supabase/functions/invoice_on_load.sql` | DB-level auto-create on load insert |

**Invoice statuses:** `pending` → `sent` → `paid` / `overdue` / `shortpaid` / `claim`
**Days outstanding:** computed from `issued_date` or load `delivery_date` vs today
**Auto-advance (P4):** Backend — when POD doc uploaded via `PaperworkService.upload_file()`, calls `_advance_invoice_on_pod()` → advances invoice `pending → sent` automatically
**Auth model (invoices):** All write endpoints (`POST`, `PATCH`, `DELETE`, `POST /send`) use `require_authenticated`. Carriers: ownership via `carrier_id` from JWT; `CreateInvoiceIn.carrier_id` is optional (`str | None = None`) — resolved from JWT. Dispatchers: ownership via `organization_id`.

---

### INVOICES — Carrier Portal (Dispatcher App `/overview`)

| Layer | File | Notes |
|-------|------|-------|
| Page | `fleetpulse-dispatcher/frontend/app/(portal)/overview/invoices/page.tsx` | Carrier's own invoices — clickable rows expand inline `InvoiceDetailPanel`; hide-paid toggle (default OFF); outstanding total header |
| `InvoiceDetailPanel` | inline in invoices/page.tsx | Fetches `listInvoiceDocuments(id)` on open; shows `DocBadge` per requested doc type; uploaded file list with View (signed URL) links |
| `DocBadge` | inline component | Green ✓ = uploaded, grey ○ = not yet; `DOC_TYPE_LABELS` map for human-readable names |

**Invoice statuses shown:** pending / sent / paid / overdue / shortpaid / claim
**Days outstanding:** color-coded — green <30d, amber 30–60d, red >60d

---

### INVOICES — Carrier Portal (FleetPulse app, port 3000)

| Layer | File | Notes |
|-------|------|-------|
| Page | `FleetPulse/app/invoices/page.tsx` | Carrier's own invoices; fetches from Supabase with `loads(load_number, origin, destination)` join; "New Invoice" form gated on `portal_mode === 'self_managed'`; per-invoice actions (Mark Paid, Send, Delete, Draft Follow-up) also gated on self_managed |
| New Invoice form | inline in `invoices/page.tsx` | Fields: load_id (delivered-loads dropdown), amount*, invoice_number, issued_date, due_date, customer_ap_email, notes; `POST /api/v1/invoices` with Bearer token |
| Per-invoice actions | inline in `invoices/page.tsx` | Mark Paid → `PATCH /api/v1/invoices/{id}` `{status:"paid"}`; Send Invoice → opens `InvoiceSendModal`; Draft Follow-up (sent/overdue only) → opens `FollowUpModal`; Delete → `DELETE /api/v1/invoices/{id}` |
| **Send modal** | `FleetPulse/components/InvoiceSendModal.tsx` | Mirrors dispatcher's send flow for self-managed carriers: auto-generated branded PDF (print-to-PDF), editable To/Subject/Body, list of uploaded invoice documents (signed URLs from `/paperwork/invoices/{id}/documents`), Gmail compose on submit, marks invoice `sent` via `POST /invoices/{id}/send` |
| **Follow-up modal** | `FleetPulse/components/FollowUpModal.tsx` | Calls `POST /ai/invoice/followup` with Supabase bearer; shows tone badge (polite/firm/assertive/final); editable subject+body; Copy to Clipboard + Mark as Sent |
| Backend route | `backend/app/invoices/routes.py` | Auth relaxed to `require_authenticated`; `CreateInvoiceIn.carrier_id` is `str | None = None` — resolved from JWT for carrier callers; PATCH/DELETE filter by carrier_id for carriers |
| Backend route (AI followup) | `backend/app/ai/routes.py` | Auth relaxed to `require_authenticated`; carriers filtered by `carrier_id`; `_enrich_invoices` called with fallback org_id (tolerates carrier-created invoices with organization_id=NULL) |

**portal_mode gating (invoices):**
- `managed`: invoice list visible, no create/modify actions
- `self_managed`: "New Invoice" button + Mark Paid / Send / Delete per invoice

**New invoice creation:** body: `{load_id?, amount, invoice_number?, issued_date?, due_date?, customer_ap_email?, notes?}`; `carrier_id` and `org_id` both resolved from JWT via auth middleware (`user.carrier_id`, `user.organization_id`)

**Bug fixed (2026-04-21):** `invoices.organization_id` was NOT NULL → carrier inserts always failed. `CreateInvoiceIn` was also missing `customer_ap_email` field (silently discarded). Both fixed in migration `20260421_carrier_self_managed.sql` + `backend/app/invoices/routes.py`. Frontend now does optimistic prepend on success then background re-fetch.

---

### CARRIER PORTAL OVERVIEW (Dispatcher App — `/overview`)

> Carrier-facing pages embedded in the dispatcher app under `(portal)` route group.

| Layer | File | Notes |
|-------|------|-------|
| **Dashboard** | `fleetpulse-dispatcher/frontend/app/(portal)/overview/page.tsx` | 4 KPI tiles (Total Earned, Outstanding, Avg Net RPM, In Transit); payment status breakdown; top 5 profitable loads; recent 5 invoices |
| **Invoices** | `fleetpulse-dispatcher/frontend/app/(portal)/overview/invoices/page.tsx` | See INVOICES — Carrier Portal above |
| **Loads** | `fleetpulse-dispatcher/frontend/app/(portal)/overview/loads/page.tsx` | Active/history split; `DocProgress` bar; invoice status badge; route + RC ref display |
| **Insurance** | `fleetpulse-dispatcher/frontend/app/(portal)/overview/insurance/page.tsx` | Carrier's insurance certificates |

**`KPITile`** (inline component in overview/page.tsx): label, value, sub-label, color prop.
**`DocProgress`** (inline in loads/page.tsx): horizontal bar + "X/Y docs" label; color green (all done) / amber (partial) / grey (none requested); uses `l.docs_uploaded ?? 0` and `l.docs_requested ?? 0` (backend fields not yet returned — shows 0/0 until wired).
**Payment status breakdown:** `Object.entries(paymentSummary)` keyed by status string → colored count tiles.
**Top 5 profitable loads:** sort by `net_profit` desc on delivered loads only.
**`getUser()`** returns `carrier_id` used to scope all portal API calls.

---

### CARRIERS — Dispatcher

| Layer | File | Notes |
|-------|------|-------|
| Page | `fleetpulse-dispatcher/frontend/app/(dispatcher)/carriers/page.tsx` | Roster with grid/list toggle; clicking a carrier opens CarrierDetailModal |
| Add modal | `components/AddCarrierModal.tsx` | DOT lookup (debounced, 1.3s) via `/api/fmcsa/carrier/[dot]`; **save calls `createCarrierManual` with preview data** — never re-queries FMCSA from backend; "Edit details before saving" opens manual form pre-filled from preview; manual entry always accessible via link; `addCarrier` no longer used |
| **Detail modal** | `components/CarrierDetailModal.tsx` | **Tabbed modal** (Carrier Info + Documents); replaces old side drawer; uses carrier_compliance System 2 for documents |
| Info tab | `components/CarrierDetailModal.tsx` | FMCSA read-only display + editable fields (including **Portal Mode select**) + Save Changes → `updateCarrier` |
| Documents tab | `components/CarrierDetailModal.tsx` | Upload toolbar, doc list with inline edit/delete, magic link requests via `CarrierDocumentRequestModal` |
| API calls | `services/api.ts:132–181` | `listCarriers`, `getCarrier`, `addCarrier`, `lookupDot`, `createCarrierManual`, `updateCarrier` |
| Backend route | `backend/app/carriers/routes.py` | CRUD + `/lookup` + `/manual` + compliance-documents (legacy) + pending-actions |
| Backend service | `backend/app/carriers/service.py` | `CarrierService`, in-memory `_CARRIERS` fallback |
| FMCSA integration | `backend/app/fmcsa/cache.py` | `FmcsaCacheService` — DOT lookup with in-memory cache |
| DB table | `carriers` | id, organization_id, legal_name, dot_number, mc_number, status, contact_*, address, drivers, power_units, portal_status, **portal_mode** TEXT NOT NULL DEFAULT 'managed' CHECK (managed \| self_managed) |
| Migration | `fleetpulse-dispatcher/supabase/migrations/20260410_carrier_portal_mode.sql` | Adds `portal_mode` column |
| localStorage | `services/api.ts:9–17` | `VIEW_KEY = 'fleetpulse:roster:view'` — grid/list preference |

**Carrier statuses:** `active`, `inactive`, `suspended`
**Portal status:** `invited`, `active`, `none` — controls carrier portal access
**Portal mode:** `managed` (default) — dispatcher manages loads, carrier is read-only; `self_managed` — carrier creates/edits/deletes their own loads and invoices. Set by dispatcher via CarrierDetailModal → Info tab → Portal Mode select. Read by carrier portal from `carriers.portal_mode` on every page load.

---

### COMPLIANCE DOCUMENTS (sub-resource of Carriers)

> **Note:** Dispatcher-side compliance management is now handled entirely by `CarrierDetailModal` → Documents tab → using the CARRIER COMPLIANCE DOCUMENTS (System 2) endpoints below. The legacy System 1 endpoints below exist for the Carrier Portal read-only view only.

| Layer | File | Notes |
|-------|------|-------|
| API calls (legacy) | `services/api.ts` | `listComplianceDocs`, `updateComplianceDoc`, `deleteComplianceDoc`, `listPendingActions` — no longer used in dispatcher UI |
| Backend (legacy) | `backend/app/carriers/routes.py` | `GET/PATCH/DELETE /carriers/{id}/compliance-documents`, `GET /carriers/{id}/pending-actions` |
| Carrier page | `FleetPulse/app/compliance/page.tsx` | Carrier's compliance view; lists docs ordered by expiry; passes `effectiveStatus` (computed client-side) to each row |
| Component | `FleetPulse/components/ComplianceDocRow.tsx` | **Redesigned:** issue date + expiry date inputs (pre-filled from existing values, editable); "Last updated [date]" from `uploaded_at`; expired = red left border, expiring_soon = orange left border; passes `issueDate`/`expiresAt` to `UploadButton` |
| `UploadButton` | `FleetPulse/components/UploadButton.tsx` | **Two-option upload:** "Take Photo" button (`capture="environment"`, `accept="image/*"`) opens camera on mobile; "Choose File" button (`accept="image/*,.pdf"`) opens file picker for gallery/PDFs. Both share same handler. Props: `issueDate?` + `expiresAt?` (YYYY-MM-DD) written to `compliance_documents` on upload; `label` prop removed. |
| DB table | `compliance_documents` | id, carrier_id, doc_type (INSURANCE/CDL/REGISTRATION/INSPECTION/OTHER), label, storage_path, file_name, **issued_at** (date, added 20260331), expires_at (date), status, uploaded_at |
| TS type | `FleetPulse/lib/types.ts` | `issued_at` added to `compliance_documents` Row + Insert |
| Migration | `20260331_doc_date_fields.sql` | Adds `issued_at` to compliance_documents; adds `issued_at` + `expires_at` to invoice_documents |

---

### INSURANCE

| Layer | File | Notes |
|-------|------|-------|
| Dispatcher page | `fleetpulse-dispatcher/frontend/app/(dispatcher)/insurance/page.tsx` | Insurance certificates list |
| Carrier page | `fleetpulse-dispatcher/frontend/app/(portal)/overview/insurance/page.tsx` | Carrier's own insurance |
| Backend route | `backend/app/insurance/routes.py` | CRUD for insurance certificates |
| DB table | `insurance` | id, carrier_id, type, policy_number, provider, expiry_date, status |

---

### AI — Load Analysis

| Layer | File | Notes |
|-------|------|-------|
| Trigger | `components/DetailDrawer.tsx` → `components/LoadAnalysisModal.tsx` | User clicks "Analyze" |
| API call | `services/api.ts:284–290` | `analyzeLoad(loadId, forceRefresh)` |
| Backend route | `backend/app/ai/routes.py:34–88` | `POST /ai/load/analyze` |
| AI service | `backend/app/ai/service.py` | `AIService.analyze_load()` — calls Anthropic Claude |
| Decision logic | `backend/app/ai/routes.py:82–86` | GO: net_rpm≥1.5 AND trust≥70 / PASS: net_rpm<1.0 OR trust<50 / NEGOTIATE: else |
| Budget guard | `backend/app/ops/` | `cost_guard` — monthly AI budget cap ($30 default) |
| Config | `backend/app/config.py` | `ANTHROPIC_KEY`, `ai_monthly_budget` setting |

---

### AI — Invoice Follow-up Email

| Layer | File | Notes |
|-------|------|-------|
| Trigger | `components/FollowUpModal.tsx` | User clicks "Draft Follow-up" on invoice |
| API call | `services/api.ts:298–303` | `draftFollowup(invoiceId, overrideTone?)` |
| Backend route | `backend/app/ai/routes.py:155–218` | `POST /ai/invoice/followup` |
| Tone service | `backend/app/invoices/service.py` | `InvoiceFollowupService.tone_for_days()` — polite→firm→assertive→final |
| AI service | `backend/app/ai/service.py` | `AIService.draft_followup()` — generates subject + body |
| Fallback | `backend/app/ai/routes.py:197–205` | Template-based draft if Claude fails |
| DB update | `backend/app/ai/routes.py:208` | Increments `invoices.followups_sent` |

---

### AI — Broker Scoring

| Layer | File | Notes |
|-------|------|-------|
| API call | `services/api.ts:291–294` | `scoreBroker(brokerId)` |
| Backend route | `backend/app/ai/routes.py:93–150` | `POST /ai/broker/score` |
| Broker service | `backend/app/brokers/service.py` | `BrokerService.get_or_create_by_mc()` |
| FMCSA | `backend/app/fmcsa/cache.py` | Refreshes broker FMCSA data if `force_fmcsa_refresh=true` |
| Score thresholds | `backend/app/ai/routes.py:130–135` | ≥70 GO / ≥50 NEGOTIATE / <50 CAUTION |
| DB table | `brokers` | id, mc_number, legal_name, trust_score, authority_status, operating_status, payment_days_avg, payment_days_p90, late_payment_rate, fraud_flags, fmcsa_last_pulled_at |

---

### BROKERS

| Layer | File | Notes |
|-------|------|-------|
| API calls | `services/api.ts:307–310` | `listBrokers()` |
| Backend route | (included via `BrokerService`, no dedicated router in main.py) | Managed through service layer |
| Backend service | `backend/app/brokers/service.py` | `BrokerService` — get_or_create_by_mc, in-memory cache |
| DB table | `brokers` | See AI — Broker Scoring above |

---

### FIND CARRIERS — Dispatcher

| Layer | File | Notes |
|-------|------|-------|
| Page | `fleetpulse-dispatcher/frontend/app/(dispatcher)/find-carriers/page.tsx` | 3-row filter panel + results grid; Load More pagination; state-only search now works |
| **Socrata search API route** | `app/api/fmcsa/search/route.ts` | Next.js API route — queries **DOT Socrata SODA API** (`data.transportation.gov/resource/kjg3-diqy.json`); 600k+ carriers; all filters pushed server-side as `$where` clauses; 8s abort timeout; returns `{ results, total, offset, limit, has_more }` |
| FMCSA carrier detail route | `app/api/fmcsa/carrier/[dot]/route.ts` | Single carrier lookup by DOT; 1h cache; **still uses FMCSA QCMobile** — used only by AddCarrierModal DOT preview |
| AI outreach route | `app/api/outreach/generate/route.ts` | `POST` — calls Claude Haiku; carrier context includes `carrier_operation`, `authorized_for_hire`, `hauls_hazmat`, `add_date` (new-entrant flag), `last_filing` age, `annual_mileage`; fallback template if `ANTHROPIC_KEY` unset |
| Outreach modal | `components/OutreachModal.tsx` | Tone selector (friendly/professional/urgent) → Generate → editable draft → Copy / Try Again; Carrier type uses `dot_number`, `carrier_operation`, `authorized_for_hire` (not old `dot`/`safety_rating`/`cargo_carried`) |
| Setup modal | `components/DispatcherSetupModal.tsx` | Captures dispatcher name + company; stored in `localStorage` keys `fp_dispatcher_name` / `fp_dispatcher_company`; shown on first outreach attempt if name missing |
| Nav item | `app/(dispatcher)/layout.tsx` | "Find Carriers" between Carriers and Loads; "New" badge shown until `fp_find_carriers_visited` is set in localStorage |
| CSS tokens | `styles/globals.css` | `--surface2`, `--surface3`, `--border2`, `--mistLt`; `@keyframes fadeUp`, `@keyframes skeletonPulse`, `.fp-skeleton` |
| Icon | `components/icons/index.tsx` | `SearchTruck` — truck + magnifying glass |
| Env var | none required | Socrata API is free, no auth key needed |

**Carrier type (Socrata):** `dot_number`, `legal_name`, `dba_name`, `city`, `state`, `zip`, `telephone`, `email`, `power_units`, `drivers`, `carrier_operation`, `authorized_for_hire` (bool), `hauls_hazmat` (bool), `is_passenger` (bool), `add_date`, `last_filing`, `annual_mileage`, `has_phone`, `has_email`

**Socrata `$where` filters (server-side):** `upper(legal_name) like '%...%'` or `dot_number='...'` for name/DOT; `phy_state='TX'`; `nbr_power_unit >= N`; `telephone IS NOT NULL`; `email_address IS NOT NULL`; `authorized_for_hire='Y'`; `hm_flag='Y'`; `add_date >= cutoff` for new entrants

**Fleet size buckets:** Any / Owner-Op (1) / Small (2–5) / Medium (6–15) / Large (16–50)

**Filter layout (3 rows):** Row 1 = State select, Fleet size select, Sort select; Row 2 = Has Phone (default ON), Has Email, For Hire Only, HazMat, New Entrants chips; Row 3 = name/DOT input + Find Carriers button

**Carrier card:** initials avatar, dba name (if different), city/state/zip, MCS-150 filing age badge (green <12mo / amber 12–24mo / red >24mo), 4-col metric grid (Trucks/Drivers/DOT/Operation), For Hire / Private Fleet / HazMat / Passenger badges, formatted phone `(XXX) XXX-XXXX`, "No contact info on file" in italic, Copy DOT, Write Outreach

**Search constraints:** name OR state required to avoid querying entire dataset; state-only is now supported (Socrata has working state filter); canSearch = name.length >= 1 OR stateFilter !== ""

**Pagination:** Load More button appends 50 results; `has_more` from API; `currentOffset` tracks position; Load More silently ignores errors

**Outreach flow:** Click "Write Outreach" → check `fp_dispatcher_name` → if missing, show `DispatcherSetupModal` → then show `OutreachModal` → POST `/api/outreach/generate` → Claude Haiku → editable textarea → Copy

---

### FMCSA (Backend)

| Layer | File | Notes |
|-------|------|-------|
| Cache service | `backend/app/fmcsa/cache.py` | `FmcsaCacheService` — in-memory cache, calls external FMCSA API |
| Used by | `carriers/routes.py` (DOT lookup), `ai/routes.py` (broker refresh) | |
| Fallback | Uses mock data if `FMCSA_API_KEY` not set | |

---

### FEEDBACK

| Layer | File | Notes |
|-------|------|-------|
| Component | `components/FeedbackWidget.tsx` | Floating feedback button (all pages) |
| API call | `services/api.ts:313–322` | `submitFeedback({category, description, page, severity})` |
| Backend route | `backend/app/feedback/routes.py` | `POST /feedback` |

---

### TODAY'S WORK DASHBOARD (Actions Engine)

| Layer | File | Notes |
|-------|------|-------|
| Backend module | `backend/app/actions/` | `__init__.py` + `service.py` + `routes.py` |
| Backend service | `backend/app/actions/service.py` | `get_todays_actions(user)` — dispatcher path + carrier path; returns up to 10 actions sorted by priority then due_in_days |
| Backend route | `backend/app/actions/routes.py` | `GET /api/v1/actions/today` — `require_authenticated`; returns `{ data: Action[], total: N }` |
| Router registration | `backend/app/main.py` | `actions_router` included first in api_v1 |
| API call (dispatcher) | `services/api.ts` | `getTodayActions()` → `GET /actions/today`; exports `TodayAction` type |
| Dispatcher component | `fleetpulse-dispatcher/frontend/components/TodayWorkPanel.tsx` | Renders prioritized action cards with colored borders; CTA routes via `router.push`; accepts `actions`, `loading`, `onRefresh` props |

**Action types:** `invoice_followup` | `invoice_ready` | `paperwork_pending` | `compliance_expiring`

**Dispatcher logic:**
- `invoice_followup`: invoices with status sent/overdue AND days_outstanding > 3; priority: ≥30d=high, ≥14d=medium, else low
- `invoice_ready`: pending invoices linked to delivered loads
- `paperwork_pending`: delivered loads where invoice exists but no POD document in invoice_documents
- `compliance_expiring`: compliance_documents with expires_at ≤ today+30d across all org's carriers; priority: expired/\<7d=high, ≤30d=medium

**Carrier logic:**
- `paperwork_pending`: invoice_document_requests still pending → `cta_action: "copy:{magic_link}"`
- `compliance_expiring`: carrier's own compliance_documents expiring
- `invoice_ready`: pending invoices with delivered loads → `cta_action: "send_invoice:{id}"`
- `invoice_followup`: sent/overdue invoices → `cta_action: "followup:{id}"`

**CTA action format (carrier):** `copy:{url}` | `send_invoice:{id}` | `followup:{id}` | `/compliance`
**CTA action format (dispatcher):** route strings like `/invoices?invoiceId={id}` navigated via `router.push`

---

### DASHBOARD — Dispatcher

| Layer | File | Notes |
|-------|------|-------|
| Page | `fleetpulse-dispatcher/frontend/app/(dispatcher)/dashboard/page.tsx` | Aggregates loads, invoices, carriers; **Today's Work panel above KPIs** |
| Data sources | `getTodayActions()`, `listLoads()`, `listInvoices()`, `listCarriers()` from `services/api.ts` | |
| Today's Work | `components/TodayWorkPanel.tsx` | Placed above KPI strip; refreshable independently |

---

### DASHBOARD — Carrier Portal (FleetPulse app, port 3000)

| Layer | File | Notes |
|-------|------|-------|
| Page | `FleetPulse/app/dashboard/page.tsx` | Carrier's dashboard — fetches loads + invoices; **Today's Work replaces Pending Actions**; fetches actions from `GET /api/v1/actions/today` with Supabase bearer; KPI strip; Active Loads section |
| Navigation | `FleetPulse/components/NavBar.tsx` | Nav items: Home / Loads / Invoices / Docs (Receipt icon); Lucide icons |
| Invoices page | `FleetPulse/app/invoices/page.tsx` | Carrier's invoice list; select joins `loads(load_number, origin, destination)`; row shows lane (origin → destination) as primary identifier + `Load #number`; expanded detail has Lane row; Outstanding/Earned/Total KPIs; status badges; links to Loads for paperwork |
| Loads list | `FleetPulse/app/loads/page.tsx` | Split into Active (logged/in_transit) and History (delivered/cancelled); fetches invoices in parallel, builds `Map<load_id, invoice_number>`; shows invoice # (amber) next to load # on each card; status pills; rate display; links to load detail |
| **Load detail** | `FleetPulse/app/loads/[loadId]/page.tsx` | **Two-tab doc section:** "Upload Paperwork" (doc type picker + `UploadButton`) and "Request from Driver" (chip-select doc types → "Generate Driver Link" → shared backend API). **Submitted Documents section:** request rows show "Sent [datetime]" (`created_at`), "Uploaded [datetime]" (`fulfilled_at`) or "Expires [datetime]" (`expires_at`); file rows show source badge ("Driver" amber / "You" blue, based on `request_id` presence) + `uploaded_at` as friendly relative timestamp. `fmtDateTime()` helper: "Today at H:MM", "Yesterday at H:MM", or "Mon DD at H:MM". Refresh button + auto-refresh after upload or link generation. |
| `UploadButton` | `FleetPulse/components/UploadButton.tsx` | Extended: supports `documentRequestId` = undefined; inserts `documents` record with null request_id for carrier-initiated uploads |
| Env | `FleetPulse/.env.example` | `NEXT_PUBLIC_API_BASE=http://localhost:8000/api/v1` — points to FastAPI backend |
| Types | `FleetPulse/lib/types.ts` | Added `InvoiceStatus`, `InvoiceRow`, `invoices` table definition |

**Data access:** All Supabase queries use `createBrowserSupabaseClient()` directly. Pending paperwork + invoice send call FastAPI backend at `NEXT_PUBLIC_API_BASE` using the carrier's Supabase session token as the Bearer.
**Invoice RLS:** `carrier_self_invoice_read` policy allows carriers to SELECT invoices where `carrier_id = JWT claim.carrier_id`.
**Magic link flow:** carrier selects doc types → JS looks up invoice_id for the load → `POST /api/v1/paperwork/requests` with carrier Bearer token → backend creates `invoice_document_requests` row → returns `magic_link` pointing to **existing** dispatcher app `/upload/[token]` page — no duplicate upload page.
**Storage bucket:** `load-documents` (existing) — carrier direct uploads go to `{userId}/{loadId}/{docType}_{ts}.ext`.
**Nav items:** Home (`/dashboard`) · Loads (`/loads`) · Invoices (`/invoices`) · Docs (`/compliance`)

**Today's Work (replaces old 3-type Pending Actions):** Single `GET /api/v1/actions/today` call with Supabase bearer token. Returns unified `TodayAction[]` from backend actions service. CTA handler in dashboard page switches on `action.cta.action` prefix: `copy:` → clipboard, `/compliance` → navigate, `followup:{id}` → open FollowUpModal, `send_invoice:{id}` → open InvoiceSendModal (or direct API call if invoice not in local state). Refresh button re-fetches `loadData()` which re-fetches actions.

---

### REPORTS — Monthly Reports

| Layer | File | Notes |
|-------|------|-------|
| Page | `fleetpulse-dispatcher/frontend/app/(dispatcher)/reports/page.tsx` | Month navigator (← [Month Year] →); 4 KPI tiles; invoice table; Export CSV |
| Nav item | `app/(dispatcher)/layout.tsx` | "Reports" after Invoices; `FileText` icon |
| Data sources | `listInvoices({ limit: 1000 })` + `listLoads({ status: "delivered", limit: 1000 })` | Fetched once on mount; filtered client-side on month change |
| Modal | `components/InvoiceDetailModal` | Reused — clicking a table row opens it |

**KPI tiles:** Total Invoiced (green) / Total Collected (amber) / Outstanding (red if >0) / Loads Completed (mist)

**Month filter:** client-side — invoices filtered by `issued_date.startsWith(YYYY-MM)`; loads filtered by `delivery_date` or `actual_delivery_at`

**Table columns:** Carrier · Broker · Invoice # · Load (last 8 chars of load_id) · Amount · Status · Issued · Paid Date — sorted issued_date DESC

**Export CSV:** client-side Blob; columns Invoice#/Carrier/Broker/Load/Amount/Status/Issued/Paid Date; filename `fleetpulse-report-YYYY-MM.csv`; button disabled when no invoices for month

---

### IFTA

| Layer | File | Notes |
|-------|------|-------|
| Page | `fleetpulse-dispatcher/frontend/app/(dispatcher)/ifta/page.tsx` | IFTA reporting |
| Component | `components/ComingSoon.tsx` | Phase 2 — not yet implemented |

---

---

### PAPERWORK / DOCUMENT UPLOAD (Invoice Magic Link)

| Layer | File | Notes |
|-------|------|-------|
| DB tables | `invoice_document_requests`, `invoice_documents` | Migration: `20260329_invoice_paperwork.sql`; grants: `20260329_invoice_paperwork_grants.sql`; `issued_at`/`expires_at` added via `20260331_doc_date_fields.sql` |
| Backend service | `backend/app/paperwork/service.py` | `PaperworkService` — create_request, get_request_by_token, upload_file, upload_file_direct, list_documents (signed URLs), **delete_document**, **update_document**, **`_advance_invoice_on_pod()`** |
| Backend routes | `backend/app/paperwork/routes.py` | 6 endpoints (see below) |
| Router registration | `backend/app/main.py` | `paperwork_router` included in api_v1 |
| API calls | `services/api.ts` | `requestPaperwork`, `validateUploadToken`, `uploadInvoiceFile`, `listInvoiceDocuments`, `uploadInvoiceFileDirect`, **`updateInvoiceDocument`**, **`deleteInvoiceDocument`** |
| Public upload page | `app/(public)/upload/[token]/page.tsx` | Driver-facing, no auth required |
| Public layout | `app/(public)/layout.tsx` | Bare `<div>` wrapper — NOT html/body (avoids duplicate root layout) |
| Request modal | `components/PaperworkRequestModal.tsx` | Dispatcher creates request + copies link |
| Detail modal | `components/InvoiceDetailModal.tsx` | Tabbed: Details + Documents; upload toolbar + Request from Driver; inline edit (doc_type only) + delete per doc |
| Invoices page | `app/(dispatcher)/invoices/page.tsx` | Uses InvoiceDetailModal |
| Storage bucket | Supabase Storage `invoice-documents` | Private bucket — must be created manually |
| Setting | `backend/app/config.py` | `dispatcher_url` — base URL for magic links |
| Env var | `DISPATCHER_URL` | Defaults to `http://localhost:3001` |

**API endpoints:**
- `POST /api/v1/paperwork/requests` — **any authenticated user** (dispatcher or carrier) — create request, returns `{ magic_link, token, doc_types, expires_at }`; when caller has no `organization_id` (carrier role), inherits it from the invoice row
- `GET /api/v1/paperwork/carrier/pending` — **any authenticated user with carrier_id** — returns all pending `invoice_document_requests` for the carrier's invoices, enriched with load lane info + magic_link; used by carrier portal dashboard Pending Actions
- `GET /api/v1/paperwork/invoices/{id}/documents` — **any authenticated user** — same org_id fallback; carriers can call to get their own `{ documents[], requests[] }`
- `GET /api/v1/paperwork/upload/{token}` — **public** — validate token, returns invoice context
- `POST /api/v1/paperwork/upload/{token}/files` — **public** — multipart (file + doc_type)
- `POST /api/v1/paperwork/invoices/{id}/files` — dispatcher auth — direct upload (multipart)
- `GET /api/v1/paperwork/invoices/{id}/documents` — auth — returns `{ documents[], requests[] }`
- `PATCH /api/v1/paperwork/invoices/{id}/documents/{doc_id}` — dispatcher — update doc_type, issued_at, expires_at
- `DELETE /api/v1/paperwork/invoices/{id}/documents/{doc_id}` — dispatcher — delete document record

**Token lifecycle:** UUID in DB → 72h expiry → status: `pending` → `fulfilled` / `expired`

**File storage path:** `{org_id}/{invoice_id}/{request_id}/{filename}` (token upload) or `{org_id}/{invoice_id}/direct/{filename}` (dispatcher upload)

**Valid doc_types:** `BOL`, `POD`, `RATE_CON`, `WEIGHT_TICKET`, `LUMPER_RECEIPT`, `INVOICE`, `OTHER`

---

### CARRIER COMPLIANCE DOCUMENTS (Magic Link + Direct Upload)

| Layer | File | Notes |
|-------|------|-------|
| DB table (enhanced) | `compliance_documents` | Migration `20260330_carrier_compliance.sql` adds: `issue_date`, `file_url`, `file_name`, `file_size`, `request_id`, `organization_id`, `uploaded_at`. Migration `20260422_compliance_lifecycle.sql` adds `superseded_at`, `is_active` (boolean NOT NULL DEFAULT true) for renewal versioning |
| DB table (new) | `carrier_document_requests` | Same 20260330 migration — token, carrier_id, org_id, doc_types[], 72h expiry |
| DB table (derived) | `compliance_pending_actions` | Migration `20260422_compliance_lifecycle.sql` — cached pending-action rows rebuilt by `sync_pending_actions()` after every mutation; columns: organization_id, carrier_id, doc_id, doc_type, kind (expired/expiring_soon/missing), expires_at, days_remaining, notified_at |
| Constraint fix | — | Migration `20260330_carrier_compliance_doctype_fix.sql` — drops old `doc_type_check`, adds one covering all types |
| Backend module | `backend/app/carrier_compliance/` | `__init__.py` + `service.py` + `routes.py` |
| Central status engine | `backend/app/carrier_compliance/service.py:evaluate_document_status(doc)` | Pure function: `expired` if expires_at<today, `expiring_soon` if within 30 days, else `active`; no expiry → `active` |
| Backend service | `backend/app/carrier_compliance/service.py` | `CarrierComplianceService` — create_request, get_request_by_token, upload_file, upload_file_direct, **renew_document**, list_documents (signed URLs, adds `effective_status` per doc), _maybe_fulfill, update_document, delete_document, **sync_pending_actions**, **list_pending_actions** |
| Backend routes | `backend/app/carrier_compliance/routes.py` | **10 endpoints** (see below) |
| Router registration | `backend/app/main.py` | `carrier_compliance_router` included in api_v1 |
| API calls | `services/api.ts` | `requestCarrierDocs`, `validateCarrierUploadToken`, `uploadCarrierFile`, `uploadCarrierFileDirect`, `listCarrierDocuments`, `updateCarrierDoc`, `deleteCarrierDoc` |
| Public upload page | `app/(public)/carrier-upload/[token]/page.tsx` | Carrier/owner-facing; per-doc issue_date + expiry_date inputs |
| **Detail modal** | `components/CarrierDetailModal.tsx` | **Primary entry point** — tabbed modal with Info + Documents tabs; inline edit (doc_type, issue_date, expires_at) + delete per doc; optimistic UI |
| Compliance modal | `components/CarrierComplianceModal.tsx` | Standalone compliance hub — still usable independently |
| Request modal | `components/CarrierDocumentRequestModal.tsx` | Checkbox doc type selector → generates magic link; used inside CarrierDetailModal |
| Carriers page | `app/(dispatcher)/carriers/page.tsx` | Clicking carrier opens `CarrierDetailModal` (replaced old drawer + CarrierComplianceModal) |
| Carrier-portal row | `FleetPulse/components/ComplianceDocRow.tsx` | Redesigned 2026-04-22: shows Issued/Expires dates + StatusBadge + single "Renew Document" button that opens `RenewDocumentModal`; no raw upload widget |
| Carrier-portal renew modal | `FleetPulse/components/RenewDocumentModal.tsx` | Modal requiring Issue Date + Expiration Date + File; validates expiry>issue; POSTs multipart to `/carrier-compliance/carriers/{id}/renew` with carrier Bearer token; calls `onRenewed` → parent re-fetches |
| Storage bucket | Supabase Storage `carrier-documents` | Private bucket — must be created manually |

**API endpoints:**
- `POST /api/v1/carrier-compliance/requests` — dispatcher auth — create magic link request
- `GET /api/v1/carrier-compliance/upload/{token}` — **public** — validate token, returns carrier context
- `POST /api/v1/carrier-compliance/upload/{token}/files` — **public** — multipart (file + doc_type + issue_date? + expires_at?)
- `POST /api/v1/carrier-compliance/carriers/{id}/documents` — dispatcher auth — direct upload
- `POST /api/v1/carrier-compliance/carriers/{id}/renew` — **any authenticated user** (dispatcher or owning carrier) — multipart (file + doc_type + issue_date + expires_at, all required); supersedes existing active doc of same type, inserts new one, runs `sync_pending_actions`
- `GET /api/v1/carrier-compliance/carriers/{id}/documents` — auth — returns `{ documents[], requests[] }`; each doc has `effective_status` computed by status engine
- `GET /api/v1/carrier-compliance/carriers/{id}/pending-actions` — auth (dispatcher or owning carrier) — cached pending actions with live compute fallback
- `GET /api/v1/carrier-compliance/carrier/pending-actions` — auth — JWT-scoped to caller's `carrier_id`
- `PATCH /api/v1/carrier-compliance/carriers/{id}/documents/{doc_id}` — dispatcher — update doc_type, issue_date, expires_at (triggers sync)
- `DELETE /api/v1/carrier-compliance/carriers/{id}/documents/{doc_id}` — dispatcher — delete (triggers sync)

**Pending-action lifecycle:**
1. Any mutation (upload_file / upload_file_direct / renew_document / update_document / delete_document) calls `sync_pending_actions(carrier_id, org_id)`
2. Sync loads all `compliance_documents` for carrier, picks newest active doc per doc_type, evaluates status via `evaluate_document_status`
3. Rows where status ≠ `active` are persisted to `compliance_pending_actions` (replace-all semantics); active rows remove any prior pending entry
4. Carrier portal dashboard + dispatcher CarrierDetailModal read via `list_pending_actions` (falls back to live compute if table unreachable)

**Renewal lifecycle:** `renew_document()` marks prior `is_active=true` rows for the same doc_type as `is_active=false` with `superseded_at=now()`, inserts a fresh row (is_active=true, new issue_date+expires_at), then calls `sync_pending_actions`. Carrier portal compliance + dashboard queries filter `is_active.is.null,is_active.eq.true` so the superseded record is invisible to UI immediately.

**Token lifecycle:** same as invoice paperwork — UUID → 72h → pending / fulfilled / expired

**File storage paths:**
- Token upload: `{org_id}/{carrier_id}/{request_id}/{filename}`
- Direct upload: `{org_id}/{carrier_id}/direct/{filename}`
- Renewal upload: `{org_id}/{carrier_id}/renewals/{filename}`

**Valid doc_types:** `MC_AUTHORITY`, `W9`, `VOID_CHECK`, `CARRIER_AGREEMENT`, `NOA`, `COI`, `CDL`, `OTHER`

**Expiry status logic:** Canonical function `evaluate_document_status()` in backend service; carrier portal compliance page mirrors with `computeComplianceStatus()` client-side. Thresholds: expired=`expires_at<today`, expiring_soon=within 30 days, else active.

---

## Cross-Cutting Concerns

### Styling System
- Config: `FleetPulse/tailwind.config.ts` (carrier portal) — brand color palette
- Dispatcher app has its own `tailwind.config` (similar tokens)
- Key tokens: `brand-amber` (#F59E0B), `brand-surface` (#0D1318), `brand-slate` (#F0F6FC), `brand-danger`, `brand-success`, `brand-warning`
- `cn()` helper: `FleetPulse/lib/cn.ts` — clsx + tailwind-merge
- Icons: `components/icons/index.tsx` — custom SVG set; includes Pencil, Trash2 (2026-03-31), SearchTruck (2026-04-01)

### Error Handling
- Backend: global exception handler in `main.py:30–36` → returns `ResponseEnvelope` with `error_code: INTERNAL_ERROR`
- Backend: `safe_execute()` in `config.py` — wraps Supabase calls, handles RLS errors gracefully
- Frontend: `apiFetch` in `services/api.ts:92–98` — unwraps envelope, surfaces `.error` field

### In-Memory Fallbacks (MVP pattern)
- `_LOADS`, `_INVOICES`, `_MESSAGES` in `backend/app/loads/routes.py:19–21`
- `_CARRIERS` in `backend/app/carriers/service.py`
- All are module-level lists populated at runtime, lost on server restart
- Pattern: try Supabase → `except Exception` → use in-memory store

### Database Migrations (apply in order)
```
supabase/migrations/
  20260317_init_schema.sql                        ← base tables
  20260317_init_rls.sql                           ← RLS policies
  20260317_seed.sql                               ← test data
  20260318_expand_schema.sql                      ← schema additions
  20260319_*.sql                                  ← incremental fixes
  20260324_fix_invoice_defaults.sql
  20260329_invoice_paperwork.sql                  ← invoice_document_requests + invoice_documents
  20260329_invoice_paperwork_grants.sql           ← GRANT ALL TO service_role (critical)
  20260330_carrier_compliance.sql                 ← enhance compliance_documents + carrier_document_requests
  20260330_carrier_compliance_doctype_fix.sql     ← drop/replace doc_type CHECK constraint
  20260331_messages_table.sql                     ← messages table + RLS + grants (was missing)
  20260331_doc_date_fields.sql                    ← issued_at on compliance_documents + invoice_documents
  20260410_carrier_portal_mode.sql
  20260421_carrier_self_managed.sql               ← drops NOT NULL from loads/invoices.organization_id; auth.uid() RLS for carrier INSERT/SELECT/UPDATE
  20260422_compliance_lifecycle.sql                ← compliance_documents.is_active + superseded_at; compliance_pending_actions (derived-state table)
```

### Supabase Client Rules
- `get_supabase()` — singleton, service role — use for all data ops
- `get_supabase_auth()` — fresh per call — use ONLY for sign-in/sign-up to prevent session contamination
- Both in `backend/app/config.py`
