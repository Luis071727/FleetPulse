-- ── Compliance Document Lifecycle ─────────────────────────────────────────────
-- Adds versioning columns on compliance_documents (superseded_at, is_active)
-- and creates compliance_pending_actions, a derived-state table rebuilt by
-- CarrierComplianceService.sync_pending_actions() whenever a doc changes.

-- 1. Document versioning
ALTER TABLE public.compliance_documents
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_active     boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_compliance_docs_is_active
  ON public.compliance_documents (carrier_id, doc_type, is_active);

-- 2. Pending actions table (derived state, rebuilt on every doc change)
CREATE TABLE IF NOT EXISTS public.compliance_pending_actions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid             NOT NULL,
  carrier_id       uuid             NOT NULL,
  doc_id           uuid,                              -- null when missing
  doc_type         text             NOT NULL,
  kind             text             NOT NULL,        -- expired | expiring_soon | missing
  expires_at       date,
  days_remaining   integer,
  notified_at      timestamptz,                      -- reserved for cron reminders
  created_at       timestamptz      NOT NULL DEFAULT now(),
  UNIQUE (carrier_id, doc_type, kind)
);

CREATE INDEX IF NOT EXISTS idx_pending_actions_carrier
  ON public.compliance_pending_actions (carrier_id);
CREATE INDEX IF NOT EXISTS idx_pending_actions_org
  ON public.compliance_pending_actions (organization_id);

-- 3. RLS + grants (service role bypasses RLS but still needs GRANT)
ALTER TABLE public.compliance_pending_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_members_manage_pending_actions ON public.compliance_pending_actions;
CREATE POLICY org_members_manage_pending_actions
  ON public.compliance_pending_actions
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users WHERE id = auth.uid()
    )
    OR
    carrier_id IN (
      SELECT id FROM public.carriers WHERE user_id = auth.uid()
    )
  );

GRANT ALL ON TABLE public.compliance_pending_actions TO service_role;
GRANT ALL ON TABLE public.compliance_pending_actions TO authenticated;
