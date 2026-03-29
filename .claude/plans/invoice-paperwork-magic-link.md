# Plan: Invoice Paperwork Magic Link
Status: READY
Branch: claude/add-claude-documentation-aOq5O
Created: 2026-03-29

## Overview
Dispatcher selects missing paperwork from the invoice detail view, adds notes, and gets a
shareable magic link. The driver opens the link (no login required), sees what's needed,
uploads files via camera or file picker. Files attach to the invoice. Dispatcher sees uploads
in the invoice detail in real time.

## Key Design Decisions
- **Token**: UUID stored in `invoice_document_requests` table with 72h expiry — simple, no JWT complexity
- **Storage**: Supabase Storage bucket `invoice-documents` — files stored as `{org_id}/{invoice_id}/{request_id}/{filename}`
- **Email sending**: Stubbed for MVP — dispatcher gets a copyable link in UI, sends via any channel (WhatsApp, text, email). SendGrid wiring is Phase 2.
- **Upload page**: Lives in dispatcher frontend at `/upload/[token]` — no auth required (dispatcher app has no route-level middleware, auth is component-level only)
- **Doc types**: Reuses existing load doc types: BOL, POD, RATE_CON, INVOICE, OTHER + new WEIGHT_TICKET, LUMPER_RECEIPT
- **Invoice detail UX**: Replace the flat `EditInvoiceModal` with a tabbed `InvoiceDetailModal` — tabs: Details (existing edit form) | Documents (uploaded files + request button)

## Phase Index
- [ ] P1 — DB: Migration — invoice_document_requests + invoice_documents tables
- [ ] P2 — Backend: `paperwork` module — 4 endpoints (request, validate token, upload file, list docs)
- [ ] P3 — Backend: Wire router into main.py + add 4 functions to api.ts
- [ ] P4 — Frontend: Public upload page `/upload/[token]` (driver-facing, no auth)
- [ ] P5 — Frontend: `PaperworkRequestModal` component (dispatcher creates request, copies link)
- [ ] P6 — Frontend: `InvoiceDetailModal` — tabbed detail view with Documents tab + request button

---

## P1 — DB: Migration

**Depends on:** none
**Files:**
- `fleetpulse-dispatcher/supabase/migrations/20260329_invoice_paperwork.sql` (new)

**Goal:** Add two tables that track paperwork requests (with tokens) and the files uploaded against them.

**Steps:**

1. Create `invoice_document_requests` table:
```sql
create table if not exists invoice_document_requests (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  invoice_id       uuid not null references invoices(id) on delete cascade,
  doc_types        text[] not null default '{}',   -- ['BOL','POD',...]
  notes            text,
  recipient_email  text,
  token            uuid not null unique default gen_random_uuid(),
  expires_at       timestamptz not null default (now() + interval '72 hours'),
  status           text not null default 'pending', -- pending | fulfilled | expired
  created_at       timestamptz not null default now(),
  fulfilled_at     timestamptz
);
```

2. Create `invoice_documents` table:
```sql
create table if not exists invoice_documents (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  invoice_id       uuid not null references invoices(id) on delete cascade,
  request_id       uuid references invoice_document_requests(id) on delete set null,
  doc_type         text not null default 'OTHER',
  file_name        text not null,
  file_url         text not null,   -- Supabase Storage public URL
  file_size        bigint,
  uploaded_at      timestamptz not null default now()
);
```

3. Create index on token for fast lookups:
```sql
create index if not exists idx_inv_doc_req_token on invoice_document_requests(token);
create index if not exists idx_inv_doc_req_invoice on invoice_document_requests(invoice_id);
create index if not exists idx_inv_docs_invoice on invoice_documents(invoice_id);
```

4. Add comment for bucket setup (cannot be done via SQL — manual step):
```sql
-- MANUAL: Create Supabase Storage bucket named 'invoice-documents' (public: false)
-- Path convention: {org_id}/{invoice_id}/{request_id}/{original_filename}
```

**Done when:** Migration file exists and can be applied without errors. Tables are queryable.

---

## P2 — Backend: `paperwork` module

**Depends on:** P1
**Files:**
- `fleetpulse-dispatcher/backend/app/paperwork/` (new directory)
- `fleetpulse-dispatcher/backend/app/paperwork/routes.py` (new)
- `fleetpulse-dispatcher/backend/app/paperwork/service.py` (new)

**Goal:** Four endpoints — create request (auth), validate token (public), upload file (public), list docs (auth).

**Steps:**

