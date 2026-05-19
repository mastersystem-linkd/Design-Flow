-- LinkD FMS — Supabase Storage buckets + policies
-- Run AFTER 0002_rls_policies.sql

-- ============================================================================
-- Buckets
-- ============================================================================
insert into storage.buckets (id, name, public)
values
  ('task-files', 'task-files', false),
  ('sampling-proofs', 'sampling-proofs', false),
  ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- ============================================================================
-- task-files — any authed user reads; uploader writes
-- ============================================================================
create policy "task_files_select"
  on storage.objects for select
  using (bucket_id = 'task-files' and auth.uid() is not null);

create policy "task_files_insert"
  on storage.objects for insert
  with check (bucket_id = 'task-files' and auth.uid() is not null);

create policy "task_files_delete_own_or_admin"
  on storage.objects for delete
  using (
    bucket_id = 'task-files'
    and (owner = auth.uid() or public.is_admin())
  );

-- ============================================================================
-- sampling-proofs — production/admin only
-- ============================================================================
create policy "sampling_proofs_select"
  on storage.objects for select
  using (bucket_id = 'sampling-proofs' and auth.uid() is not null);

create policy "sampling_proofs_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'sampling-proofs'
    and public.auth_role() in ('super_admin', 'admin', 'production')
  );

create policy "sampling_proofs_delete_admin"
  on storage.objects for delete
  using (bucket_id = 'sampling-proofs' and public.is_admin());

-- ============================================================================
-- avatars — public read, owner write
-- ============================================================================
create policy "avatars_select_public"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars_insert_own"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.uid() is not null);

create policy "avatars_update_own"
  on storage.objects for update
  using (bucket_id = 'avatars' and owner = auth.uid());

create policy "avatars_delete_own"
  on storage.objects for delete
  using (bucket_id = 'avatars' and owner = auth.uid());
