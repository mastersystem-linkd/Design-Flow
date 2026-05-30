-- ============================================================================
-- 0042_clients_group_unique.sql
-- ----------------------------------------------------------------------------
-- Replace the legacy global UNIQUE(party_name) with a per-group
-- UNIQUE(party_name, client_group). The base schema (0001) made party_name
-- globally unique, but 0037 split clients into 'ld' / 'job_work' segments and
-- the intended design (CLAUDE.md §12.2) is that the SAME party name may exist
-- in BOTH groups. The global unique blocked that and contradicted the in-app
-- per-group duplicate detection. This realigns the DB backstop with that design.
-- ============================================================================

-- 1. Collapse any exact (party_name, client_group) duplicates so the new
--    composite unique can be created. Keeps the earliest physical row.
DELETE FROM public.clients a
USING public.clients b
WHERE a.ctid > b.ctid
  AND a.party_name = b.party_name
  AND a.client_group = b.client_group;

-- 2. Drop whatever single-column UNIQUE constraint sits on party_name
--    (auto-named clients_party_name_key in 0001, but resolve it dynamically
--    so this is robust to naming).
DO $$
DECLARE
  c text;
BEGIN
  SELECT conname INTO c
  FROM pg_constraint
  WHERE conrelid = 'public.clients'::regclass
    AND contype = 'u'
    AND array_length(conkey, 1) = 1
    AND conkey[1] = (
      SELECT attnum FROM pg_attribute
      WHERE attrelid = 'public.clients'::regclass
        AND attname = 'party_name'
    );
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.clients DROP CONSTRAINT %I', c);
  END IF;
END $$;

-- 3. Add the per-group composite unique (idempotent guard).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.clients'::regclass
      AND conname = 'clients_party_name_group_key'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_party_name_group_key UNIQUE (party_name, client_group);
  END IF;
END $$;
