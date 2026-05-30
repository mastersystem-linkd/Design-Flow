-- ============================================================================
-- 0040_pool_system_columns.sql
-- ----------------------------------------------------------------------------
-- Pool System rebuild — step 2 of 2 (DB).
--
-- Run AFTER 0039 (the 'completed' enum value must already exist; the pool FIFO
-- index below filters on status='pool' but the partial index over the new
-- requirement_received_at column needs that column to exist first — both come
-- from this file, so order within the file is what matters).
-- ============================================================================

-- ═══════════════════════════════════════════
-- PART 1: New columns on tasks table
-- ═══════════════════════════════════════════

-- Post-done completion fields (fabric + mtr captured after the design is done)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS completion_fabric TEXT,
  ADD COLUMN IF NOT EXISTS completion_mtr DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS completion_filled_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completion_filled_at TIMESTAMPTZ;

-- Requirement tracking (when the brief was received, independent of created_at)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS requirement_received_at TIMESTAMPTZ DEFAULT now();

-- ═══════════════════════════════════════════
-- PART 2: User preferences table (column visibility)
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  visible_columns JSONB NOT NULL DEFAULT '["concept","party_name","status","priority","deadline"]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Touch updated_at trigger (reuse existing function from 0001). Guarded so a
-- re-run doesn't error on the trigger already existing.
DROP TRIGGER IF EXISTS user_preferences_touch_updated ON public.user_preferences;
CREATE TRIGGER user_preferences_touch_updated
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_completion_fabric
  ON public.tasks(completion_fabric) WHERE completion_fabric IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_pool_fifo
  ON public.tasks(priority DESC, requirement_received_at ASC, created_at ASC)
  WHERE status = 'pool' AND assigned_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_preferences_user
  ON public.user_preferences(user_id);

-- ═══════════════════════════════════════════
-- PART 3: RLS for user_preferences
-- ═══════════════════════════════════════════

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- Everyone can read their own preferences
DROP POLICY IF EXISTS "user_preferences_select_own" ON public.user_preferences;
CREATE POLICY "user_preferences_select_own" ON public.user_preferences
  FOR SELECT USING (auth.uid() = user_id);

-- Everyone can insert their own preferences
DROP POLICY IF EXISTS "user_preferences_insert_own" ON public.user_preferences;
CREATE POLICY "user_preferences_insert_own" ON public.user_preferences
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Everyone can update their own preferences
DROP POLICY IF EXISTS "user_preferences_update_own" ON public.user_preferences;
CREATE POLICY "user_preferences_update_own" ON public.user_preferences
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Admin can read all (for debugging)
DROP POLICY IF EXISTS "user_preferences_select_admin" ON public.user_preferences;
CREATE POLICY "user_preferences_select_admin" ON public.user_preferences
  FOR SELECT USING (is_admin());
