-- ============================================================================
-- LinkD FMS — per-form "Assigned By" rosters
-- ============================================================================
-- Each form context keeps its own Assigned By list:
--   'task'         → New Brief, Edit Task, Submit Concept
--   'full_kitting' → Full Knitting form
--   'sampling'     → Sampling form
-- A `context` column + composite UNIQUE(name, context) lets the same name live
-- once per context. Managed from Settings → Assigned By (3 pill tabs).
-- Requires 0045 (table) to have run first.
-- ============================================================================

begin;

alter table public.assigned_by_options
  add column if not exists context text not null default 'task';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'assigned_by_options_context_check'
  ) then
    alter table public.assigned_by_options
      add constraint assigned_by_options_context_check
      check (context in ('task', 'full_kitting', 'sampling'));
  end if;
end $$;

-- Same name may now repeat once per context — replace the global UNIQUE(name).
alter table public.assigned_by_options
  drop constraint if exists assigned_by_options_name_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'assigned_by_options_name_context_key'
  ) then
    alter table public.assigned_by_options
      add constraint assigned_by_options_name_context_key unique (name, context);
  end if;
end $$;

create index if not exists assigned_by_options_context_idx
  on public.assigned_by_options(context, is_active);

-- Seed full_kitting + sampling with the same starter roster so their dropdowns
-- aren't empty. (The 'task' rows already exist from 0045.) Editable per context.
insert into public.assigned_by_options (name, sort_order, context) values
  ('Anand Sir', 1, 'full_kitting'), ('Eldee', 2, 'full_kitting'),
  ('Gaurav Sir', 3, 'full_kitting'), ('Hiren', 4, 'full_kitting'),
  ('Jiten', 5, 'full_kitting'), ('Laxmikant Sir', 6, 'full_kitting'),
  ('Nandu Desai', 7, 'full_kitting'), ('Naushi Ma''am', 8, 'full_kitting'),
  ('Raghav Sir', 9, 'full_kitting'), ('Ramesh Sawant', 10, 'full_kitting'),
  ('Self', 11, 'full_kitting'), ('Shubham', 12, 'full_kitting'),
  ('Shukla', 13, 'full_kitting'), ('Supriya Sonawane', 14, 'full_kitting'),
  ('Anand Sir', 1, 'sampling'), ('Eldee', 2, 'sampling'),
  ('Gaurav Sir', 3, 'sampling'), ('Hiren', 4, 'sampling'),
  ('Jiten', 5, 'sampling'), ('Laxmikant Sir', 6, 'sampling'),
  ('Nandu Desai', 7, 'sampling'), ('Naushi Ma''am', 8, 'sampling'),
  ('Raghav Sir', 9, 'sampling'), ('Ramesh Sawant', 10, 'sampling'),
  ('Self', 11, 'sampling'), ('Shubham', 12, 'sampling'),
  ('Shukla', 13, 'sampling'), ('Supriya Sonawane', 14, 'sampling')
on conflict (name, context) do nothing;

commit;
