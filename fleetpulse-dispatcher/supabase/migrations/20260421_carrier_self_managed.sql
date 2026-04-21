-- Allow self-managed carriers to create loads and invoices without a dispatcher org.
-- Root cause: organization_id was NOT NULL, but carrier-portal POSTs always set it NULL.
-- This caused a DB constraint error → backend 500 → "Failed to create load/invoice".

-- 1. Make organization_id nullable on both tables
ALTER TABLE public.loads   ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE public.invoices ALTER COLUMN organization_id DROP NOT NULL;

-- 2. Loads: replace JWT-claim-based read policy with auth.uid() lookup (works for
--    all Supabase session types, including OTP / magic-link).
DROP POLICY IF EXISTS carrier_self_load_read ON public.loads;
CREATE POLICY carrier_self_load_read ON public.loads
  FOR SELECT USING (
    carrier_id IN (SELECT id FROM public.carriers WHERE user_id = auth.uid())
  );

-- Carriers may also INSERT and UPDATE their own loads (self-managed flow).
DROP POLICY IF EXISTS carrier_self_load_insert ON public.loads;
CREATE POLICY carrier_self_load_insert ON public.loads
  FOR INSERT WITH CHECK (
    carrier_id IN (SELECT id FROM public.carriers WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS carrier_self_load_update ON public.loads;
CREATE POLICY carrier_self_load_update ON public.loads
  FOR UPDATE USING (
    carrier_id IN (SELECT id FROM public.carriers WHERE user_id = auth.uid())
  );

-- 3. Invoices: add auth.uid()-based read/insert/update policies.
--    The old carrier_self_invoice_read used a JWT claim that is never set for
--    standard Supabase sessions, so carriers couldn't see their own invoices.
DROP POLICY IF EXISTS carrier_self_invoice_read ON public.invoices;
CREATE POLICY carrier_self_invoice_read ON public.invoices
  FOR SELECT USING (
    carrier_id IN (SELECT id FROM public.carriers WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS carrier_self_invoice_insert ON public.invoices;
CREATE POLICY carrier_self_invoice_insert ON public.invoices
  FOR INSERT WITH CHECK (
    carrier_id IN (SELECT id FROM public.carriers WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS carrier_self_invoice_update ON public.invoices;
CREATE POLICY carrier_self_invoice_update ON public.invoices
  FOR UPDATE USING (
    carrier_id IN (SELECT id FROM public.carriers WHERE user_id = auth.uid())
  );
