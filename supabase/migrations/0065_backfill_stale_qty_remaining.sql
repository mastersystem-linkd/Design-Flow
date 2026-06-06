-- Backfill: repair stale qty_remaining / is_split on tasks that have assignment rows.
-- Also re-applies the corrected recalc trigger from 0063 (CREATE OR REPLACE is idempotent).

-- 1. Backfill stale task rows from current assignment state.
UPDATE public.tasks t
SET qty_remaining = GREATEST(t.qty - COALESCE(s.sum_assigned, 0), 0),
    qty_completed = COALESCE(s.sum_completed, 0),
    is_split      = COALESCE(s.n, 0) > 1,
    status        = CASE
      WHEN s.all_completed AND GREATEST(t.qty - COALESCE(s.sum_assigned, 0), 0) = 0 THEN 'completed'
      WHEN s.all_done_plus AND GREATEST(t.qty - COALESCE(s.sum_assigned, 0), 0) = 0 THEN 'done'
      ELSE 'in_progress'
    END
FROM (
  SELECT
    task_id,
    COUNT(*)                                           AS n,
    SUM(qty_assigned)                                  AS sum_assigned,
    SUM(qty_completed)                                 AS sum_completed,
    BOOL_AND(status = 'completed')                     AS all_completed,
    BOOL_AND(status IN ('done','completed'))            AS all_done_plus
  FROM public.task_assignments
  GROUP BY task_id
) s
WHERE s.task_id = t.id;

-- 2. Re-apply the corrected trigger function (idempotent CREATE OR REPLACE).
CREATE OR REPLACE FUNCTION public.recalc_task_from_assignments()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_task_id       UUID;
  v_task_qty      INTEGER;
  v_n             INTEGER;
  v_completed     INTEGER;
  v_done_plus     INTEGER;
  v_sum_assigned  INTEGER;
  v_sum_completed INTEGER;
  v_remaining     INTEGER;
  v_new_status    public.task_status;
BEGIN
  v_task_id := COALESCE(NEW.task_id, OLD.task_id);

  SELECT qty INTO v_task_qty FROM public.tasks WHERE id = v_task_id;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed'),
    COUNT(*) FILTER (WHERE status IN ('done','completed')),
    COALESCE(SUM(qty_assigned), 0),
    COALESCE(SUM(qty_completed), 0)
  INTO v_n, v_completed, v_done_plus, v_sum_assigned, v_sum_completed
  FROM public.task_assignments
  WHERE task_id = v_task_id;

  IF v_n = 0 THEN
    UPDATE public.tasks
       SET status        = 'pool',
           assigned_to   = NULL,
           started_at    = NULL,
           is_split      = false,
           qty_remaining = NULL,
           qty_completed = 0
     WHERE id = v_task_id;
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_remaining := GREATEST(v_task_qty - v_sum_assigned, 0);

  IF v_completed = v_n AND v_remaining = 0 THEN
    v_new_status := 'completed';
  ELSIF v_done_plus = v_n AND v_remaining = 0 THEN
    v_new_status := 'done';
  ELSE
    v_new_status := 'in_progress';
  END IF;

  UPDATE public.tasks
     SET qty_completed = v_sum_completed,
         qty_remaining = v_remaining,
         is_split      = (v_n > 1),
         status        = v_new_status
   WHERE id = v_task_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;
