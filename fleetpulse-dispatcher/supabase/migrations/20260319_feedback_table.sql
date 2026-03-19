-- Feedback / issue reports from users
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id),
  user_id uuid,
  user_email text,
  category text NOT NULL DEFAULT 'bug',        -- bug, feature, ux, other
  page text,                                    -- auto-captured: /dashboard, /carriers, etc.
  description text NOT NULL,
  screenshot_url text,                          -- future: screenshot uploads
  severity text NOT NULL DEFAULT 'medium',      -- low, medium, high, critical
  status text NOT NULL DEFAULT 'new',           -- new, reviewed, in_progress, resolved, wont_fix
  admin_notes text,                             -- internal notes for triaging
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_org ON feedback(organization_id);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at DESC);

-- Permissions
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.feedback TO service_role;
GRANT SELECT, INSERT ON TABLE public.feedback TO authenticated;
GRANT INSERT ON TABLE public.feedback TO anon;

CREATE POLICY feedback_insert ON feedback FOR INSERT WITH CHECK (true);
CREATE POLICY feedback_read ON feedback FOR SELECT USING (true);
