-- ============================================================================
-- LinkD FMS — Simplify roles to admin + designer only
-- ============================================================================
-- Merges `super_admin` → `admin` (full powers) and `production` → `admin`
-- (admin now logs sampling, uploads proofs, etc.).
--
-- Order: remap data → drop dependent policies & functions → swap the enum →
-- recreate functions → recreate policies (with the simplified role set).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Remap existing users to the new role set
-- ----------------------------------------------------------------------------
update profiles set role = 'admin'
  where role in ('super_admin', 'production');

-- ----------------------------------------------------------------------------
-- 2. Drop every policy that references the old enum values (or depends on
--    the helper functions we're about to rebuild)
-- ----------------------------------------------------------------------------
drop policy if exists "profiles_select_authed"            on profiles;
drop policy if exists "profiles_update_self"              on profiles;
drop policy if exists "profiles_update_admin"             on profiles;
drop policy if exists "profiles_delete_admin"             on profiles;

drop policy if exists "clients_select_authed"             on clients;
drop policy if exists "clients_insert_designer_admin"     on clients;
drop policy if exists "clients_update_admin"              on clients;
drop policy if exists "clients_delete_admin"              on clients;

drop policy if exists "concepts_select_authed"            on concepts;
drop policy if exists "concepts_insert_designer_admin"    on concepts;
drop policy if exists "concepts_update_submitter_pending" on concepts;
drop policy if exists "concepts_update_submitter_finalize" on concepts;
drop policy if exists "concepts_update_admin"             on concepts;
drop policy if exists "concepts_delete_admin"             on concepts;

drop policy if exists "tasks_select_authed"               on tasks;
drop policy if exists "tasks_insert_designer_admin"       on tasks;
drop policy if exists "tasks_update_admin"                on tasks;
drop policy if exists "tasks_update_assignee_or_creator"  on tasks;
drop policy if exists "tasks_delete_admin"                on tasks;

drop policy if exists "task_logs_select_authed"           on task_logs;
drop policy if exists "task_logs_insert_self"             on task_logs;

drop policy if exists "files_select_authed"               on files;
drop policy if exists "files_insert_self"                 on files;
drop policy if exists "files_delete_admin_or_uploader"    on files;

drop policy if exists "sampling_logs_select_authed"        on sampling_logs;
drop policy if exists "sampling_logs_insert_production_admin" on sampling_logs;
drop policy if exists "sampling_logs_delete_admin"         on sampling_logs;

-- Storage policies that mention production / super_admin
drop policy if exists "sampling_proofs_insert"            on storage.objects;
drop policy if exists "proof_photos_insert_production"    on storage.objects;

-- Storage policies that DEPEND on is_admin() (from 0003 + 0004) — must drop
-- before is_admin() can be recreated. They're rebuilt at the bottom of this
-- migration with the same intent.
drop policy if exists "task_files_delete_own_or_admin"    on storage.objects;
drop policy if exists "sampling_proofs_delete_admin"      on storage.objects;
drop policy if exists "design_files_delete_admin"         on storage.objects;
drop policy if exists "proof_photos_delete_admin"         on storage.objects;

-- ----------------------------------------------------------------------------
-- 3. Drop helper functions that return / use user_role
-- ----------------------------------------------------------------------------
drop function if exists is_admin();
drop function if exists auth_role();

-- ----------------------------------------------------------------------------
-- 4. Swap the enum (old → new, then retype the column, then drop the old type)
-- ----------------------------------------------------------------------------
alter type user_role rename to user_role_old;
create type user_role as enum ('admin', 'designer');

alter table profiles
  alter column role drop default,
  alter column role type user_role using role::text::user_role,
  alter column role set default 'designer'::user_role;

drop type user_role_old;

-- ----------------------------------------------------------------------------
-- 5. Recreate helper functions on the new enum
-- ----------------------------------------------------------------------------
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
  select auth_role() = 'admin';
$$;

-- ----------------------------------------------------------------------------
-- 6. Update the auto-provision trigger so it can't insert removed roles
-- ----------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested text := new.raw_user_meta_data->>'role';
  final_role user_role;
begin
  -- Only honour 'admin' or 'designer'; anything else (or null) becomes designer.
  if requested = 'admin' then
    final_role := 'admin'::user_role;
  else
    final_role := 'designer'::user_role;
  end if;

  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email, 'New user'),
    final_role
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. Recreate every policy for the simplified role set
-- ----------------------------------------------------------------------------

