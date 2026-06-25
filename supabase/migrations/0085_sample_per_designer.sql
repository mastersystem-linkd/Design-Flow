-- Migration: widen the task-completion sample dedup key to include created_by.
-- Each designer's portion in a split task should produce its own sample entry,
-- even when two designers happen to pick the same fabric + design type.

DROP INDEX IF EXISTS public.uq_samples_task_completion;

CREATE UNIQUE INDEX uq_samples_task_completion
  ON public.samples (
    task_id,
    COALESCE(quality, ''),
    COALESCE(design_type, ''),
    COALESCE(created_by, '00000000-0000-0000-0000-000000000000')
  )
  WHERE source = 'task_completion';
