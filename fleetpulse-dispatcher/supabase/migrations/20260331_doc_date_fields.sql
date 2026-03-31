-- Add issued_at to compliance_documents (expires_at already exists)
ALTER TABLE public.compliance_documents
  ADD COLUMN IF NOT EXISTS issued_at date;

-- Add issued_at and expires_at to invoice_documents
ALTER TABLE invoice_documents
  ADD COLUMN IF NOT EXISTS issued_at date,
  ADD COLUMN IF NOT EXISTS expires_at date;
