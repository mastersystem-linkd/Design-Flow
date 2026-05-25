-- 0024_team_crud.sql
-- Team Management CRUD for admin + design_coordinator.
--
-- What this enables:
--   * Soft-delete users via is_active flag (auth.users stays intact —
--     hard-delete from the client is impossible with the anon key, and
--     orphaning would cascade-wreck tasks/concepts/etc.)
--   * Coordinators can change roles + deactivate users alongside admins.
--   * Self-edits of name/avatar still work without letting users escalate
--     their own role.

-- ============================================================================
-- 1. Soft-delete columns
-- ============================================================================

alter table public.profiles
  add column if not exists is_active      boolean      not null default true,
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivated_by uuid references auth.users(id) on delete set null;

-- Partial index — most queries only look at active users.
create index if not exists profiles_active_idx
  on public.profiles (is_active)
  where is_active = true;

-- ============================================================================
-- 2. RLS — admin / coordinator can update any profile (including role);
--    everyone can still update their own name + avatar but NOT their own role.
-- ============================================================================

-- Wipe any previous variants so this migration is idempotent.
drop policy if exists "profiles_update_admin"          on public.profiles;
drop policy if exists "profiles_update_self"           on public.profiles;
drop policy if exists "elevated update profile"        on public.profiles;
drop policy if exists "self update profile no role"    on public.profiles;
drop policy if exists "admin updates any profile"      on public.profiles;
drop policy if exists "coord updates any profile"      on public.profiles;

-- Elevated path: admin or design_coordinator can update any row, any field.
create policy "elevated update profile"
  on public.profiles
  for update
  to authenticated
  using (is_admin_or_coordinator())
  with check (is_admin_or_coordinator());

-- Self-edit path: a user can update their own row, but the role they write
-- back must equal the role they had before (i.e. no self-promotion).
create policy "self update profile no role"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select p.role from public.profiles p where p.id = auth.uid())
  );

-- ============================================================================
-- 3. RLS — no DELETE on profiles from the client.
--    Soft-delete via is_active is the supported path; a hard DELETE would
--    cascade and we want a paper trail. If a real purge is ever needed,
--    do it via service-role from a server function.
-- ============================================================================

drop policy if exists "profiles_delete_admin" on public.profiles;
drop policy if exists "profiles_delete"       on public.profiles;
-- (Intentionally no replacement policy — DELETE stays disallowed.)

-- ============================================================================
-- 4. Helper view — active team only (optional convenience for the app).
-- ============================================================================

create or replace view public.active_profiles as
  select * from public.profiles where is_active = true;

grant select on public.active_profiles to authenticated;
