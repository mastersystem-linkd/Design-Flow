-- ============================================================================
-- LinkD FMS — Sampling form managed dropdowns
-- ============================================================================
-- The Sampling form has three list fields beyond Party/Quality/Assigned-By:
--   'requirement'      → Requirement
--   'sampling_done_by' → Sampling Done By
--   'fusing_operator'  → Fusing Operator
-- One field-scoped table (like assigned_by_options' context) keeps them
-- together. Admin + coordinator managed from Settings → Dropdowns → Sampling.
-- Seeded from scripts/Sampling Dropdowns.csv.
-- ============================================================================

begin;

create table if not exists public.sampling_dropdowns (
  id          uuid          primary key default gen_random_uuid(),
  field       text          not null,
  name        text          not null,
  sort_order  integer,
  is_active   boolean       not null default true,
  created_at  timestamptz   not null default now(),
  updated_at  timestamptz   not null default now(),
  constraint sampling_dropdowns_field_check
    check (field in ('requirement', 'sampling_done_by', 'fusing_operator')),
  constraint sampling_dropdowns_name_field_key unique (name, field)
);

create trigger sampling_dropdowns_touch_updated_at
  before update on public.sampling_dropdowns
  for each row execute procedure public.touch_updated_at();

create index if not exists sampling_dropdowns_field_idx
  on public.sampling_dropdowns(field, is_active);

alter table public.sampling_dropdowns enable row level security;

drop policy if exists "sampling_dropdowns_read" on public.sampling_dropdowns;
create policy "sampling_dropdowns_read"
  on public.sampling_dropdowns for select
  using (auth.uid() is not null);

drop policy if exists "sampling_dropdowns_admin_all" on public.sampling_dropdowns;
create policy "sampling_dropdowns_admin_all"
  on public.sampling_dropdowns for all
  using (public.is_admin_or_coordinator())
  with check (public.is_admin_or_coordinator());

-- Seed from scripts/Sampling Dropdowns.csv. Idempotent via ON CONFLICT.
insert into public.sampling_dropdowns (field, name, sort_order) values
  ('requirement', '3 Fold Card', 1),
  ('requirement', '6x4', 2),
  ('requirement', '6x6', 3),
  ('requirement', '8x8', 4),
  ('requirement', '9x9', 5),
  ('requirement', '10x10', 6),
  ('requirement', '11x11', 7),
  ('requirement', '11x12', 8),
  ('requirement', '11x13', 9),
  ('requirement', '11x14', 10),
  ('requirement', '11x15', 11),
  ('requirement', '11x16', 12),
  ('requirement', 'Blanket', 13),
  ('requirement', 'Booklet', 14),
  ('requirement', 'Concept', 15),
  ('requirement', 'Curtains', 16),
  ('requirement', 'Master Folder', 17),
  ('requirement', 'Panel', 18),
  ('requirement', 'Placement', 19),
  ('requirement', 'Yardage', 20),
  ('sampling_done_by', 'Nandu Sir', 1),
  ('sampling_done_by', 'Supriya Sonawane', 2),
  ('fusing_operator', 'Kailash / Pradeep', 1),
  ('fusing_operator', 'Kailash / Shubham', 2),
  ('fusing_operator', 'Monu', 3),
  ('fusing_operator', 'Satyandra', 4),
  ('fusing_operator', 'Satyandra / Pradeep', 5),
  ('fusing_operator', 'Shubham / Satyandra', 6)
on conflict (name, field) do nothing;

commit;
