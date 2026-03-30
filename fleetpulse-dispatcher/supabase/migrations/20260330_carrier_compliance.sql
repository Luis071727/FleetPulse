-- ── P1: Carrier Compliance Document Management ────────────────────────────────
-- Enhances compliance_documents with file attachment + date tracking.
-- Creates carrier_document_requests for the magic-link upload flow.

-- 1. Enhance compliance_documents with file + date columns
ALTER TABLE public.compliance_documents
  ADD COLUMN IF NOT EXISTS issue_date       date,
  ADD COLUMN IF NOT EXISTS file_url         text,
  ADD COLUMN IF NOT EXISTS file_name        text,
  ADD COLUMN IF NOT EXISTS file_size        bigint,
  ADD COLUMN IF NOT EXISTS request_id       uuid,  -- null = direct dispatcher upload
  ADD COLUMN IF NOT EXISTS organization_id  uuid,
  ADD COLUMN IF NOT EXISTS uploaded_at      timestamptz DEFAULT now();

-- 2. carrier_document_requests table
CREATE TABLE IF NOT EXISTS public.carrier_document_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token            uuid UNIQUE      DEFAULT gen_random_uuid(),
  organization_id  uuid             NOT NULL,
  carrier_id       uuid             NOT NULL,
  doc_types        text[]           NOT NULL,
  notes            text,
  recipient_email  text,
  status           text             NOT NULL DEFAULT 'pending',  -- pending / fulfilled / expired
  expires_at       timestamptz      NOT NULL DEFAULT now() + interval '72 hours',
  fulfilled_at     timestamptz,
  created_at       timestamptz      DEFAULT now()
);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_carrier_doc_requests_token     ON public.carrier_document_requests (token);
CREATE INDEX IF NOT EXISTS idx_carrier_doc_requests_carrier   ON public.carrier_document_requests (carrier_id);
CREATE INDEX IF NOT EXISTS idx_compliance_docs_request        ON public.compliance_documents (request_id);
CREATE INDEX IF NOT EXISTS idx_compliance_docs_carrier        ON public.compliance_documents (carrier_id);

-- 4. RLS
ALTER TABLE public.carrier_document_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can manage carrier doc requests"
  ON public.carrier_document_requests
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users WHERE id = auth.uid()
    )
  );

-- 5. Grants — service_role must have explicit table grants even though it bypasses RLS
GRANT ALL ON TABLE public.carrier_document_requests TO service_role;
GRANT ALL ON TABLE public.carrier_document_requests TO authenticated;
GRANT ALL ON TABLE public.compliance_documents      TO service_role;
GRANT ALL ON TABLE public.compliance_documents      TO authenticated;
