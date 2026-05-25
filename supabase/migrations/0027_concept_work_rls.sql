-- ============================================================================
-- 0027_concept_work_rls.sql
-- ----------------------------------------------------------------------------
-- Concept work-status lifecycle — Step 3 of 3.
--
-- RLS policies for the work-status transitions added in 0026.
--
--   * Designers can move their own approved concepts through the
--     in_progress → on_hold → in_progress → in_revision states.
--   * Admins (`is_admin()`, which already includes design_coordinator per
--     0009) can finalize the lifecycle by setting `completed` or
--     `changes_requested`.
--
-- The existing concepts policies (0001 / 0012) already grant SELECT and the
-- legacy md_status UPDATE paths; this migration only *adds* the new
-- work_status-specific allowances, it does not replace anything.
--
-- Spec: CONCEPT-WORKFLOW-PROMPT.md §11.
-- ============================================================================

-- Drop in case of re-run
DROP POLICY IF EXISTS "designers_update_own_work_status" ON concepts;
DROP POLICY IF EXISTS "admin_final_review_work_status"   ON concepts;

-- Designer can update work_status on their own approved concepts. The CHECK
-- restricts the post-update state to the lifecycle values the designer is
-- allowed to enter (in_progress / on_hold / in_revision). They cannot set
-- `completed` (admin-only) or `changes_requested` (admin-only).
CREATE POLICY "designers_update_own_work_status"
  ON concepts
  FOR UPDATE
  TO authenticated
  USING (
    designer_id = auth.uid()
    AND md_status = 'approved'
  )
  WITH CHECK (
    designer_id = auth.uid()
    AND work_status IN (
      'in_progress', 'on_hold', 'done_partial', 'in_revision'
    )
  );

-- Admin (incl. coordinator via is_admin) can set completed / changes_requested
-- to close out the lifecycle. The CHECK ensures the post-update state stays
-- inside the admin-controlled terminal values.
CREATE POLICY "admin_final_review_work_status"
  ON concepts
  FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (
    is_admin()
    AND work_status IN ('completed', 'changes_requested', 'in_revision')
  );
