-- ═══════════════════════════════════════════════════════════════
-- 0074 — Allow 'sales_erp' as a samples.source value
--
-- The CHECK constraint from 0069 only permits 'manual' and
-- 'task_completion'. This widens it to include 'sales_erp'
-- for the external integration (ext-create-sample).
-- ═══════════════════════════════════════════════════════════════

-- Drop the existing inline CHECK (Postgres auto-names inline checks
-- as <table>_<column>_check, but it can also be <table>_check or
-- <table>_source_check depending on version).
-- Try all common names to be safe:
ALTER TABLE public.samples DROP CONSTRAINT IF EXISTS samples_source_check;
ALTER TABLE public.samples DROP CONSTRAINT IF EXISTS samples_check;
ALTER TABLE public.samples DROP CONSTRAINT IF EXISTS samples_source_check1;

-- Re-add with 'sales_erp' included
ALTER TABLE public.samples
  ADD CONSTRAINT samples_source_check
  CHECK (source IN ('manual', 'task_completion', 'sales_erp'));
