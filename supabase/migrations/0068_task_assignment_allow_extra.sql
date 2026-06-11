-- Relax the split-portion guards from 0062 so designers can:
--   • log MORE than their assigned qty (extra designs) — CLAUDE.md §13 says
--     `qty_completed` may exceed `qty`; and
--   • mark a portion done/completed once they've done AT LEAST their assigned
--     qty (extra is fine), while still being BLOCKED from completing with LESS.
--
-- 0062 enforced `qty_completed <= qty_assigned` and required EXACT equality to
-- complete. This replaces that function in place (the trg_enforce_assignment_
-- constraints trigger from 0062 keeps pointing at it via CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.enforce_assignment_constraints()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_task_qty        INTEGER;
  v_others_assigned INTEGER;
BEGIN
  -- Lock the parent task so concurrent claims/edits serialise (over-assign race, §30.8).
  SELECT qty INTO v_task_qty FROM public.tasks WHERE id = NEW.task_id FOR UPDATE;

  -- (1) A portion can only be marked done/completed once the designer has done
  --     AT LEAST their assigned qty. Extra (qty_completed > qty_assigned) is
  --     allowed; only LESS than assigned is blocked. (Logging extra progress
  --     while still 'assigned'/'in_progress' is always permitted.)
  IF NEW.status IN ('done','completed') AND NEW.qty_completed < NEW.qty_assigned THEN
    RAISE EXCEPTION 'Portion must reach its assigned quantity (% of % done) before it can be marked %',
      NEW.qty_completed, NEW.qty_assigned, NEW.status;
  END IF;

  -- (2) Auto-advance to in_progress on first logged design.
  IF TG_OP = 'UPDATE'
     AND NEW.status = 'assigned'
     AND NEW.qty_completed > 0
     AND COALESCE(OLD.qty_completed, 0) = 0 THEN
    NEW.status := 'in_progress';
  END IF;

  -- (3) Over-assign guard: Σ qty_assigned across the task must stay ≤ task.qty.
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
