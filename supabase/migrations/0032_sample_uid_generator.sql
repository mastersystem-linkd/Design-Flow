-- 0032_sample_uid_generator.sql
-- Auto-generate a UID for every sample so the Sampling → Full Knitting
-- table has a stable identifier per row. Mirrors how tasks.task_code is
-- generated (see next_task_code in 0001_full_schema.sql) but uses an
-- SMP prefix so sample-sourced FK rows can't be confused with brief-
-- sourced rows (ORD-YYYY-NNNN).
--
-- Format: SMP-YYYY-NNNN — per-year counter, resets each calendar year,
-- zero-padded to 4 digits. Existing samples without a uid are back-filled
-- in creation order before the trigger goes live.

-- ── Per-year counter table ────────────────────────────────────────────────
create table if not exists public.sample_counters (
  year      int  primary key,
  last_num  int  not null default 0
);

-- ── Generator: atomic increment with optimistic conflict resolution ───────
create or replace function public.next_sample_uid()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  y int := extract(year from now())::int;
  n int;
begin
  insert into public.sample_counters (year, last_num)
    values (y, 1)
    on conflict (year)
    do update set last_num = public.sample_counters.last_num + 1
    returning last_num into n;
  return 'SMP-' || y::text || '-' || lpad(n::text, 4, '0');
end;
$$;

-- ── Trigger: stamp uid on INSERT when caller didn't provide one ───────────
create or replace function public.samples_set_uid()
returns trigger
language plpgsql
as $$
begin
  if new.uid is null or new.uid = '' then
    new.uid := public.next_sample_uid();
  end if;
  return new;
end;
$$;

drop trigger if exists samples_set_uid_trg on public.samples;
create trigger samples_set_uid_trg
  before insert on public.samples
  for each row execute procedure public.samples_set_uid();

-- ── Backfill: assign uids to existing rows that don't have one ────────────
-- Group by creation year so the per-year counter ends up consistent with
-- the chronological order of the data — looks natural after the fact.
do $$
declare
  r record;
  y int;
  n int;
begin
  for r in
    select id, extract(year from created_at)::int as y
    from public.samples
    where uid is null or uid = ''
    order by created_at asc
  loop
    y := r.y;
    insert into public.sample_counters (year, last_num)
      values (y, 1)
      on conflict (year)
      do update set last_num = public.sample_counters.last_num + 1
      returning last_num into n;
    update public.samples
       set uid = 'SMP-' || y::text || '-' || lpad(n::text, 4, '0')
     where id = r.id;
  end loop;
end $$;

-- After the backfill is done it's safe to make uid required so we never
-- end up with NULL UIDs again. (Drop and recreate as NOT NULL.)
alter table public.samples
  alter column uid set not null;

create unique index if not exists samples_uid_unique
  on public.samples (uid);
