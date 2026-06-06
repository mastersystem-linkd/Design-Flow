-- Per-portion Design Type so each sub-task can target a different design category.
ALTER TABLE public.task_assignments
  ADD COLUMN IF NOT EXISTS design_type TEXT;

COMMENT ON COLUMN public.task_assignments.design_type IS
  'Design Type for this designer''s sub-task. Same option source as the New Brief form''s Design Type field. Set at claim time, editable until the portion is completed.';
