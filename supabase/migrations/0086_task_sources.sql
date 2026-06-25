-- ============================================================================
-- LinkD FMS — "Task Source" managed dropdown (the brief "Group" picker)
-- ============================================================================
-- Backs the "Group" / Source picker on New Brief + Edit Task (previously the
-- hardcoded list in src/lib/whatsappGroups.ts, which is kept only as a fallback
-- for pre-migration / empty-table states). Admin + coordinator managed from
-- Settings → Dropdowns → Tasks → Task Source. Mirrors requester_options /
-- received_by_options, plus an `is_whatsapp` flag that drives the green
-- WhatsApp icon in the picker (toggle per row in Settings).
-- ============================================================================

begin;

create table if not exists public.task_sources (
  id          uuid          primary key default gen_random_uuid(),
  name        text          not null unique,
  is_whatsapp boolean       not null default false,
  sort_order  integer,
  is_active   boolean       not null default true,
  created_at  timestamptz   not null default now(),
  updated_at  timestamptz   not null default now()
);

create trigger task_sources_touch_updated_at
  before update on public.task_sources
  for each row execute procedure public.touch_updated_at();

create index if not exists task_sources_active_idx
  on public.task_sources(is_active);

create index if not exists task_sources_name_lower_idx
  on public.task_sources(lower(name));

alter table public.task_sources enable row level security;

drop policy if exists "task_sources_read" on public.task_sources;
create policy "task_sources_read"
  on public.task_sources for select
  using (auth.uid() is not null);

drop policy if exists "task_sources_admin_all" on public.task_sources;
create policy "task_sources_admin_all"
  on public.task_sources for all
  using (public.is_admin_or_coordinator())
  with check (public.is_admin_or_coordinator());

-- Seed from the previous hardcoded catalogue (src/lib/whatsappGroups.ts).
-- Fully editable afterwards. Idempotent via ON CONFLICT.
insert into public.task_sources (name, is_whatsapp, sort_order) values
  ('Linkd Design New Creation',      true,  1),
  ('LinkD Jobwork Concept',          true,  2),
  ('LinkD Design Group',             true,  3),
  ('LD-Garments Sublimation Prints', false, 4),
  ('LD Cotton Mills Design Group',   true,  5),
  ('Own Creation',                   false, 6)
on conflict (name) do nothing;

-- New table → make sure PostgREST sees it without a manual cache reload.
notify pgrst, 'reload schema';

commit;
