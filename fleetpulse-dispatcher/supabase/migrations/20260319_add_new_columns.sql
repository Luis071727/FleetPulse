-- Migration: Align DB schema with backend code
-- Date: 2026-03-19
-- Run this ENTIRE script in Supabase SQL Editor

-- ============================================================
-- 1. LOADS — make city/state columns nullable, add missing columns
-- ============================================================
ALTER TABLE loads ALTER COLUMN origin_city DROP NOT NULL;
ALTER TABLE loads ALTER COLUMN origin_state DROP NOT NULL;
ALTER TABLE loads ALTER COLUMN destination_city DROP NOT NULL;
ALTER TABLE loads ALTER COLUMN destination_state DROP NOT NULL;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS origin text;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS destination text;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS broker_name text;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS rc_reference text;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS customer_ap_email text;
ALTER TABLE loads ADD COLUMN IF NOT EXISTS rate numeric(10,2);

-- ============================================================
-- 2. INVOICES — add columns the backend writes
-- ============================================================
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_ap_email text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS broker_name text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sent_at timestamptz;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS followups_sent integer NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS last_followup_tone text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS carrier_name text;

-- ============================================================
-- 3. CARRIERS — add columns the backend writes
-- ============================================================
ALTER TABLE carriers ADD COLUMN IF NOT EXISTS owner_name text;
ALTER TABLE carriers ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE carriers ADD COLUMN IF NOT EXISTS whatsapp text;
ALTER TABLE carriers ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE carriers ADD COLUMN IF NOT EXISTS mailing_address text;
ALTER TABLE carriers ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE carriers ADD COLUMN IF NOT EXISTS operating_status varchar(50);
ALTER TABLE carriers ADD COLUMN IF NOT EXISTS authority_status varchar(50);
ALTER TABLE carriers ADD COLUMN IF NOT EXISTS safety_rating varchar(50);
ALTER TABLE carriers ADD COLUMN IF NOT EXISTS verification_status varchar(20) DEFAULT 'unverified';

-- ============================================================
-- 4. GRANTS — ensure service_role and authenticated can access all tables
-- ============================================================
GRANT ALL ON TABLE public.organizations TO service_role;
GRANT ALL ON TABLE public.users TO service_role;
GRANT ALL ON TABLE public.carriers TO service_role;
GRANT ALL ON TABLE public.brokers TO service_role;
GRANT ALL ON TABLE public.loads TO service_role;
GRANT ALL ON TABLE public.invoices TO service_role;
GRANT ALL ON TABLE public.fmcsa_cache TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.carriers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.brokers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.loads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.invoices TO authenticated;
GRANT SELECT ON TABLE public.fmcsa_cache TO authenticated;

GRANT SELECT ON TABLE public.organizations TO anon;
GRANT SELECT ON TABLE public.fmcsa_cache TO anon;

-- ============================================================
-- 5. RLS POLICIES — ensure write policies exist
-- ============================================================
DROP POLICY IF EXISTS organizations_insert ON organizations;
DROP POLICY IF EXISTS organizations_update ON organizations;
DROP POLICY IF EXISTS users_insert ON users;
DROP POLICY IF EXISTS users_update ON users;
DROP POLICY IF EXISTS brokers_read ON brokers;
DROP POLICY IF EXISTS brokers_insert ON brokers;
DROP POLICY IF EXISTS brokers_update ON brokers;
DROP POLICY IF EXISTS fmcsa_cache_insert ON fmcsa_cache;
DROP POLICY IF EXISTS fmcsa_cache_update ON fmcsa_cache;

CREATE POLICY organizations_insert ON organizations FOR INSERT WITH CHECK (true);
CREATE POLICY organizations_update ON organizations FOR UPDATE USING (true);
CREATE POLICY users_insert ON users FOR INSERT WITH CHECK (true);
CREATE POLICY users_update ON users FOR UPDATE USING (true);
CREATE POLICY brokers_read ON brokers FOR SELECT USING (true);
CREATE POLICY brokers_insert ON brokers FOR INSERT WITH CHECK (true);
CREATE POLICY brokers_update ON brokers FOR UPDATE USING (true);
CREATE POLICY fmcsa_cache_insert ON fmcsa_cache FOR INSERT WITH CHECK (true);
CREATE POLICY fmcsa_cache_update ON fmcsa_cache FOR UPDATE USING (true);
