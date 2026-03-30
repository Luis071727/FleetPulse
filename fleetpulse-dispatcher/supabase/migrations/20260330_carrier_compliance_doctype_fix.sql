-- Fix: drop the old doc_type check constraint on compliance_documents and replace
-- it with one that includes the carrier compliance doc types.
-- The old constraint only allowed load-related types; we now also store
-- MC_AUTHORITY, W9, VOID_CHECK, CARRIER_AGREEMENT, NOA, COI, CDL, OTHER.

ALTER TABLE public.compliance_documents
  DROP CONSTRAINT IF EXISTS compliance_documents_doc_type_check;

ALTER TABLE public.compliance_documents
  ADD CONSTRAINT compliance_documents_doc_type_check
  CHECK (doc_type IN (
    -- original load / compliance types (keep for backwards compat)
    'BOL', 'POD', 'RATE_CON', 'INVOICE', 'INSURANCE', 'IFTA', 'PERMIT',
    -- carrier compliance doc types
    'MC_AUTHORITY', 'W9', 'VOID_CHECK', 'CARRIER_AGREEMENT', 'NOA', 'COI', 'CDL',
    -- catch-all
    'OTHER'
  ));
