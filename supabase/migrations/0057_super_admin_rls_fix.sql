-- ============================================================================
-- 0057 — give super_admin FULL access (all tables, all operations)
-- ============================================================================
-- super_admin was re-added to the user_role enum in 0048, but it never got real
-- admin power, so a super_admin hit "new row violates row-level security
-- policy" on tasks, clients, etc. Two reasons:
--   1) 0048's is_admin()/is_admin_or_coordinator() rewrites ran in the SAME
--      transaction as `ALTER TYPE ... ADD VALUE 'super_admin'`. Postgres forbids
--      using a newly-added enum value in that transaction, so those rewrites
--      failed — leaving the bodies that only match 'admin' (+ coordinator).
--   2) Many INSERT policies hard-code the role list and omit 'super_admin'.
--
-- Fix: (A) repair the helper functions (the enum value exists now, so this
-- works), and (B) add ONE permissive "super_admin can do everything" policy to
-- every RLS-enabled public table. Permissive policies are OR'd, so this grants
-- super_admin full CRUD regardless of each table's other policies, without
-- touching them. Idempotent.
-- ============================================================================

BEGIN;

-- (A) Helpers include super_admin.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.auth_role() IN ('super_admin', 'admin');
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_coordinator()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.auth_role() IN ('super_admin', 'admin', 'design_coordinator');
$$;

-- (B) Blanket super_admin FOR ALL policy on every RLS-enabled public table.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'           -- ordinary tables
      AND c.relrowsecurity = true   -- RLS enabled (tables without RLS already allow access)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'super_admin_all', r.tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS PERMISSIVE FOR ALL TO authenticated '
      || 'USING (public.auth_role() = %L) WITH CHECK (public.auth_role() = %L)',
      'super_admin_all', r.tbl, 'super_admin', 'super_admin'
    );
  END LOOP;
END $$;

COMMIT;
