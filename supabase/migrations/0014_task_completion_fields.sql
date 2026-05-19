-- ============================================================================
-- LinkD FMS — Task completion tracking fields
-- ============================================================================
-- Adds columns needed for the self-assign + mark-done + delay tracking flows:
--   assigned_at   — when the task was assigned (distinct from created_at)
--   completed_at  — when the designer marked the task done
--   delay_days    — (completed_at - assigned_at) in days, computed on completion
-- ============================================================================

begin;

alter table public.tasks
  add column if not exists assigned_at   timestamptz,
  add column if not exists completed_at  timestamptz,
  add column if not exists delay_days    integer;

commit;