1. Create `service.py` with `PaperworkService`:
   - `create_request(invoice_id, org_id, doc_types, notes, recipient_email) -> dict`
     - Inserts into `invoice_document_requests`, returns record with `token` and `magic_link`
     - `magic_link = f"{settings.carrier_portal_url}/upload/{token}"` — use dispatcher frontend URL in practice
   - `get_request_by_token(token) -> dict | None`
     - Fetches `invoice_document_requests` by token, checks `expires_at > now()` and `status != expired`
     - Returns request + invoice summary (invoice_number, carrier_name, amount)
   - `upload_file(request_id, invoice_id, org_id, doc_type, filename, file_bytes, content_type) -> dict`
     - Uploads to Supabase Storage: `storage.from_("invoice-documents").upload(path, file_bytes)`
     - Gets public URL via `storage.from_("invoice-documents").get_public_url(path)`
     - Inserts record into `invoice_documents`
     - Checks if all requested doc_types now have uploads → marks request `fulfilled` if so
     - Returns `invoice_documents` record
   - `list_documents(invoice_id, org_id) -> list[dict]`
     - Fetches all `invoice_documents` for the invoice

2. Create `routes.py` with 4 endpoints:

   ```
   POST /paperwork/requests              → create_request (require_dispatcher)
   GET  /paperwork/upload/{token}        → validate token (public, no auth)
   POST /paperwork/upload/{token}/files  → upload file (public, no auth)
   GET  /paperwork/invoices/{id}/documents → list docs (require_authenticated)
   ```

   - `POST /paperwork/requests`: body `{ invoice_id, doc_types[], notes?, recipient_email? }`
     - Returns `{ request_id, token, magic_link, expires_at, doc_types, notes }`

   - `GET /paperwork/upload/{token}`:
     - No auth. Returns `{ invoice_number, carrier_name, amount, doc_types, notes, expires_at, status }` or 404/410 if expired

   - `POST /paperwork/upload/{token}/files`:
     - No auth. Accepts `multipart/form-data` with fields: `file` (file), `doc_type` (str)
     - Max file size: 20MB (enforce in route)
     - Returns the created `invoice_documents` record

   - `GET /paperwork/invoices/{id}/documents`:
     - Auth required. Returns list of documents + list of open requests for the invoice

**Done when:** All 4 endpoints return correct responses. Token expiry and 410 on expired token work correctly.

---

## P3 — Backend: Wire router + api.ts

**Depends on:** P2
**Files:**
- `fleetpulse-dispatcher/backend/app/main.py`
- `fleetpulse-dispatcher/frontend/services/api.ts`

**Goal:** Register the new paperwork router and expose 4 typed API functions.

**Steps:**

1. In `main.py` add:
   ```python
   from app.paperwork.routes import router as paperwork_router
   api_v1.include_router(paperwork_router)
   ```

2. In `api.ts` add 4 functions after the existing AI endpoints section:
   ```typescript
   // ── Paperwork / Document Upload ──

   export async function requestPaperwork(data: {
     invoice_id: string;
     doc_types: string[];
     notes?: string;
     recipient_email?: string;
   })

   export async function validateUploadToken(token: string)
     // → GET /paperwork/upload/{token} (no auth header needed)

   export async function uploadInvoiceFile(token: string, file: File, docType: string)
     // → POST /paperwork/upload/{token}/files (multipart, no auth)

   export async function listInvoiceDocuments(invoiceId: string)
     // → GET /paperwork/invoices/{invoiceId}/documents
   ```
   Note: `validateUploadToken` and `uploadInvoiceFile` must NOT inject the auth header (public endpoints).

**Done when:** Functions are exported, types are correct, no-auth variants skip the Bearer header.

---

## P4 — Frontend: Public upload page

**Depends on:** P3
**Files:**
- `fleetpulse-dispatcher/frontend/app/(public)/upload/[token]/page.tsx` (new)
- `fleetpulse-dispatcher/frontend/app/(public)/layout.tsx` (new — minimal, no nav/auth)

**Goal:** Driver-facing page. Shows what's needed, lets driver upload files one at a time.

**Steps:**

1. Create `(public)/layout.tsx` — bare layout, no NavBar, no auth check:
   ```tsx
   export default function PublicLayout({ children }) {
     return <div style={{ minHeight: "100vh", background: "#0d1318", color: "#f0f6fc" }}>{children}</div>
   }
   ```

2. Create `upload/[token]/page.tsx` as a **client component**:
   - On mount: call `validateUploadToken(token)` — if error/expired, show "This link has expired or is invalid" with contact message
   - Show: invoice number, what's requested (doc_types as chips), notes from dispatcher
   - Show upload state per doc_type: pending / uploaded (with filename)
   - File input: `<input type="file" accept="image/*,application/pdf" capture="environment">` — enables camera on mobile
   - On file selected: call `uploadInvoiceFile(token, file, docType)` → show success/error per file
   - When all doc_types fulfilled: show "All done! Thank you." confirmation state
   - Keep it simple: dark background, brand-amber accents, large touch targets for mobile

3. UX states to handle:
   - `loading` — validating token
   - `expired` / `invalid` — show error
   - `fulfilled` — all docs uploaded, show confirmation
   - `uploading` — per-file upload in progress
   - `error` — per-file upload error with retry

