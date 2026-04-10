-- Add portal_mode column to carriers table
-- 'managed'     = dispatcher-managed (default) — carrier can only view/upload docs
-- 'self_managed' = carrier manages their own loads and invoices

ALTER TABLE public.carriers
  ADD COLUMN IF NOT EXISTS portal_mode TEXT NOT NULL DEFAULT 'managed'
  CONSTRAINT carriers_portal_mode_check CHECK (portal_mode IN ('managed', 'self_managed'));

-- Allow carriers to see their own portal_mode (already covered by existing RLS)
-- No new policies needed — existing service-role queries handle writes
