-- ============================================================================
-- Widen salvedge_records RLS so design_coordinator can manage records
-- ============================================================================
-- The original migration (0010) used is_admin() which only matches 'admin'.
-- Coordinators need full CRUD on salvedge just like they have on tasks/samples.
-- Also widen samples policies for consistency.

-- Idempotent: drops BOTH the old admin-only policy AND the new name before
-- recreating, so this is safe to re-run.

BEGIN;

-- ---- salvedge_records: admin → admin_or_coordinator ----
DROP POLICY IF EXISTS "salvedge_admin_all" ON public.salvedge_records;
DROP POLICY IF EXISTS "salvedge_admin_or_coordinator_all" ON public.salvedge_records;

CREATE POLICY "salvedge_admin_or_coordinator_all"
  ON public.salvedge_records FOR ALL
  USING  (public.is_admin_or_coordinator())
  WITH CHECK (public.is_admin_or_coordinator());

-- ---- samples: same fix ----
DROP POLICY IF EXISTS "samples_admin_all" ON public.samples;
DROP POLICY IF EXISTS "samples_admin_or_coordinator_all" ON public.samples;

CREATE POLICY "samples_admin_or_coordinator_all"
  ON public.samples FOR ALL
  USING  (public.is_admin_or_coordinator())
  WITH CHECK (public.is_admin_or_coordinator());

COMMIT;