**Done when:** Page loads from token, shows correct invoice context, file upload succeeds and returns doc record, camera capture works on mobile (test with devtools mobile emulation).

---

## P5 — Frontend: `PaperworkRequestModal` component

**Depends on:** P3
**Files:**
- `fleetpulse-dispatcher/frontend/components/PaperworkRequestModal.tsx` (new)

**Goal:** Dispatcher picks doc types, adds notes, gets a copyable magic link.

**Steps:**

1. Props: `{ invoiceId: string; invoiceNumber: string; onClose: () => void; onRequestCreated: () => void }`

2. State: `docTypes` (checkbox set), `notes` (textarea), `recipientEmail` (input, optional), `loading`, `result` (the created request with magic_link), `copied` (bool)

3. Doc type options with friendly labels:
   ```
   BOL          → Bill of Lading
   POD          → Proof of Delivery
   RATE_CON     → Rate Confirmation
   WEIGHT_TICKET → Weight Ticket
   LUMPER_RECEIPT → Lumper Receipt
   INVOICE      → Invoice Copy
   OTHER        → Other
   ```

4. Form state (pre-result):
   - Checkboxes for each doc type (at least 1 required)
   - `Notes` textarea — optional dispatcher note shown to driver
   - `Send to email` input — optional, labeled "Optional — you can also share the link manually"
   - Submit button: "Generate Link"

5. Result state (post-submit):
   - Show success banner
   - Display the magic link in a read-only input with "Copy Link" button
   - Copy button uses `navigator.clipboard.writeText(link)` → shows "Copied!" for 2s
   - "Done" button closes modal + calls `onRequestCreated()`

**Done when:** Modal opens from invoice detail, generates a valid link, copy button works, `onRequestCreated` triggers document list refresh.

---

## P6 — Frontend: `InvoiceDetailModal` — tabbed view

**Depends on:** P4, P5
**Files:**
- `fleetpulse-dispatcher/frontend/components/InvoiceDetailModal.tsx` (new)
- `fleetpulse-dispatcher/frontend/app/(dispatcher)/invoices/page.tsx` (edit: replace `EditInvoiceModal` with `InvoiceDetailModal`)
- `fleetpulse-dispatcher/frontend/components/InvoiceRow.tsx` (edit: update `onEdit` prop to open detail modal)

**Goal:** Replace the basic edit modal with a two-tab modal: Details (existing edit form) + Documents (uploaded files + request paperwork).

**Steps:**

1. Create `InvoiceDetailModal.tsx`:
   - Props: `{ invoice: Invoice; carriers: Carrier[]; onClose: () => void; onSaved: () => void }`
   - Internal state: `activeTab: "details" | "documents"`, `documents`, `loadingDocs`, `showRequestModal`

2. Tab: **Details** — move the existing `EditInvoiceModal` form content here verbatim (invoice #, carrier, amount, dates, AP email, notes). Keep all existing save logic.

3. Tab: **Documents**:
   - On tab open (or on mount): call `listInvoiceDocuments(invoice.id)` to fetch:
     - `documents`: list of uploaded files
     - `requests`: list of open paperwork requests (with status + link)
   - Uploaded files section: each doc shows `doc_type` chip, `file_name`, `uploaded_at`, and a link to view/download (`file_url`)
   - Open requests section: each request shows doc types requested, status badge (pending/fulfilled/expired), and "Copy Link" button
   - "Request Paperwork" button → opens `PaperworkRequestModal` → on close refresh docs

4. Visual design:
   - Modal: same dimensions as existing (480px wide, maxHeight 80vh with scroll)
   - Tabs: two pill buttons at top — `Details` | `Documents` with a badge count on Documents if files exist
   - Documents list: simple card per file — icon (📄 for PDF, 🖼 for image), filename, doc type chip, timestamp
   - Empty state on Documents tab: "No documents yet. Use 'Request Paperwork' to send a link to the driver."

5. In `invoices/page.tsx`:
   - Replace `<EditInvoiceModal` with `<InvoiceDetailModal`
   - Update import

**Done when:** Clicking "Edit" on any invoice opens the new modal. Details tab saves correctly. Documents tab loads and displays files. Request Paperwork flow completes end-to-end.

---

## Post-Implementation: Update Artifacts

**Files:**
- `.claude/map.md` — add `PAPERWORK / DOCUMENT UPLOAD` section
- `.claude/progress.md` — mark complete

---

## Open Questions / Future Work
- **Email delivery**: Currently link-only. Wire SendGrid in a future enhancement to auto-send to `recipient_email`.
- **Storage bucket**: Must be manually created in Supabase dashboard before P2 backend works. Add to setup docs.
- **File size limit**: Set to 20MB per file in route. Supabase Storage default limit may need adjustment.
- **RLS on new tables**: The migration should add appropriate RLS policies scoped to `organization_id`.
