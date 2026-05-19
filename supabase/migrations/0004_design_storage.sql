-- ============================================================================
-- LinkD FMS — Storage: design-files + proof-photos
-- ============================================================================
-- Requires public.is_admin() and public.auth_role() from 0001_full_schema.sql.
--
-- Idempotent: bucket rows upserted, policies dropped-then-created.
--
-- File size and MIME restrictions are enforced by Supabase Storage at the
-- bucket level (file_size_limit, allowed_mime_types). RLS policies handle
-- who can read/write/delete.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Buckets — sizes in BYTES (50 MB = 52428800, 10 MB = 10485760)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'design-files',
    'design-files',
    false,
    52428800,
    array['image/jpeg', 'image/png', 'image/psd', 'application/octet-stream']
  ),
  (
    'proof-photos',
    'proof-photos',
    false,
    10485760,
    array['image/jpeg', 'image/png']
  )
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ============================================================================
-- 2. design-files — authed read; uploads only into {auth.uid()}/...; admin delete
-- ============================================================================

-- INSERT: bucket-scoped, and the first path segment MUST equal the user's UUID.
-- Example valid path:   "550e8400-e29b-41d4-a716-446655440000/sketches/v1.psd"
-- Example invalid path: "shared/v1.psd"  → rejected.
drop policy if exists "design_files_insert_own_folder" on storage.objects;
create policy "design_files_insert_own_folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'design-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- SELECT: any signed-in user can read every file (designers need to see each
-- other's concept uploads).
drop policy if exists "design_files_select_authed" on storage.objects;
create policy "design_files_select_authed"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'design-files');

-- UPDATE: same constraint as insert (keeps users from moving files into
-- someone else's folder). Owner-only.
drop policy if exists "design_files_update_own" on storage.objects;
create policy "design_files_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'design-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'design-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- DELETE: admin and super_admin only.
drop policy if exists "design_files_delete_admin" on storage.objects;
create policy "design_files_delete_admin"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'design-files'
    and public.is_admin()
  );

-- ============================================================================
-- 3. proof-photos — production-only upload; authed read; admin delete
-- ============================================================================

-- INSERT: strictly the 'production' role (per spec).
-- Note: super_admin and admin CANNOT upload here under this rule. If you want
-- admins to be able to seed/test, change the predicate to
--   public.auth_role() in ('production', 'admin', 'super_admin').
drop policy if exists "proof_photos_insert_production" on storage.objects;
create policy "proof_photos_insert_production"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'proof-photos'
    and public.auth_role() = 'production'
  );

-- SELECT: any signed-in user can read.
drop policy if exists "proof_photos_select_authed" on storage.objects;
create policy "proof_photos_select_authed"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'proof-photos');

-- DELETE: admin and super_admin (spec didn't define delete; defensive default
-- so production users can't wipe their own evidence).
drop policy if exists "proof_photos_delete_admin" on storage.objects;
create policy "proof_photos_delete_admin"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'proof-photos'
    and public.is_admin()
  );
