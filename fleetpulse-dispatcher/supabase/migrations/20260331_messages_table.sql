-- Create messages table for load-level dispatcher ↔ carrier messaging
-- This table was missing from init_schema; adding it now.

CREATE TABLE IF NOT EXISTS public.messages (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    load_id     UUID        NOT NULL REFERENCES public.loads(id) ON DELETE CASCADE,
    sender_id   UUID,
    sender_role TEXT        NOT NULL CHECK (sender_role IN ('dispatcher', 'carrier')),
    body        TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_load_id_idx ON public.messages (load_id);

-- Enable RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Org-scoped read/write (dispatchers): via load FK
CREATE POLICY IF NOT EXISTS messages_org_rw ON public.messages
    FOR ALL USING (
        load_id IN (
            SELECT id FROM public.loads
            WHERE organization_id::text = current_setting('request.jwt.claim.organization_id', true)
        )
    );

-- Carrier self-read: via load FK
CREATE POLICY IF NOT EXISTS messages_carrier_read ON public.messages
    FOR SELECT USING (
        load_id IN (
            SELECT id FROM public.loads
            WHERE carrier_id::text = current_setting('request.jwt.claim.carrier_id', true)
        )
    );

-- Carrier self-insert: can only post to their own loads
CREATE POLICY IF NOT EXISTS messages_carrier_insert ON public.messages
    FOR INSERT WITH CHECK (
        load_id IN (
            SELECT id FROM public.loads
            WHERE carrier_id::text = current_setting('request.jwt.claim.carrier_id', true)
        )
    );

-- Grants
GRANT ALL ON TABLE public.messages TO service_role;
GRANT SELECT, INSERT ON TABLE public.messages TO authenticated;
