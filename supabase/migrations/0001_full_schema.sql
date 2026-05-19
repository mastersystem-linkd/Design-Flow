-- ============================================================================
-- LinkD FMS — complete schema (v2)
-- ============================================================================
-- System 1 (Task Management):    pool → todo → in_progress → full_kitting
--                                → approved → sampling → done
-- System 2 (Concept Approval):   designer submits → MD reviews (+1d)
--                                → approved → designer finalizes (+4d)
--
-- Tables (7):  profiles, clients, concepts, tasks, task_logs, files,
--              sampling_logs
-- Roles  (4):  super_admin, admin, designer, production
--
-- This is a fresh-DB script. If you already ran older migrations, drop the
-- public schema first (DESTROYS ALL DATA):
--
--   drop schema public cascade;
--   create schema public;
--   grant all on schema public to postgres, anon, authenticated, service_role;
--
-- Storage buckets live in supabase/migrations/0003_storage_buckets.sql.
-- ============================================================================

-- ============================================================================
-- 0. Extensions
-- ============================================================================
create extension if not exists pgcrypto;  -- gen_random_uuid, gen_random_bytes

-- ============================================================================
-- 1. Enums
-- ============================================================================
create type user_role as enum ('super_admin', 'admin', 'designer', 'production');

create type task_status as enum (
  'pool',
  'todo',
  'in_progress',
  'full_kitting',
  'approved',
  'sampling',
  'done'
);

create type task_priority as enum ('low', 'normal', 'high', 'urgent');

create type md_status as enum (
  'pending',
  'approved',
  'rejected',
  'revision_requested'
);

-- ============================================================================
-- 2. Annual counter table for ORD-YYYY-NNNN codes
-- ============================================================================
create table task_counters (
  year     int  primary key,
  last_num int  not null default 0
);

-- ============================================================================
-- 3. Tables
-- ============================================================================

