-- Grant service_role access to the paperwork tables introduced in 20260329_invoice_paperwork.sql.
-- The backend uses the service_role key; without these grants PostgREST returns
-- "permission denied for table invoice_document_requests" (42501).

GRANT ALL ON TABLE public.invoice_document_requests TO service_role;
GRANT ALL ON TABLE public.invoice_documents         TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.invoice_document_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.invoice_documents         TO authenticated;
