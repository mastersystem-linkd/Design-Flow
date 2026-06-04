-- Allow qty = 0 so tasks can be created without a quantity.
-- Admin/coordinator adds the real quantity later; progress tracker
-- stays locked for designers until qty > 0.

-- The original constraint was an inline CHECK (qty > 0) which Postgres
-- auto-named. Try both possible names.
DO $$
BEGIN
  ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_qty_check;
  ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_check1;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE tasks ADD CONSTRAINT tasks_qty_check CHECK (qty >= 0);

-- Also update samples.qty constraint if it exists
DO $$
BEGIN
  ALTER TABLE samples DROP CONSTRAINT IF EXISTS samples_qty_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
