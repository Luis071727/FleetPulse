# Plan: Carrier Compliance Document Management
Status: READY
Branch: claude/add-claude-documentation-aOq5O → main
Created: 2026-03-30

## Summary
Reuse the invoice paperwork magic-link pattern for carrier compliance documents.
Dispatcher can upload docs directly or send a magic link to the owner/carrier.
Each document has `issue_date` + `expires_at` for expiry tracking.
A new `CarrierComplianceModal` becomes the central compliance hub per carrier.

## Phase Index
- [ ] P1 — DB migration (enhance compliance_documents + new carrier_document_requests table)
- [ ] P2 — Backend service (CarrierComplianceService)
- [ ] P3 — Backend routes + register router (depends: P1, P2)
- [ ] P4 — Frontend API functions in api.ts (depends: P3)
- [ ] P5 — Public upload page for carriers (depends: P4)
- [ ] P6 — CarrierComplianceModal + CarrierDocumentRequestModal components (depends: P4)
- [ ] P7 — Wire into carriers/page.tsx drawer (depends: P6)

---

## P1 — DB Migration

**Depends on:** none
**Files:**
- `fleetpulse-dispatcher/supabase/migrations/20260330_carrier_compliance.sql`

**Goal:** Enhance compliance_documents with file + date fields; create carrier_document_requests table.

**Steps:**
1. Add columns to `compliance_documents`:
   - `issue_date date`
   - `file_url text` (stores storage path, signed URL generated at read time)
   - `file_name text`
   - `file_size bigint`
   - `request_id uuid` (FK to carrier_document_requests, nullable — null = direct upload)
   - `organization_id uuid`
   - `uploaded_at timestamptz DEFAULT now()`
2. Create `carrier_document_requests` table:
   - `id uuid PK DEFAULT gen_random_uuid()`
   - `token uuid UNIQUE DEFAULT gen_random_uuid()`
   - `organization_id uuid NOT NULL`
   - `carrier_id uuid NOT NULL`
   - `doc_types text[] NOT NULL`
   - `notes text`
   - `recipient_email text`
   - `status text NOT NULL DEFAULT 'pending'` — pending / fulfilled / expired
   - `expires_at timestamptz NOT NULL DEFAULT now() + interval '72 hours'`
   - `fulfilled_at timestamptz`
   - `created_at timestamptz DEFAULT now()`
3. Add indexes: `carrier_document_requests(token)`, `carrier_document_requests(carrier_id)`, `compliance_documents(request_id)`, `compliance_documents(carrier_id)`
4. Enable RLS on both tables
5. GRANT ALL ON TABLE to `service_role` and `authenticated` for both tables

**Valid doc_types:** `MC_AUTHORITY`, `W9`, `VOID_CHECK`, `CARRIER_AGREEMENT`, `NOA`, `COI`, `CDL`, `OTHER`

**Done when:** Migration file created with correct SQL.

---

## P2 — Backend Service

**Depends on:** P1
**Files:**
- `fleetpulse-dispatcher/backend/app/carrier_compliance/__init__.py` (empty)
- `fleetpulse-dispatcher/backend/app/carrier_compliance/service.py`

**Goal:** `CarrierComplianceService` mirroring `PaperworkService` but for carrier docs.

**Steps:**
1. `create_request(carrier_id, org_id, doc_types, notes, recipient_email)` → insert `carrier_document_requests`, build magic link using `settings.dispatcher_url + /carrier-upload/{token}`
2. `get_request_by_token(token)` → validate token, check expiry, enrich with carrier name
3. `upload_file(token, doc_type, filename, file_bytes, content_type, issue_date, expires_at)` → validate token, upload to `carrier-documents` Storage bucket at `{org_id}/{carrier_id}/{request_id}/{filename}`, insert `compliance_documents` row, call `_maybe_fulfill_request()`
4. `upload_file_direct(carrier_id, org_id, doc_type, filename, file_bytes, content_type, issue_date, expires_at)` → same but no token, storage path `{org_id}/{carrier_id}/direct/{filename}`
5. `list_documents(carrier_id, org_id)` → fetch compliance_documents + carrier_document_requests, generate signed URLs (3600s) for each doc
6. `_maybe_fulfill_request(req, sb)` → mark fulfilled when all doc_types uploaded

**VALID_DOC_TYPES:** `{"MC_AUTHORITY", "W9", "VOID_CHECK", "CARRIER_AGREEMENT", "NOA", "COI", "CDL", "OTHER"}`
**STORAGE_BUCKET:** `"carrier-documents"`

**Done when:** Service class complete with all 6 methods.

---

## P3 — Backend Routes + Register

**Depends on:** P2
**Files:**
- `fleetpulse-dispatcher/backend/app/carrier_compliance/routes.py`
- `fleetpulse-dispatcher/backend/app/main.py`