-- ---------------------------------------------------------------------- profiles
create table profiles (
  id          uuid        primary key references auth.users(id) on delete cascade,
  full_name   text        not null,
  role        user_role   not null default 'designer',
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index profiles_role_idx on profiles(role);

-- ---------------------------------------------------------------------- clients
create table clients (
  id          uuid        primary key default gen_random_uuid(),
  party_name  text        not null unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------- concepts
-- Declared before tasks so tasks.concept_id can reference it.
create table concepts (
  id                       uuid        primary key default gen_random_uuid(),
  concept_code             text        not null unique,           -- C-YYYYMMDD-XXXX
  title                    text        not null,
  description              text,
  image_url                text        not null,
  submitted_by             uuid        not null references profiles(id) on delete restrict,
  md_status                md_status   not null default 'pending',
  md_reviewed_by           uuid                 references profiles(id) on delete set null,
  md_reviewed_at           timestamptz,
  md_planned_date          date,                                   -- created_at + 1
  md_actual_date           date,                                   -- stamped on review
  md_notes                 text,
  designer_planned_date    date,                                   -- approval + 4
  designer_actual_date     date,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index concepts_submitted_by_idx on concepts(submitted_by);
create index concepts_md_status_idx    on concepts(md_status);
create index concepts_created_at_idx   on concepts(created_at desc);

-- ---------------------------------------------------------------------- tasks
create table tasks (
  id                uuid          primary key default gen_random_uuid(),
  task_code         text          not null unique,                 -- ORD-YYYY-NNNN
  client_id         uuid          not null references clients(id)  on delete restrict,
  concept_id        uuid                   references concepts(id) on delete set null,
  concept           text          not null,
  qty               numeric(10,2) not null check (qty > 0),
  qty_completed     numeric(10,2) not null default 0
                    check (qty_completed >= 0 and qty_completed <= qty),
  fabric            text          not null,
  priority          task_priority not null default 'normal',
  status            task_status   not null default 'pool',
  assigned_to       uuid                   references profiles(id) on delete set null,
  planned_deadline  date,
  started_at        timestamptz,                                   -- stamped on in_progress
  kitted_at         timestamptz,                                   -- stamped on full_kitting
  notes             text,
  created_by        uuid          not null references profiles(id) on delete restrict,
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now()
);

create index tasks_status_idx           on tasks(status);
create index tasks_assigned_to_idx      on tasks(assigned_to);
create index tasks_client_id_idx        on tasks(client_id);
create index tasks_concept_id_idx       on tasks(concept_id);
create index tasks_planned_deadline_idx on tasks(planned_deadline);

-- ---------------------------------------------------------------------- task_logs (append-only audit)
create table task_logs (
  id           uuid        primary key default gen_random_uuid(),
  task_id      uuid        not null references tasks(id) on delete cascade,
  status_from  task_status,
  status_to    task_status not null,
  changed_by   uuid        not null references profiles(id) on delete restrict,
  note         text,
  timestamp    timestamptz not null default now()
);

create index task_logs_task_id_idx   on task_logs(task_id);
create index task_logs_timestamp_idx on task_logs(timestamp desc);

-- ---------------------------------------------------------------------- files
create table files (
  id           uuid        primary key default gen_random_uuid(),
  task_id      uuid        not null references tasks(id) on delete cascade,
  storage_url  text        not null,
  file_name    text        not null,
  file_size    bigint      not null check (file_size >= 0),
  uploaded_by  uuid        not null references profiles(id) on delete restrict,
  uploaded_at  timestamptz not null default now()
);

create index files_task_id_idx     on files(task_id);
create index files_uploaded_at_idx on files(uploaded_at desc);

-- ---------------------------------------------------------------------- sampling_logs
create table sampling_logs (
  id              uuid          primary key default gen_random_uuid(),
  task_id         uuid          not null references tasks(id) on delete cascade,
  meters_printed  numeric(10,2) not null check (meters_printed >= 0),
  proof_url       text,
  logged_by       uuid          not null references profiles(id) on delete restrict,
  logged_at       timestamptz   not null default now()
);

create index sampling_logs_task_id_idx   on sampling_logs(task_id);
create index sampling_logs_logged_at_idx on sampling_logs(logged_at desc);

-- ============================================================================
-- 4. Auth/role helpers
-- ============================================================================
create or replace function auth_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function is_admin()
returns boolean
language sql
stable
as $$
  select auth_role() in ('super_admin', 'admin');
$$;

-- ============================================================================
-- 5. ID generators (per spec)
-- ============================================================================

-- ORD-YYYY-NNNN — atomic per-year counter, resets each calendar year.
create or replace function next_task_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  y int := extract(year from now())::int;
  n int;
begin
  insert into public.task_counters (year, last_num)
    values (y, 1)
    on conflict (year)
    do update set last_num = public.task_counters.last_num + 1
    returning last_num into n;
  return 'ORD-' || y::text || '-' || lpad(n::text, 4, '0');
end;
$$;

-- C-YYYYMMDD-XXXX — 4 random alphanumeric chars (no I/O/0/1 to avoid confusion).
create or replace function next_concept_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  alphabet  text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  rnd       text;
  candidate text;
  i         int;
  attempts  int  := 0;
begin
  loop
    rnd := '';
    for i in 1..4 loop
      rnd := rnd || substr(alphabet, 1 + (floor(random() * length(alphabet)))::int, 1);
    end loop;
    candidate := 'C-' || to_char(now(), 'YYYYMMDD') || '-' || rnd;
    if not exists (select 1 from public.concepts where concept_code = candidate) then
      return candidate;
    end if;
    attempts := attempts + 1;
    if attempts > 20 then
      raise exception 'next_concept_code: could not generate unique code after 20 attempts';
    end if;
  end loop;
end;
$$;

-- ============================================================================
-- 6. Generic updated_at toucher
-- ============================================================================
create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on profiles
  for each row execute procedure touch_updated_at();

create trigger clients_touch_updated_at
  before update on clients
  for each row execute procedure touch_updated_at();

create trigger tasks_touch_updated_at
  before update on tasks
  for each row execute procedure touch_updated_at();

create trigger concepts_touch_updated_at
  before update on concepts
  for each row execute procedure touch_updated_at();

-- ============================================================================
-- 7. Auto-provision a profile when an auth user is added
-- ============================================================================
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email, 'New user'),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'designer')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ============================================================================
-- 8. Tasks: assign code + stamp status transition timestamps
-- ============================================================================
create or replace function tasks_before_save()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.task_code is null or new.task_code = '' then
      new.task_code := next_task_code();
    end if;
    if new.status = 'in_progress' and new.started_at is null then
      new.started_at := now();
    end if;
    if new.status = 'full_kitting' and new.kitted_at is null then
      new.kitted_at := now();
    end if;
    return new;
  end if;

  -- UPDATE: stamp on transition
  if old.status is distinct from new.status then
    if new.status = 'in_progress' and new.started_at is null then
      new.started_at := now();
    end if;
    if new.status = 'full_kitting' and new.kitted_at is null then
      new.kitted_at := now();
    end if;
  end if;
  return new;
end;
$$;

create trigger tasks_before_save_trg
  before insert or update on tasks
  for each row execute procedure tasks_before_save();

-- ============================================================================
-- 9. Tasks: append to task_logs on insert + status change
-- ============================================================================
create or replace function tasks_log_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.task_logs (task_id, status_from, status_to, changed_by, note)
    values (new.id, null, new.status, new.created_by, 'Task created');
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
    insert into public.task_logs (task_id, status_from, status_to, changed_by, note)
    values (new.id, old.status, new.status, coalesce(auth.uid(), new.created_by), null);
  end if;
  return null;
end;
$$;

create trigger tasks_log_change_trg
  after insert or update on tasks
  for each row execute procedure tasks_log_change();

-- ============================================================================
-- 10. Concepts: assign code + md_planned_date on insert
-- ============================================================================
create or replace function concepts_before_insert()
returns trigger
language plpgsql
as $$
begin
  if new.concept_code is null or new.concept_code = '' then
    new.concept_code := next_concept_code();
  end if;
  if new.md_planned_date is null then
    new.md_planned_date := (coalesce(new.created_at, now()))::date + 1;
  end if;
  return new;
end;
$$;

create trigger concepts_before_insert_trg
  before insert on concepts
  for each row execute procedure concepts_before_insert();

-- ============================================================================
-- 11. Concepts: stamp review dates + grant +4 days on approval
-- ============================================================================
create or replace function concepts_before_update()
returns trigger
language plpgsql
as $$
begin
  if old.md_status is distinct from new.md_status then
    -- Any move OUT of pending captures the actual review timestamp
    if new.md_status in ('approved', 'rejected', 'revision_requested') then
      if new.md_actual_date is null then
        new.md_actual_date := current_date;
      end if;
      if new.md_reviewed_at is null then
        new.md_reviewed_at := now();
      end if;
    end if;
    -- Approval starts the 4-day designer finalization window
    if new.md_status = 'approved' and new.designer_planned_date is null then
      new.designer_planned_date := current_date + 4;
    end if;
  end if;
  return new;
end;
$$;

create trigger concepts_before_update_trg
  before update on concepts
  for each row execute procedure concepts_before_update();

-- ============================================================================
-- 12. Row-Level Security
-- ============================================================================
alter table profiles      enable row level security;
alter table clients       enable row level security;
alter table concepts      enable row level security;
alter table tasks         enable row level security;
alter table task_logs     enable row level security;
alter table files         enable row level security;
alter table sampling_logs enable row level security;
-- task_counters intentionally has no RLS — only SECURITY DEFINER functions touch it.

-- ----------------------------------------------------------------- profiles
-- Everyone signed in can see all profiles (needed for assignee dropdowns, etc.)
create policy "profiles_select_authed"
  on profiles for select
  using (auth.uid() is not null);

-- A user can edit their own profile but NOT change their own role.
create policy "profiles_update_self"
  on profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select role from profiles where id = auth.uid())
  );

