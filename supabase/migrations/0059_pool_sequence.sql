-- 0059_pool_sequence.sql
-- Add pool_sequence + pool_week_start to tasks for ordered open-pool display.
-- Designers now see all pool tasks in sequence order and pick any one to claim.

-- ── New columns ──────────────────────────────────────────────────────────────
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS pool_sequence  INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pool_week_start DATE    DEFAULT NULL;

COMMENT ON COLUMN tasks.pool_sequence  IS 'Weekly auto-increment sequence for pool ordering. Reset each Monday.';
COMMENT ON COLUMN tasks.pool_week_start IS 'ISO week start (Monday) the sequence belongs to.';

-- ── Index for fast pool ordering ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tasks_pool_sequence
  ON tasks (pool_week_start DESC NULLS LAST, pool_sequence ASC NULLS LAST)
  WHERE status = 'pool';

-- ── Trigger function: auto-assign next sequence when a task enters pool ──────
CREATE OR REPLACE FUNCTION assign_pool_sequence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  week_start DATE;
  next_seq   INTEGER;
BEGIN
  -- Only fire when the row is entering the pool
  IF NEW.status = 'pool' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'pool') THEN
    -- Monday of the current ISO week
    week_start := date_trunc('week', CURRENT_DATE)::DATE;

    -- Next sequence for this week (max + 1, starting at 1)
    SELECT COALESCE(MAX(pool_sequence), 0) + 1
      INTO next_seq
      FROM tasks
     WHERE pool_week_start = week_start;

    NEW.pool_sequence  := next_seq;
    NEW.pool_week_start := week_start;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop if exists to make idempotent
DROP TRIGGER IF EXISTS trg_assign_pool_sequence ON tasks;

CREATE TRIGGER trg_assign_pool_sequence
  BEFORE INSERT OR UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION assign_pool_sequence();

-- ── Weekly reset function (call via pg_cron or Edge Function on Mondays) ─────
CREATE OR REPLACE FUNCTION reset_pool_sequences()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  week_start DATE;
  seq        INTEGER := 0;
  r          RECORD;
BEGIN
  week_start := date_trunc('week', CURRENT_DATE)::DATE;

  FOR r IN
    SELECT id
      FROM tasks
     WHERE status = 'pool'
     ORDER BY priority = 'urgent' DESC,
              requirement_received_at ASC NULLS LAST,
              created_at ASC
  LOOP
    seq := seq + 1;
    UPDATE tasks
       SET pool_sequence  = seq,
           pool_week_start = week_start
     WHERE id = r.id;
  END LOOP;
END;
$$;

-- ── Backfill existing pool tasks with sequence numbers ───────────────────────
DO $$
DECLARE
  week_start DATE;
  seq        INTEGER := 0;
  r          RECORD;
BEGIN
  week_start := date_trunc('week', CURRENT_DATE)::DATE;

  FOR r IN
    SELECT id
      FROM tasks
     WHERE status = 'pool'
     ORDER BY priority = 'urgent' DESC,
              requirement_received_at ASC NULLS LAST,
              created_at ASC
  LOOP
    seq := seq + 1;
    UPDATE tasks
       SET pool_sequence  = seq,
           pool_week_start = week_start
     WHERE id = r.id;
  END LOOP;
END;
$$;
