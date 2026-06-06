CREATE OR REPLACE FUNCTION public.enforce_assignment_constraints()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_task_qty        INTEGER;
  v_others_assigned INTEGER;
BEGIN
  -- Lock the parent task so concurrent claims/edits serialise (closes the over-assign race, §30.8).
  SELECT qty INTO v_task_qty FROM public.tasks WHERE id = NEW.task_id FOR UPDATE;

  -- (1) Within a portion you cannot complete more than you claimed.
  IF NEW.qty_completed > NEW.qty_assigned THEN
    RAISE EXCEPTION 'qty_completed (%) cannot exceed qty_assigned (%)',
      NEW.qty_completed, NEW.qty_assigned;
  END IF;

  -- (2) DECISION 2: a portion may only be done/completed once fully finished.
  IF NEW.status IN ('done','completed') AND NEW.qty_completed <> NEW.qty_assigned THEN
    RAISE EXCEPTION 'Portion must be fully completed (% of % done) before it can be marked %',
      NEW.qty_completed, NEW.qty_assigned, NEW.status;
  END IF;

  -- (3) Auto-advance to in_progress on first logged design.
  IF TG_OP = 'UPDATE'
     AND NEW.status = 'assigned'
     AND NEW.qty_completed > 0
     AND COALESCE(OLD.qty_completed, 0) = 0 THEN
    NEW.status := 'in_progress';
  END IF;

  -- (4) Over-assign guard: Σ qty_assigned across the task must stay ≤ task.qty.
  SELECT COALESCE(SUM(qty_assigned), 0) INTO v_others_assigned
  FROM public.task_assignments
  WHERE task_id = NEW.task_id AND id <> NEW.id;

  IF v_others_assigned + NEW.qty_assigned > v_task_qty THEN
    RAISE EXCEPTION 'Total assigned (%) would exceed task quantity (%)',
      v_others_assigned + NEW.qty_assigned, v_task_qty;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_assignment_constraints ON public.task_assignments;
CREATE TRIGGER trg_enforce_assignment_constraints
  BEFORE INSERT OR UPDATE ON public.task_assignments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_assignment_constraints();