-- Admins can edit any profile, but cannot escalate their own role.
create policy "profiles_update_admin"
  on profiles for update
  using (is_admin())
  with check (
    is_admin()
    and (id <> auth.uid() or role = (select role from profiles where id = auth.uid()))
  );

create policy "profiles_delete_admin"
  on profiles for delete
  using (is_admin() and id <> auth.uid());

-- ----------------------------------------------------------------- clients
create policy "clients_select_authed"
  on clients for select
  using (auth.uid() is not null);

create policy "clients_insert_designer_admin"
  on clients for insert
  with check (auth_role() in ('super_admin', 'admin', 'designer'));

create policy "clients_update_admin"
  on clients for update
  using (is_admin())
  with check (is_admin());

create policy "clients_delete_admin"
  on clients for delete
  using (is_admin());

-- ----------------------------------------------------------------- concepts
create policy "concepts_select_authed"
  on concepts for select
  using (auth.uid() is not null);

-- Designers + admins can submit concepts (must own the submission).
create policy "concepts_insert_designer_admin"
  on concepts for insert
  with check (
    auth_role() in ('super_admin', 'admin', 'designer')
    and submitted_by = auth.uid()
  );

-- The submitter can edit while the concept is still pending or in revision.
-- They cannot self-approve (the WITH CHECK keeps md_status in non-terminal).
create policy "concepts_update_submitter_pending"
  on concepts for update
  using (
    submitted_by = auth.uid()
    and md_status in ('pending', 'revision_requested')
  )
  with check (
    submitted_by = auth.uid()
    and md_status in ('pending', 'revision_requested')
  );

