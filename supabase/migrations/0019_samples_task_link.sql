-- ============================================================================
-- LinkD FMS — Link sampling records to tasks
-- ============================================================================
-- Why this exists: the sampling form had a free-text "UID" field that nobody
-- filled correctly. Coordinators standing at the printing machine can't recall
-- a 20-char task code like "DF 10-X0526-COUN-10M" from memory. We add an
-- optional task_id FK so the new TaskPicker can write the real link, while
-- still allowing free-text UID for walk-in samples that don't have a brief.
--
-- ON DELETE SET NULL — keeps the sampling history even if the task itself is
-- soft-deleted later. The sample row stays; only the back-pointer clears.
--
-- RLS: no policy changes needed. `samples` uses is_admin() for full CRUD and
-- designer self-write — both cover the new column automatically since RLS in
-- 0010 grants table-level access, not column-level.
-- ============================================================================

begin;

alter table public.samples
  add column if not exists task_id uuid
    references public.tasks(id) on delete set null;

-- Most queries from the new SamplingFormDrawer + ProductionView will lookup
-- "samples for this task" or "task linked to this sample" — index for both.
create index if not exists idx_samples_task_id
  on public.samples(task_id)
  where task_id is not null;

commit;
