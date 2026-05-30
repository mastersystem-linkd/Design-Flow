-- Allow qty_completed to exceed qty (designers may create extra designs).
-- The old constraint was: qty_completed >= 0 AND qty_completed <= qty.
-- We keep the >= 0 check but drop the upper bound.

ALTER TABLE tasks
  DROP CONSTRAINT IF EXISTS tasks_qty_completed_check;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_qty_completed_check CHECK (qty_completed >= 0);
