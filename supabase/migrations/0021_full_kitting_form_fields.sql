-- 0021_full_kitting_form_fields.sql
-- Extends full_kitting_details to digitize the 12-field paper form.
--
-- form_payload (JSONB) holds the full KittingFormValues object; the named
-- columns are denormalised for indexing and dashboards. Existing rows from
-- migration 0013 keep their data — every new column is nullable / defaulted.

-- ── Data-entry workflow status ────────────────────────────────────────────
do $$ begin
  if not exists (select 1 from pg_type where typname = 'kitting_data_entry_status') then
    create type kitting_data_entry_status as enum (
      'pending_image',   -- coordinator hasn't uploaded the photo yet
      'pending_deo',     -- photo uploaded, DEO hasn't started
      'in_progress',     -- DEO is editing
      'completed'        -- form submitted
    );
  end if;
end $$;

-- ── Priority enum (matches the form's 5 priority chips) ───────────────────
do $$ begin
  if not exists (select 1 from pg_type where typname = 'kitting_priority') then
    create type kitting_priority as enum (
      'very_urgent',
      '2_days',
      '3_days',
      '4_days',
      '5_days'
    );
  end if;
end $$;

-- ── Columns ───────────────────────────────────────────────────────────────
alter table public.full_kitting_details
  add column if not exists form_payload       jsonb,
  add column if not exists data_entry_status  kitting_data_entry_status
    not null default 'pending_image',
  add column if not exists priority           kitting_priority,
  add column if not exists form_date          date,
  add column if not exists party_name         text,
  add column if not exists image_url          text,          -- coord-uploaded form photo
  add column if not exists completed_at       timestamptz,
  add column if not exists completed_by       uuid references auth.users(id) on delete set null;

-- ── Indexes (workflow + party lookup) ─────────────────────────────────────
create index if not exists full_kitting_status_idx
  on public.full_kitting_details (data_entry_status)
  where data_entry_status <> 'completed';

create index if not exists full_kitting_priority_idx
  on public.full_kitting_details (priority)
  where data_entry_status <> 'completed';

create index if not exists full_kitting_party_idx
  on public.full_kitting_details (party_name);

-- ── Trigger: when payload arrives, flip status forward ────────────────────
-- DEO submits the form → form_payload non-null → status becomes 'completed'.
create or replace function set_kitting_completed_status()
returns trigger
language plpgsql
as $$
begin
  if new.form_payload is not null
     and (old.form_payload is null or old.form_payload <> new.form_payload)
     and new.data_entry_status <> 'completed' then
    new.data_entry_status := 'completed';
    new.completed_at := coalesce(new.completed_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists set_kitting_completed_status_trg
  on public.full_kitting_details;

create trigger set_kitting_completed_status_trg
  before update on public.full_kitting_details
  for each row
  execute function set_kitting_completed_status();
