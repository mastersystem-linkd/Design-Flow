-- ============================================================================
-- LinkD FMS — Designer codes
-- ============================================================================
-- A designer can hold ONE OR MORE designer-code identifiers (used for the
-- "U / V / S / NJ-78 / Platinum 01" labels printed on physical samples).
-- Modelled as a separate one-to-many table so a single profile (e.g. Kavita)
-- can be linked to multiple codes simultaneously.
--
-- Run AFTER 0006_simplify_roles.sql.
-- ============================================================================

create type designer_status as enum ('active', 'inactive');

create table designer_codes (
  id            uuid              primary key default gen_random_uuid(),
  profile_id    uuid              not null references profiles(id) on delete cascade,
  code          text              not null unique,
  joining_date  date              not null,
  leaving_date  date,
  status        designer_status   not null default 'active',
  created_at    timestamptz       not null default now(),
  updated_at    timestamptz       not null default now()
);

create index designer_codes_profile_id_idx on designer_codes(profile_id);
create index designer_codes_status_idx     on designer_codes(status);

-- Reuse the generic updated_at toucher defined in 0001.
create trigger designer_codes_touch_updated_at
  before update on designer_codes
  for each row execute procedure touch_updated_at();

-- ----------------------------------------------------------------------------
-- RLS — readable to all authed users; only admins can mutate
-- ----------------------------------------------------------------------------
alter table designer_codes enable row level security;

create policy "designer_codes_select_authed"
  on designer_codes for select
  using (auth.uid() is not null);

create policy "designer_codes_insert_admin"
  on designer_codes for insert
  with check (is_admin());

create policy "designer_codes_update_admin"
  on designer_codes for update
  using (is_admin())
  with check (is_admin());

create policy "designer_codes_delete_admin"
  on designer_codes for delete
  using (is_admin());
