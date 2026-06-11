-- ═══════════════════════════════════════════
-- Per-design sampling for split tasks
-- ═══════════════════════════════════════════
-- A split task can be worked by several designers, each on a DIFFERENT fabric
-- and/or design. Sampling is done per design/fabric, so one task may need
-- several samples. Record the design type on the sample and switch the
-- task_completion dedup from one-per-task (0069) to one-per (task, fabric,
-- design type): different fabric/design ⇒ separate samples, identical portions
-- collapse to one.

-- Design type on the sample (so the Pending tab + dedup don't depend on the
-- parent task's `concept`, which can't represent per-portion designs).
ALTER TABLE public.samples
  ADD COLUMN IF NOT EXISTS design_type TEXT;

-- Replace 0069's one-sample-per-task unique index with the composite key.
-- COALESCE so NULL fabric/design collapse consistently (NULLs would otherwise
-- be treated as distinct by the unique index).
DROP INDEX IF EXISTS public.uq_samples_task_completion;
CREATE UNIQUE INDEX IF NOT EXISTS uq_samples_task_completion
  ON public.samples (task_id, COALESCE(quality, ''), COALESCE(design_type, ''))
  WHERE source = 'task_completion';
