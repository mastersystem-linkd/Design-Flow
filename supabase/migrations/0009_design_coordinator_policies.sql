-- ============================================================================
-- LinkD FMS — Design coordinator role: helpers + RLS rewrites
-- ============================================================================
-- Run AFTER 0008_design_coordinator_role.sql has committed.
--
-- A design_coordinator inherits most admin capabilities (briefs, sampling,
-- task management, client management) but is EXCLUDED from:
--
--   1. Concept approval — admin only can flip `concepts.md_status`
--   2. Role management — admin only can change other users' roles
--
-- All RLS predicates that previously meant "admin can do this elevated thing"
-- are switched to a new `is_admin_or_coordinator()` helper. The two
-- exclusives keep using the existing `is_admin()` helper.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Helper: admin OR design_coordinator
-- ----------------------------------------------------------------------------
create or replace function is_admin_or_coordinator()
returns boolean
language sql
stable
as $$
  select auth_role() in ('admin', 'design_coordinator');
$$;

-- ----------------------------------------------------------------------------
-- 2. Update handle_new_user so signup metadata can request the new role
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
  if requested = 'admin' then
    final_role := 'admin'::user_role;
  elsif requested = 'design_coordinator' then
    final_role := 'design_coordinator'::user_role;
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
-- 3. Rewrite policies that should grant coordinator the admin-like access.
--    Pattern: drop then create — IF EXISTS guards make this re-runnable.
-- ----------------------------------------------------------------------------

-- ---------- clients ----------
drop policy if exists "clients_insert_designer_admin" on clients;
create policy "clients_insert_designer_admin"
  on clients for insert
  with check (auth_role() in ('admin', 'design_coordinator', 'designer'));

drop policy if exists "clients_update_admin" on clients;
create policy "clients_update_admin"
  on clients for update
  using (is_admin_or_coordinator())
  with check (is_admin_or_coordinator());

drop policy if exists "clients_delete_admin" on clients;
create policy "clients_delete_admin"
  on clients for delete
  using (is_admin_or_coordinator());

-- ---------- tasks ----------
drop policy if exists "tasks_select_authed" on tasks;
create policy "tasks_select_authed"
  on tasks for select
  using (
    auth.uid() is not null
    and (deleted_at is null or is_admin_or_coordinator())
  );

drop policy if exists "tasks_insert_designer_admin" on tasks;
create policy "tasks_insert_designer_admin"
  on tasks for insert
  with check (
    auth_role() in ('admin', 'design_coordinator', 'designer')
    and created_by = auth.uid()
  );

drop policy if exists "tasks_update_admin" on tasks;
create policy "tasks_update_admin"
  on tasks for update
  using (is_admin_or_coordinator())
  with check (is_admin_or_coordinator());

drop policy if exists "tasks_delete_admin" on tasks;
create policy "tasks_delete_admin"
  on tasks for delete
  using (is_admin_or_coordinator());

-- ---------- task_logs ----------
drop policy if exists "task_logs_insert_self" on task_logs;
create policy "task_logs_insert_self"
  on task_logs for insert
  with check (changed_by = auth.uid() or is_admin_or_coordinator());

-- ---------- files ----------
drop policy if exists "files_delete_admin_or_uploader" on files;
create policy "files_delete_admin_or_uploader"
  on files for delete
  using (is_admin_or_coordinator() or uploaded_by = auth.uid());

-- ---------- sampling_logs ----------
drop policy if exists "sampling_logs_insert_admin" on sampling_logs;
create policy "sampling_logs_insert_admin"
  on sampling_logs for insert
  with check (is_admin_or_coordinator() and logged_by = auth.uid());

drop policy if exists "sampling_logs_delete_admin" on sampling_logs;
create policy "sampling_logs_delete_admin"
  on sampling_logs for delete
  using (is_admin_or_coordinator());

-- ---------- Storage policies that mention admin ----------
drop policy if exists "task_files_delete_own_or_admin" on storage.objects;
create policy "task_files_delete_own_or_admin"
  on storage.objects for delete
  using (
    bucket_id = 'task-files'
    and (owner = auth.uid() or public.is_admin_or_coordinator())
  );

drop policy if exists "sampling_proofs_delete_admin" on storage.objects;
create policy "sampling_proofs_delete_admin"
  on storage.objects for delete
  using (bucket_id = 'sampling-proofs' and public.is_admin_or_coordinator());

drop policy if exists "design_files_delete_admin" on storage.objects;
create policy "design_files_delete_admin"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'design-files'
    and public.is_admin_or_coordinator()
  );

drop policy if exists "proof_photos_insert_admin" on storage.objects;
create policy "proof_photos_insert_admin"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'proof-photos'
    and public.is_admin_or_coordinator()
  );

drop policy if exists "proof_photos_delete_admin" on storage.objects;
create policy "proof_photos_delete_admin"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'proof-photos'
    and public.is_admin_or_coordinator()
  );

-- ----------------------------------------------------------------------------
-- 4. Policies that STAY admin-exclusive (no change below — listed here so the
--    audit trail is explicit about what design_coordinator does NOT get):
-- ----------------------------------------------------------------------------
--   • concepts_update_admin      — uses is_admin(); only admin reviews concepts.
--   • concepts_delete_admin      — uses is_admin().
--   • profiles_update_admin      — uses is_admin(); blocks coord-driven role changes.
--   • profiles_delete_admin      — uses is_admin().
--   • designer_codes_*_admin     — admin-only CRUD on designer code identifiers.
-- ----------------------------------------------------------------------------
