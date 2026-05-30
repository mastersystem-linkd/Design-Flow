-- ============================================================================
-- LinkD FMS — "Assigned By" managed dropdown
-- ============================================================================
-- Backs the "Assigned By" picker shared by New Brief, Edit Task, Full Knitting
-- form, Sampling, and Submit Concept. Previously a hard-coded array in
-- src/lib/constants.ts (ASSIGNED_BY_OPTIONS) — now admin-managed from
-- Settings → Assigned By, mirroring the concept_categories / fabrics lookups.
--
-- Same shape + RLS as the other lookups (migration 0011): read for any
-- authenticated user; CRUD restricted to admin.
-- ============================================================================

begin;

create table if not exists public.assigned_by_options (
  id          uuid          primary key default gen_random_uuid(),
  name        text          not null unique,
  sort_order  integer,
  is_active   boolean       not null default true,
  created_at  timestamptz   not null default now(),
  updated_at  timestamptz   not null default now()
);

create trigger assigned_by_options_touch_updated_at
  before update on public.assigned_by_options
  for each row execute procedure public.touch_updated_at();

create index if not exists assigned_by_options_active_idx
  on public.assigned_by_options(is_active);

create index if not exists assigned_by_options_name_lower_idx
  on public.assigned_by_options(lower(name));

alter table public.assigned_by_options enable row level security;

drop policy if exists "assigned_by_options_read" on public.assigned_by_options;
create policy "assigned_by_options_read"
  on public.assigned_by_options for select
  using (auth.uid() is not null);

drop policy if exists "assigned_by_options_admin_all" on public.assigned_by_options;
create policy "assigned_by_options_admin_all"
  on public.assigned_by_options for all
  using (public.is_admin())
  with check (public.is_admin());

-- Seed with the current New-Brief roster (the best-maintained list; the older
-- constants.ts variants are superseded by this managed table). "Other" is NOT
-- seeded — the forms add a free-text "Other" escape hatch in code.
-- Idempotent via ON CONFLICT.
insert into public.assigned_by_options (name, sort_order) values
  ('Anand Sir', 1),
  ('Eldee', 2),
  ('Gaurav Sir', 3),
  ('Hiren', 4),
  ('Jiten', 5),
  ('Laxmikant Sir', 6),
  ('Nandu Desai', 7),
  ('Naushi Ma''am', 8),
  ('Raghav Sir', 9),
  ('Ramesh Sawant', 10),
  ('Self', 11),
  ('Shubham', 12),
  ('Shukla', 13),
  ('Supriya Sonawane', 14)
on conflict (name) do nothing;

commit;
