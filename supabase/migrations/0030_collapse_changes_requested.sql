-- ============================================================================
-- 0030_collapse_changes_requested.sql
-- ----------------------------------------------------------------------------
-- The `changes_requested` work_status was a transient "MD asked for changes,
-- designer hasn't clicked Start yet" state. It added a manual step that
-- confused users without adding workflow value — the rework banner inside
-- `in_progress` (gated by `revision_count >= 1`) already shows MD's
-- feedback inline. We now skip the intermediate state entirely:
--   • `suggestChanges` mutation transitions in_revision → in_progress
--   • md_feedback is set in the same write so the designer sees it
--     immediately in the reworking banner
--
-- This migration backfills any rows that are currently parked in
-- `changes_requested` so they show up in the In Progress filter chip
-- (where they belong). The enum value itself stays on the type for
-- back-compat — Postgres can't drop enum values without recreating the
-- type, which would cascade across every concept row.
-- ============================================================================

UPDATE concepts
SET work_status = 'in_progress'
WHERE work_status = 'changes_requested';
