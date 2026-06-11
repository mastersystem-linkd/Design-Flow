-- ═══════════════════════════════════════════
-- "Sampling Required?" on task completion
-- ═══════════════════════════════════════════
-- A designer can flag a task as needing sampling at (or after) completion.
-- When flagged ON, the app auto-creates a pending sample row linked to the
-- task. Flagging does NOT change task status (stays 'completed').

-- Track the sampling requirement on tasks.
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS sampling_required   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sampling_flagged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sampling_flagged_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Sample lifecycle status + where the sample came from.
-- (samples.task_id already exists from 0019_samples_task_link — NOT re-added.)
-- Existing rows default to sample_status='pending', source='manual', so they
-- keep showing in the main Samples tab. The Pending-Samples sub-tab filters
-- specifically on source='task_completion'.
ALTER TABLE public.samples
  ADD COLUMN IF NOT EXISTS sample_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (sample_status IN ('pending', 'in_progress', 'completed')),
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'task_completion'));

-- Indexes for the Pending Samples sub-tab + the task→sample link.
CREATE INDEX IF NOT EXISTS idx_samples_status_source
  ON public.samples(sample_status, source);
CREATE INDEX IF NOT EXISTS idx_samples_task_link
  ON public.samples(task_id) WHERE task_id IS NOT NULL;

-- At most ONE auto-created (task_completion) sample per task. Atomic backstop
-- for the count-then-insert dedup in createPendingSampleFromTask — a concurrent
-- second insert hits this unique index instead of creating a duplicate row.
CREATE UNIQUE INDEX IF NOT EXISTS uq_samples_task_completion
  ON public.samples(task_id) WHERE source = 'task_completion';
