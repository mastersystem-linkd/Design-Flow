-- ============================================================================
-- 0026_concept_work_columns.sql
-- ----------------------------------------------------------------------------
-- Concept work-status lifecycle — Step 2 of 3.
--
-- Adds the work-status columns on `concepts`, the auto-set trigger that
-- stamps `work_status = 'not_started'` whenever `md_status` transitions to
-- `'approved'`, and supporting indexes for the designer board + admin
-- design-review queue.
--
-- Spec: CONCEPT-WORKFLOW-PROMPT.md §3.2.
-- ============================================================================

ALTER TABLE concepts
  ADD COLUMN IF NOT EXISTS work_status         concept_work_status DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS work_started_at     timestamptz,
  ADD COLUMN IF NOT EXISTS work_held_at        timestamptz,
  ADD COLUMN IF NOT EXISTS work_resumed_at     timestamptz,
  ADD COLUMN IF NOT EXISTS work_completed_at   timestamptz,
  ADD COLUMN IF NOT EXISTS hold_reason         text,
  ADD COLUMN IF NOT EXISTS hold_count          integer     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revision_count      integer     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS md_feedback         text,
  ADD COLUMN IF NOT EXISTS total_hold_duration interval    DEFAULT '0';

-- Existing rows: anything already approved gets work_status='not_started'
-- (the default already does this for NULL-inserted rows; this fills in any
-- columns that were created as NULL by older inserts).
UPDATE concepts
  SET work_status = 'not_started'
  WHERE work_status IS NULL;

-- Indexes for the designer board (designer pulls their own active work) and
-- the admin "Design Review" queue.
CREATE INDEX IF NOT EXISTS idx_concepts_work_status
  ON concepts (work_status);
CREATE INDEX IF NOT EXISTS idx_concepts_designer_work
  ON concepts (designer_id, work_status);

-- Auto-set work_status to 'not_started' the moment md_status flips to
-- 'approved'. Without this, a row approved before the columns existed would
-- keep its prior work_status (or NULL) and the designer board wouldn't see it.
CREATE OR REPLACE FUNCTION set_concept_work_status_on_approval()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.md_status = 'approved' AND OLD.md_status IS DISTINCT FROM 'approved' THEN
    -- Only stamp if no work has started yet — don't overwrite an existing lifecycle
    IF NEW.work_status IS NULL OR NEW.work_status = 'not_started' THEN
      NEW.work_status := 'not_started';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS concepts_work_status_on_approval_trg ON concepts;
CREATE TRIGGER concepts_work_status_on_approval_trg
  BEFORE UPDATE ON concepts
  FOR EACH ROW
  EXECUTE FUNCTION set_concept_work_status_on_approval();
