-- 0031_sample_kitting_link.sql
-- Lets a full_kitting_details row link to a sample instead of a task,
-- so the FK flow (coordinator uploads image → DEO digitizes 12-section
-- form) works the same way from the Sampling screen as it does from the
-- All Tasks → Full Knitting sub-folder.
--
-- Constraint: exactly one of task_id / sample_id is set per row.
-- The DEO queue view is updated to read identifying fields (UID, party
-- name) from whichever parent is present.

-- ── Make task_id nullable + add sample_id ─────────────────────────────────
alter table public.full_kitting_details
  alter column task_id drop not null;

alter table public.full_kitting_details
  add column if not exists sample_id uuid
    references public.samples(id) on delete cascade;

-- One FK record per sample, just like task_id has UNIQUE.
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'full_kitting_details_sample_id_unique'
  ) then
    alter table public.full_kitting_details
      add constraint full_kitting_details_sample_id_unique unique (sample_id);
  end if;
end $$;

-- Exactly one of task_id / sample_id must be set. Both null or both set
-- both indicate a bug somewhere — fail loud rather than persist garbage.
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'full_kitting_details_link_xor'
  ) then
    alter table public.full_kitting_details
      add constraint full_kitting_details_link_xor check (
        (task_id is not null and sample_id is null) or
        (task_id is null and sample_id is not null)
      );
  end if;
end $$;

create index if not exists full_kitting_sample_id_idx
  on public.full_kitting_details (sample_id)
  where sample_id is not null;

-- ── DEO queue view: union task-sourced + sample-sourced rows ─────────────
-- For sample-sourced rows we surface samples.uid as the UID, samples.party_name
-- as the party label, and samples.requirement as the "concept" preview so the
-- DEO sees something meaningful at the queue level. Everything else flows
-- through unchanged — same status enum, same actions.
drop view if exists public.deo_kitting_queue;
create view public.deo_kitting_queue as
select
  fk.id,
  fk.task_id,
  fk.sample_id,
  fk.image_url,
  fk.party_name,
  fk.priority,
  fk.data_entry_status,
  fk.form_date,
  fk.created_at,
  coalesce(t.task_code, s.uid)                       as task_code,
  coalesce(t.concept, s.requirement)                 as concept,
  t.client_id                                        as client_id,
  coalesce(c.party_name, s.party_name)               as client_party_name,
  t.assigned_to                                      as assignee_id
from public.full_kitting_details fk
left join public.tasks   t on t.id = fk.task_id
left join public.clients c on c.id = t.client_id
left join public.samples s on s.id = fk.sample_id
where fk.data_entry_status in ('pending_deo', 'in_progress');

grant select on public.deo_kitting_queue to authenticated;
