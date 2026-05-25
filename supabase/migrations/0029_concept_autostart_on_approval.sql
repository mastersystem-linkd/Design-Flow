-- ============================================================================
-- 0029_concept_autostart_on_approval.sql
-- ----------------------------------------------------------------------------
-- Workflow simplification: when MD approves a concept, treat that moment as
-- the designer's start time. The old flow required a separate "Start working"
-- click which (a) made designers think they were stuck in a "Ready" state
-- and (b) let the legacy "Mark as Completed" button bypass work_status
-- validation entirely. This migration:
--
--   1. Rewrites set_concept_work_status_on_approval() so an md_status flip
--      to 'approved' immediately moves work_status to 'in_progress' and
--      stamps work_started_at. Idempotent — re-approvals don't clobber a
--      designer that's already started work.
--
--   2. Backfills existing rows: any concept that's md_status='approved' but
--      work_status='not_started' gets its work_started_at set to the
--      approval date (md_actual_date) and work_status flipped to
--      'in_progress'.
--
-- Spec: user feedback "Started date should be auto captured when the MD
-- gives the approval that date will be considered as the Start Date".
-- ============================================================================

CREATE OR REPLACE FUNCTION set_concept_work_status_on_approval()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.md_status = 'approved' AND OLD.md_status IS DISTINCT FROM 'approved' THEN
    -- Only auto-start if work hasn't begun yet. If the designer is already
    -- in some other state (in_progress, on_hold, in_revision, etc.), leave
    -- it alone — this protects against revision_requested -> approved
    -- cycles where work has actually been happening.
    IF NEW.work_status IS NULL OR NEW.work_status = 'not_started' THEN
      NEW.work_status := 'in_progress';
      -- Use the approval timestamp (now()) as the kickoff. md_actual_date
      -- is a DATE so we can't reuse it for a timestamptz column without
      -- forcing a midnight clamp.
      IF NEW.work_started_at IS NULL THEN
        NEW.work_started_at := now();
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Backfill: rows already approved before this migration are stuck in
-- 'not_started' because the previous trigger version only stamped that
-- value. Flip them to 'in_progress' with work_started_at set to the
-- approval date (cast to midnight UTC). If md_actual_date is missing,
-- fall back to md_reviewed_at, then to updated_at.
UPDATE concepts
SET
  work_status = 'in_progress',
  work_started_at = COALESCE(
    work_started_at,
    md_reviewed_at,
    md_actual_date::timestamptz,
    updated_at
  )
WHERE md_status = 'approved'
  AND work_status = 'not_started';