**Goal:** 5 endpoints covering request creation, public token validation/upload, direct upload, and document listing.

**Endpoints:**
- `POST /carrier-compliance/requests` — dispatcher auth — create magic link request
- `GET /carrier-compliance/upload/{token}` — public — validate token, return carrier context
- `POST /carrier-compliance/upload/{token}/files` — public — multipart: file + doc_type + issue_date? + expires_at?
- `POST /carrier-compliance/carriers/{carrier_id}/documents` — dispatcher auth — direct upload (multipart: file + doc_type + issue_date + expires_at)
- `GET /carrier-compliance/carriers/{carrier_id}/documents` — auth — return `{ documents[], requests[] }`

**Done when:** All routes wired, router registered in `main.py`.

---

## P4 — Frontend API Functions

**Depends on:** P3
**Files:**
- `fleetpulse-dispatcher/frontend/services/api.ts`

**Goal:** 5 new functions at bottom of api.ts.

**Functions:**
- `requestCarrierDocs(data)` — POST /carrier-compliance/requests (auth)
- `validateCarrierUploadToken(token)` — GET /carrier-compliance/upload/{token} (no auth)
- `uploadCarrierFile(token, file, docType, issueDate?, expiresAt?)` — POST .../files (no auth, multipart)
- `uploadCarrierFileDirect(carrierId, file, docType, issueDate, expiresAt)` — POST .../carriers/{id}/documents (auth, multipart)
- `listCarrierDocuments(carrierId)` — GET /carrier-compliance/carriers/{id}/documents (auth)

**Done when:** All 5 functions exported from api.ts.

---

## P5 — Public Upload Page

**Depends on:** P4
**Files:**
- `fleetpulse-dispatcher/frontend/app/(public)/carrier-upload/[token]/page.tsx`

**Goal:** Driver/carrier-facing page — same UX as `/upload/[token]` but with issue_date + expires_at inputs per doc.

**Steps:**
1. On mount: `validateCarrierUploadToken(token)` → show carrier name + requested doc types
2. Per-doc card: camera button, file picker, optional issue date input, optional expiry date input
3. On file selected: call `uploadCarrierFile(token, file, docType, issueDate, expiresAt)`
4. States: loading / linkError / allDone / per-doc uploading/done/error
5. Use same icons (AlertTriangle, CircleCheck, FileText, Camera, Upload) — no emojis

**Done when:** Page renders, uploads work end-to-end.

---

## P6 — CarrierComplianceModal + CarrierDocumentRequestModal

**Depends on:** P4
**Files:**
- `fleetpulse-dispatcher/frontend/components/CarrierDocumentRequestModal.tsx`
- `fleetpulse-dispatcher/frontend/components/CarrierComplianceModal.tsx`

**Goal:** `CarrierComplianceModal` is the central compliance hub. Mirrors `InvoiceDetailModal` Documents tab.

**CarrierDocumentRequestModal:**
- Checkbox selection of VALID_DOC_TYPES (MC_AUTHORITY, W9, VOID_CHECK, CARRIER_AGREEMENT, NOA, COI, CDL, OTHER)
- Notes field, optional recipient email
- On submit: `requestCarrierDocs()` → show magic link with Copy button

**CarrierComplianceModal:**
- Full-width modal (600px), title = carrier legal_name + "Compliance Documents"
- Upload toolbar: doc_type selector + issue_date input + expires_at input + Upload File button
- "Request from Carrier" button → opens CarrierDocumentRequestModal
- Documents list: each row shows doc_type badge, file_name (linked), issue_date, expires_at, expiry status badge (active/expiring_soon/expired)
  - Expiry logic: expired if expires_at < today; expiring_soon if within 30 days; active otherwise
- Open requests list: doc_types badges, status badge, created_at, Copy Link button
- Empty state with Folder icon

**Done when:** Both components render correctly, upload and request flows work.

---

## P7 — Wire into Carriers Page

**Depends on:** P6
**Files:**
- `fleetpulse-dispatcher/frontend/app/(dispatcher)/carriers/page.tsx`

**Goal:** Replace inline compliance docs section in drawer with a "Manage Documents" button that opens `CarrierComplianceModal`.

**Steps:**
1. Import `CarrierComplianceModal`
2. Add `showComplianceModal` state
3. In the Compliance Documents section of the drawer: keep the expiry summary (top 3 docs with status) but add "Manage Documents" button
4. Render `<CarrierComplianceModal>` when `showComplianceModal === true`
5. Remove `listPendingActions`/`listComplianceDocs` calls that are now handled inside the modal

**Done when:** Clicking "Manage Documents" opens the modal; modal loads docs for the selected carrier.

---

## Storage Bucket Note
Create `carrier-documents` bucket in Supabase Storage (private) before using in production.
Same pattern as `invoice-documents`.
