-- ============================================================================
-- LinkD FMS — Role-Based Access Control (role_permissions)
-- ============================================================================
-- Backs Settings → Access Control: a per-role matrix of which menu features
-- each role can access. The frontend resolves effective access as:
--   super_admin → always full access (never stored / never editable)
--   else        → this table's `granted` if a row exists, otherwise the
--                 built-in default in lib/accessControl.ts.
--
-- This governs NAV VISIBILITY (what shows in each role's sidebar). Route-level
-- allowedRoles guards remain the hard security floor and are unchanged — so an
-- empty/partial table degrades to exactly today's behavior (no lockouts).
--
-- Write access: super_admin + admin only (changing access control is sensitive;
-- coordinators manage data lookups, not access). Read: any authenticated user
-- (each client must resolve its own effective access).
-- ============================================================================

begin;

create table if not exists public.role_permissions (
  role            public.user_role not null,
  permission_key  text             not null,
  granted         boolean          not null,
  updated_at      timestamptz      not null default now(),
  updated_by      uuid             references public.profiles(id) on delete set null,
  primary key (role, permission_key)
);

create trigger role_permissions_touch_updated_at
  before update on public.role_permissions
  for each row execute procedure public.touch_updated_at();

alter table public.role_permissions enable row level security;

drop policy if exists "role_permissions_read" on public.role_permissions;
create policy "role_permissions_read"
  on public.role_permissions for select
  using (auth.uid() is not null);

drop policy if exists "role_permissions_admin_write" on public.role_permissions;
create policy "role_permissions_admin_write"
  on public.role_permissions for all
  using (public.auth_role() in ('super_admin', 'admin'))
  with check (public.auth_role() in ('super_admin', 'admin'));

-- ── Seed the default matrix (mirrors lib/accessControl.ts DEFAULT_ROLE_ACCESS,
--    which itself mirrors the current per-role sidebar nav). super_admin is
--    intentionally NOT seeded — it is resolved as always-full in the client and
--    cannot be edited. Idempotent via ON CONFLICT. ──
insert into public.role_permissions (role, permission_key, granted) values
  -- admin (full menu)
  ('admin', 'dashboards', true),
  ('admin', 'all_tasks', true),
  ('admin', 'concepts', true),
  ('admin', 'orders', true),
  ('admin', 'sampling', true),
  ('admin', 'salvedge', true),
  ('admin', 'coordinator_tasks', true),
  ('admin', 'files', true),
  ('admin', 'scorecards', true),
  ('admin', 'settings', true),
  -- design_coordinator (same menu as admin)
  ('design_coordinator', 'dashboards', true),
  ('design_coordinator', 'all_tasks', true),
  ('design_coordinator', 'concepts', true),
  ('design_coordinator', 'orders', true),
  ('design_coordinator', 'sampling', true),
  ('design_coordinator', 'salvedge', true),
  ('design_coordinator', 'coordinator_tasks', true),
  ('design_coordinator', 'files', true),
  ('design_coordinator', 'scorecards', true),
  ('design_coordinator', 'settings', true),
  -- designer (own work surface)
  ('designer', 'dashboards', true),
  ('designer', 'all_tasks', true),
  ('designer', 'concepts', true),
  ('designer', 'salvedge', true),
  ('designer', 'files', true),
  -- deo (kitting queue only)
  ('deo', 'kitting', true)
on conflict (role, permission_key) do nothing;

-- New table → make sure PostgREST sees it without a manual cache reload.
notify pgrst, 'reload schema';

commit;