-- After approval, the submitter can update finalization fields (e.g. actual date).
create policy "concepts_update_submitter_finalize"
  on concepts for update
  using (submitted_by = auth.uid() and md_status = 'approved')
  with check (submitted_by = auth.uid() and md_status = 'approved');

-- Admins (the "MD" role in domain terms) can review and change md_status.
create policy "concepts_update_admin"
  on concepts for update
  using (is_admin())
  with check (is_admin());

create policy "concepts_delete_admin"
  on concepts for delete
  using (is_admin());

-- ----------------------------------------------------------------- tasks
create policy "tasks_select_authed"
  on tasks for select
  using (auth.uid() is not null);

-- Designers + admins create tasks. Must mark themselves as creator.
create policy "tasks_insert_designer_admin"
  on tasks for insert
  with check (
    auth_role() in ('super_admin', 'admin', 'designer')
    and created_by = auth.uid()
  );

-- Admins can update any task.
create policy "tasks_update_admin"
  on tasks for update
  using (is_admin())
  with check (is_admin());

-- Assignee or creator (any role, including production) can update their task.
create policy "tasks_update_assignee_or_creator"
  on tasks for update
  using (
    auth.uid() is not null
    and (assigned_to = auth.uid() or created_by = auth.uid())
  )
  with check (
    auth.uid() is not null
    and (assigned_to = auth.uid() or created_by = auth.uid())
  );

create policy "tasks_delete_admin"
  on tasks for delete
  using (is_admin());

-- ----------------------------------------------------------------- task_logs (append-only)
create policy "task_logs_select_authed"
  on task_logs for select
  using (auth.uid() is not null);

-- The trigger writes these as SECURITY DEFINER (bypasses RLS).
-- Direct inserts allowed only when changed_by = self (or admin) — defensive.
create policy "task_logs_insert_self"
  on task_logs for insert
  with check (changed_by = auth.uid() or is_admin());

-- No update / no delete policies → table is effectively immutable from the API.

-- ----------------------------------------------------------------- files
create policy "files_select_authed"
  on files for select
  using (auth.uid() is not null);

-- Any signed-in user can upload (provided they tag themselves as uploader).
create policy "files_insert_self"
  on files for insert
  with check (uploaded_by = auth.uid());

create policy "files_delete_admin_or_uploader"
  on files for delete
  using (is_admin() or uploaded_by = auth.uid());

-- ----------------------------------------------------------------- sampling_logs
create policy "sampling_logs_select_authed"
  on sampling_logs for select
  using (auth.uid() is not null);

-- Production + admins log sampling activity.
create policy "sampling_logs_insert_production_admin"
  on sampling_logs for insert
  with check (
    auth_role() in ('super_admin', 'admin', 'production')
    and logged_by = auth.uid()
  );

create policy "sampling_logs_delete_admin"
  on sampling_logs for delete
  using (is_admin());

-- ============================================================================
-- Done. Verify with:
--   select table_name from information_schema.tables where table_schema = 'public';
-- Expected: clients, concepts, files, profiles, sampling_logs, task_counters,
--           task_logs, tasks
-- ============================================================================
