-- ---------------------------------------------------------------------------
-- 0044 — Actually remove the `qty_completed <= qty` upper bound.
--
-- The tasks table (migration 0001) declared:
--     qty_completed numeric not null default 0
--       check (qty_completed >= 0 and qty_completed <= qty)
-- Because that inline CHECK references TWO columns (qty_completed AND qty),
-- PostgreSQL promotes it to a TABLE-level constraint and auto-names it
-- `tasks_check` — NOT `tasks_qty_completed_check`.
--
-- Migration 0043 tried to drop `tasks_qty_completed_check` (a name that never
-- existed) and add a fresh lower-bound-only constraint. The real upper-bound
-- constraint `tasks_check` was never removed, so a designer logging extra
-- designs (qty_completed > qty — the intended behaviour) still hits:
--     new row for relation "tasks" violates check constraint "tasks_check"
--
-- Fix: drop the real constraint and re-assert only the lower bound.
-- ---------------------------------------------------------------------------

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_check;

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_qty_completed_check;
ALTER TABLE tasks
  ADD CONSTRAINT tasks_qty_completed_check CHECK (qty_completed >= 0);
