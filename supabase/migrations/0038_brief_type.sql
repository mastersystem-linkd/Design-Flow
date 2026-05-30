-- ============================================================================
-- 0038_brief_type.sql
-- ----------------------------------------------------------------------------
-- Briefs now come in two flavours:
--   'ld'        — internal LinkD work; no external party is recorded
--   'job_work'  — external client work; client_id is required
--
-- Two coupled changes:
--   1. tasks.client_id loses its NOT NULL constraint so LD briefs can save
--      without a party row.
--   2. tasks.brief_type column carries the segment explicitly. Inferring
--      from `client_id IS NULL` would be ambiguous — a task could be
--      Job Work whose client was deleted later.
--
-- Existing rows backfill to 'job_work' (they all had non-null client_ids,
-- so that's the only safe interpretation).
-- ============================================================================

-- 1. Relax client_id (NOT NULL → nullable)
alter table public.tasks
  alter column client_id drop not null;

-- 2. Add brief_type with a CHECK constraint; default 'job_work' for backfill,
--    then drop the default so future inserts must pick explicitly.
alter table public.tasks
  add column if not exists brief_type text not null default 'job_work'
    check (brief_type in ('ld', 'job_work'));

alter table public.tasks
  alter column brief_type drop default;

-- 3. Cheap index so the upcoming dashboards can filter by segment without
--    scanning the whole table. Partial-style not necessary; the column has
--    high selectivity and only two distinct values.
create index if not exists tasks_brief_type_idx on public.tasks (brief_type);

-- 4. Consistency check: anything tagged 'job_work' must keep a client_id.
--    Enforced at insert/update via a CHECK constraint so the UI can't
--    silently drift back into the inconsistent state we just left.
alter table public.tasks
  add constraint tasks_brief_type_client_consistency
  check (
    (brief_type = 'ld')
    or (brief_type = 'job_work' and client_id is not null)
  );
