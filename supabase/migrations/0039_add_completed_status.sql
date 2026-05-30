-- ============================================================================
-- 0039_add_completed_status.sql
-- ----------------------------------------------------------------------------
-- Pool System rebuild — step 1 of 2 (DB).
--
-- Adds 'completed' to the task_status enum. This is the post-'done' state for
-- tasks whose design is finished AND the post-completion fabric/mtr details
-- have been filled in.
--
-- IMPORTANT: Postgres cannot add an enum value inside a transaction that also
-- USES that value. Keep this in its OWN migration file, separate from any
-- column/index work that references 'completed' (same split rationale as the
-- 0008→0009 and 0022→0023 enum-add pairs). Apply this FIRST, confirm success,
-- then run 0040.
-- ============================================================================

ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'completed';