-- profiles
create policy "profiles_select_authed" on profiles for select
  using (auth.uid() is not null);

create policy "profiles_update_self" on profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select role from profiles where id = auth.uid())
  );

create policy "profiles_update_admin" on profiles for update
  using (is_admin())
  with check (
    is_admin()
    and (id <> auth.uid() or role = (select role from profiles where id = auth.uid()))
  );

create policy "profiles_delete_admin" on profiles for delete
  using (is_admin() and id <> auth.uid());

-- clients
create policy "clients_select_authed" on clients for select
  using (auth.uid() is not null);

create policy "clients_insert_designer_admin" on clients for insert
  with check (auth_role() in ('admin', 'designer'));

create policy "clients_update_admin" on clients for update
  using (is_admin()) with check (is_admin());

create policy "clients_delete_admin" on clients for delete
  using (is_admin());

-- concepts
create policy "concepts_select_authed" on concepts for select
  using (auth.uid() is not null);

create policy "concepts_insert_designer_admin" on concepts for insert
  with check (
    auth_role() in ('admin', 'designer')
    and submitted_by = auth.uid()
  );

create policy "concepts_update_submitter_pending" on concepts for update
  using (
    submitted_by = auth.uid()
    and md_status in ('pending', 'revision_requested')
  )
  with check (
    submitted_by = auth.uid()
    and md_status in ('pending', 'revision_requested')
  );

create policy "concepts_update_submitter_finalize" on concepts for update
  using (submitted_by = auth.uid() and md_status = 'approved')
  with check (submitted_by = auth.uid() and md_status = 'approved');

create policy "concepts_update_admin" on concepts for update
  using (is_admin()) with check (is_admin());

create policy "concepts_delete_admin" on concepts for delete
  using (is_admin());

-- tasks
create policy "tasks_select_authed" on tasks for select
  using (
    auth.uid() is not null
    and (deleted_at is null or is_admin())
  );

create policy "tasks_insert_designer_admin" on tasks for insert
  with check (
    auth_role() in ('admin', 'designer')
    and created_by = auth.uid()
  );

create policy "tasks_update_admin" on tasks for update
  using (is_admin()) with check (is_admin());

create policy "tasks_update_assignee_or_creator" on tasks for update
  using (
    auth.uid() is not null
    and (assigned_to = auth.uid() or created_by = auth.uid())
  )
  with check (
    auth.uid() is not null
    and (assigned_to = auth.uid() or created_by = auth.uid())
    and deleted_at is null
  );

create policy "tasks_delete_admin" on tasks for delete
  using (is_admin());

-- task_logs (append-only)
create policy "task_logs_select_authed" on task_logs for select
  using (auth.uid() is not null);

create policy "task_logs_insert_self" on task_logs for insert
  with check (changed_by = auth.uid() or is_admin());

-- files
create policy "files_select_authed" on files for select
  using (auth.uid() is not null);

create policy "files_insert_self" on files for insert
  with check (uploaded_by = auth.uid());

create policy "files_delete_admin_or_uploader" on files for delete
  using (is_admin() or uploaded_by = auth.uid());

-- sampling_logs (admin-only insert now; production role is gone)
create policy "sampling_logs_select_authed" on sampling_logs for select
  using (auth.uid() is not null);

create policy "sampling_logs_insert_admin" on sampling_logs for insert
  with check (is_admin() and logged_by = auth.uid());

create policy "sampling_logs_delete_admin" on sampling_logs for delete
  using (is_admin());

-- Storage: proof-photos now admin-only upload
create policy "proof_photos_insert_admin"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'proof-photos'
    and public.is_admin()
  );

-- Storage: rebuild the delete policies we had to drop above so existing
-- buckets keep their access rules.
create policy "task_files_delete_own_or_admin"
  on storage.objects for delete
  using (
    bucket_id = 'task-files'
    and (owner = auth.uid() or public.is_admin())
  );

create policy "sampling_proofs_delete_admin"
  on storage.objects for delete
  using (bucket_id = 'sampling-proofs' and public.is_admin());

create policy "design_files_delete_admin"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'design-files'
    and public.is_admin()
  );

create policy "proof_photos_delete_admin"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'proof-photos'
    and public.is_admin()
  );
