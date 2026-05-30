-- ============================================================================
-- Widen concepts UPDATE policy so designers/coordinators can update their
-- own concepts (hold, resume, mark done, re-submit, etc.)
-- ============================================================================
-- The old policy (concepts_update_admin) only allowed is_admin().
-- This widens it to: admin OR coordinator OR concept owner.

BEGIN;

DROP POLICY IF EXISTS "concepts_update_admin" ON concepts;
DROP POLICY IF EXISTS "concepts_update_admin_or_coordinator" ON concepts;
DROP POLICY IF EXISTS "concepts_update_owner_or_admin" ON concepts;

CREATE POLICY "concepts_update_owner_or_admin"
  ON concepts FOR UPDATE
  USING (
    is_admin_or_coordinator()
    OR submitted_by = auth.uid()
    OR designer_id = auth.uid()
  )
  WITH CHECK (
    is_admin_or_coordinator()
    OR submitted_by = auth.uid()
    OR designer_id = auth.uid()
  );

COMMIT;
