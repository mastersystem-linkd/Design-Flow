-- ============================================================================
-- 0037_clients_group.sql
-- ----------------------------------------------------------------------------
-- Split clients into two business segments:
--   'ld'        — parties in LinkD's own design pipeline
--   'job_work'  — external job-work parties
--
-- Stored as a TEXT + CHECK (rather than a Postgres ENUM) so the values can
-- be expanded later without a DDL dance. Column name avoids `group` (SQL
-- keyword) and the `concept_categories.group` we might add later.
--
-- Existing rows backfill to 'ld' — the safer default. Admins can re-tag
-- any party as 'job_work' from Settings → Party Name → Job Work tab.
-- ============================================================================

alter table public.clients
  add column if not exists client_group text not null default 'ld'
    check (client_group in ('ld', 'job_work'));

create index if not exists clients_client_group_idx
  on public.clients (client_group);

-- Drop the default once the table is backfilled; the SPA always supplies
-- the value explicitly going forward, and a stale default would hide bugs
-- where the column was accidentally omitted from an insert.
alter table public.clients
  alter column client_group drop default;
