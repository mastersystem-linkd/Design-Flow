-- ============================================================================
-- LinkD FMS — "Received By" managed dropdown (Full Knitting form)
-- ============================================================================
-- Backs the "Received By" picker on the Full Knitting form (previously a
-- free-text input). Single list (Received By only exists on that form).
-- Admin + coordinator managed from Settings → Received By; mirrors the
-- fabrics / concept_categories / assigned_by_options lookups.
-- ============================================================================

begin;

create table if not exists public.received_by_options (
  id          uuid          primary key default gen_random_uuid(),
  name        text          not null unique,
  sort_order  integer,
  is_active   boolean       not null default true,
  created_at  timestamptz   not null default now(),
  updated_at  timestamptz   not null default now()
);

create trigger received_by_options_touch_updated_at
  before update on public.received_by_options
  for each row execute procedure public.touch_updated_at();

create index if not exists received_by_options_active_idx
  on public.received_by_options(is_active);

create index if not exists received_by_options_name_lower_idx
  on public.received_by_options(lower(name));

alter table public.received_by_options enable row level security;

drop policy if exists "received_by_options_read" on public.received_by_options;
create policy "received_by_options_read"
  on public.received_by_options for select
  using (auth.uid() is not null);

drop policy if exists "received_by_options_admin_all" on public.received_by_options;
create policy "received_by_options_admin_all"
  on public.received_by_options for all
  using (public.is_admin_or_coordinator())
  with check (public.is_admin_or_coordinator());

-- Seed with the same starter roster (editable). Idempotent via ON CONFLICT.
insert into public.received_by_options (name, sort_order) values
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
