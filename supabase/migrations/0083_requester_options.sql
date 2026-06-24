-- ============================================================================
-- LinkD FMS — "Requester" managed dropdown (Coordinator Tasks form)
-- ============================================================================
-- Backs the "Requester" picker on the Coordinator Tasks "Log New Request" form
-- (previously a free-text input). Single list (Requester only exists on that
-- form). Admin + coordinator managed from Settings → Dropdowns → Coordinator
-- Tasks; mirrors the received_by_options / assigned_by_options lookups.
-- ============================================================================

begin;

create table if not exists public.requester_options (
  id          uuid          primary key default gen_random_uuid(),
  name        text          not null unique,
  sort_order  integer,
  is_active   boolean       not null default true,
  created_at  timestamptz   not null default now(),
  updated_at  timestamptz   not null default now()
);

create trigger requester_options_touch_updated_at
  before update on public.requester_options
  for each row execute procedure public.touch_updated_at();

create index if not exists requester_options_active_idx
  on public.requester_options(is_active);

create index if not exists requester_options_name_lower_idx
  on public.requester_options(lower(name));

alter table public.requester_options enable row level security;

drop policy if exists "requester_options_read" on public.requester_options;
create policy "requester_options_read"
  on public.requester_options for select
  using (auth.uid() is not null);

drop policy if exists "requester_options_admin_all" on public.requester_options;
create policy "requester_options_admin_all"
  on public.requester_options for all
  using (public.is_admin_or_coordinator())
  with check (public.is_admin_or_coordinator());

-- Seed with the same starter roster as the other lookups (editable).
-- Idempotent via ON CONFLICT.
insert into public.requester_options (name, sort_order) values
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

-- New table → make sure PostgREST sees it without a manual cache reload.
notify pgrst, 'reload schema';

commit;
