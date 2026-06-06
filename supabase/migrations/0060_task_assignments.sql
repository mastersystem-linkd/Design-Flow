-- Task Assignments: split a single task among multiple designers.
-- Phase 1 — table, indexes, RLS, recalc trigger.

CREATE TABLE public.task_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  designer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  qty_assigned INTEGER NOT NULL CHECK (qty_assigned > 0),
  qty_completed INTEGER NOT NULL DEFAULT 0 CHECK (qty_completed >= 0),
  planned_deadline TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  delay_days INTEGER,
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'done', 'completed')),
  completion_fabric TEXT,
  completion_filled_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_task_assignments_task ON task_assignments(task_id);
CREATE INDEX idx_task_assignments_designer ON task_assignments(designer_id, status);
CREATE UNIQUE INDEX idx_task_assignments_unique_designer ON task_assignments(task_id, designer_id);

CREATE TRIGGER task_assignments_touch_updated
  BEFORE UPDATE ON task_assignments
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS is_split BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS qty_remaining INTEGER;

ALTER TABLE task_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_assignments_select_authenticated"
  ON task_assignments FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "task_assignments_insert_admin"
  ON task_assignments FOR INSERT WITH CHECK (is_admin_or_coordinator());

CREATE POLICY "task_assignments_insert_designer_self"
  ON task_assignments FOR INSERT WITH CHECK (auth.uid() = designer_id);

CREATE POLICY "task_assignments_update_own"
  ON task_assignments FOR UPDATE USING (auth.uid() = designer_id OR is_admin_or_coordinator());

CREATE POLICY "task_assignments_delete_admin"
  ON task_assignments FOR DELETE USING (is_admin_or_coordinator());

-- Recalc trigger: keep parent task in sync with its assignments.
CREATE OR REPLACE FUNCTION recalc_task_from_assignments()
RETURNS TRIGGER AS $$
DECLARE
  t_id UUID;
  total_assigned INTEGER;
  total_completed_qty INTEGER;
  all_done BOOLEAN;
  all_completed BOOLEAN;
  any_in_progress BOOLEAN;
  task_qty INTEGER;
BEGIN
  t_id := COALESCE(NEW.task_id, OLD.task_id);
  SELECT qty INTO task_qty FROM tasks WHERE id = t_id;

  SELECT
    COALESCE(SUM(qty_assigned), 0),
    COALESCE(SUM(qty_completed), 0),
    BOOL_AND(status IN ('done', 'completed')),
    BOOL_AND(status = 'completed'),
    BOOL_OR(status = 'in_progress')
  INTO total_assigned, total_completed_qty, all_done, all_completed, any_in_progress
  FROM task_assignments WHERE task_id = t_id;

  UPDATE tasks SET
    qty_completed = total_completed_qty,
    qty_remaining = GREATEST(task_qty - total_assigned, 0),
    is_split = (SELECT COUNT(*) > 1 FROM task_assignments WHERE task_id = t_id),
    status = CASE
      WHEN all_completed THEN 'completed'
      WHEN all_done THEN 'done'
      ELSE 'in_progress'
    END
  WHERE id = t_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER task_assignments_recalc
  AFTER INSERT OR UPDATE OR DELETE ON task_assignments
  FOR EACH ROW EXECUTE FUNCTION recalc_task_from_assignments();

-- Add to realtime so UI updates live.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'task_assignments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.task_assignments;
  END IF;
END $$;
