-- ============================================================================
-- 0025_concept_work_status.sql
-- ----------------------------------------------------------------------------
-- Concept work-status lifecycle — Step 1 of 3.
--
-- Adds the `concept_work_status` enum that drives the post-approval work
-- pipeline (designer Start → Hold/Resume → Mark Done → MD review → Approve /
-- Suggest Changes → Completed). Must be committed *before* 0026 references it
-- because Postgres can't use a newly-created enum value in the same
-- transaction it was declared in.
--
-- Spec: CONCEPT-WORKFLOW-PROMPT.md §3.1.
-- ============================================================================

CREATE TYPE concept_work_status AS ENUM (
  'not_started',
  'in_progress',
  'on_hold',
  'done_partial',
  'in_revision',
  'changes_requested',
  'completed'
);
