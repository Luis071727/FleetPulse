-- Invoice Paperwork Magic Link
-- Tracks dispatcher paperwork requests (with shareable tokens) and driver-uploaded files.

-- ── invoice_document_requests ──────────────────────────────────────────────
-- Each row represents one "please send me these docs" request from a dispatcher.
-- The token is the unguessable secret embedded in the magic link URL.

CREATE TABLE IF NOT EXISTS invoice_document_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id       uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  doc_types        text[] NOT NULL DEFAULT '{}',
  notes            text,
  recipient_email  text,
  token            uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  expires_at       timestamptz NOT NULL DEFAULT (now() + interval '72 hours'),
  status           text NOT NULL DEFAULT 'pending',  -- pending | fulfilled | expired
  created_at       timestamptz NOT NULL DEFAULT now(),
  fulfilled_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_inv_doc_req_token   ON invoice_document_requests(token);
CREATE INDEX IF NOT EXISTS idx_inv_doc_req_invoice ON invoice_document_requests(invoice_id);

ALTER TABLE invoice_document_requests ENABLE ROW LEVEL SECURITY;

-- Dispatchers in the same org can do everything
CREATE POLICY inv_doc_req_org_rw ON invoice_document_requests
  FOR ALL USING (organization_id::text = current_setting('request.jwt.claim.organization_id', true));


-- ── invoice_documents ──────────────────────────────────────────────────────
-- Each row is one file uploaded by a driver (or dispatcher) against a request.

CREATE TABLE IF NOT EXISTS invoice_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id       uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  request_id       uuid REFERENCES invoice_document_requests(id) ON DELETE SET NULL,
  doc_type         text NOT NULL DEFAULT 'OTHER',
  file_name        text NOT NULL,
  file_url         text NOT NULL,
  file_size        bigint,
  uploaded_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_docs_invoice ON invoice_documents(invoice_id);
CREATE INDEX IF NOT EXISTS idx_inv_docs_request ON invoice_documents(request_id);

ALTER TABLE invoice_documents ENABLE ROW LEVEL SECURITY;

-- Dispatchers in the same org can read all docs
CREATE POLICY inv_docs_org_rw ON invoice_documents
  FOR ALL USING (organization_id::text = current_setting('request.jwt.claim.organization_id', true));


-- ── Grant permissions ──────────────────────────────────────────────────────
-- Service role bypasses RLS; these grants cover anon/authenticated roles
-- used by PostgREST when the backend calls with the service key.

GRANT SELECT, INSERT, UPDATE ON invoice_document_requests TO authenticated;
GRANT SELECT, INSERT         ON invoice_documents          TO authenticated;

-- MANUAL STEP (cannot be done via SQL):
--   In Supabase Dashboard → Storage → Create bucket named "invoice-documents"
--   Set to private (not public). The backend will generate signed URLs per file.
