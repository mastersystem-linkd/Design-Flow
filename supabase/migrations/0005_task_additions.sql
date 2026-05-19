-- ============================================================================
-- LinkD FMS — task table additions
-- ============================================================================
-- Adds briefing fields the original schema didn't anticipate:
--   * due_time         time-of-day component for the deadline
--   * whatsapp_group   reference to the WA group used to coordinate this task
--   * description      long-form description (notes is the running comments)
--   * deleted_at       soft-delete tombstone
--
-- Idempotent — safe to re-run.
-- ============================================================================

alter table tasks
  add column if not exists due_time       time,
  add column if not exists whatsapp_group text,
  add column if not exists description    text,
  add column if not exists deleted_at     timestamptz;

-- Partial index — only non-null tombstones go in (cheap & small).
create index if not exists tasks_deleted_at_idx
  on tasks(deleted_at)
  where deleted_at is not null;

-- ----------------------------------------------------------------------------
-- Soft-delete: hide tombstoned tasks from regular queries.
-- ----------------------------------------------------------------------------
-- Admins still see them (so they can recover); everyone else does not.
drop policy if exists "tasks_select_authed" on tasks;
create policy "tasks_select_authed"
  on tasks for select
  using (
    auth.uid() is not null
    and (deleted_at is null or is_admin())
  );

-- ----------------------------------------------------------------------------
-- Optional: prevent non-admins from setting deleted_at via UPDATE.
-- ----------------------------------------------------------------------------
-- We rely on the application layer (useTaskMutations.deleteTask) to enforce
-- "admin only" for soft-deletes, but adding a DB-level guard is cheap insurance.
-- The existing `tasks_update_assignee_or_creator` policy lets designers update
-- tasks they own, including (in theory) the deleted_at column. Block that.
drop policy if exists "tasks_update_assignee_or_creator" on tasks;
create policy "tasks_update_assignee_or_creator"
  on tasks for update
  using (
    auth.uid() is not null
    and (assigned_to = auth.uid() or created_by = auth.uid())
  )
  with check (
    auth.uid() is not null
    and (assigned_to = auth.uid() or created_by = auth.uid())
    -- non-admins cannot tombstone or revive a row
    and deleted_at is null
  );
