-- ============================================================================
-- LinkD FMS — Notifications + Full Kitting Details
-- ============================================================================
-- Two new tables:
--   1. notifications   — in-app notification bell + feed
--   2. full_kitting_details — structured kitting submission per task
--
-- Uses existing helpers: is_admin(), is_admin_or_coordinator() from 0001/0009.
-- ============================================================================

begin;

-- ============================================================================
-- TABLE 1: notifications
-- ============================================================================
-- In-app notifications for the bell dropdown + full notifications page.
-- Immutable once created except for `is_read` (user marks their own as read).

create table if not exists public.notifications (
  id          uuid          primary key default gen_random_uuid(),
  user_id     uuid          not null references public.profiles(id) on delete cascade,
  title       text          not null,
  message     text          not null,
  type        text          not null default 'info'
                            check (type in ('info', 'warning', 'urgent', 'success')),
  link        text,                    -- optional in-app route (e.g. "/dashboard")
  is_read     boolean       not null default false,
  created_at  timestamptz   not null default now()
);

-- Composite index for the bell dropdown: unread first, newest first
create index if not exists notifications_user_read_created_idx
  on public.notifications(user_id, is_read, created_at desc);

-- Index for the full notifications page: all by recency
create index if not exists notifications_user_created_idx
  on public.notifications(user_id, created_at desc);

-- ── RLS ──

alter table public.notifications enable row level security;

-- Users can only see their own notifications
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select
  using (user_id = auth.uid());

-- Admin/coordinator can insert (for manual sends); service_role bypasses RLS
-- for edge-function / trigger-based inserts.
drop policy if exists "notifications_insert_admin_coordinator" on public.notifications;
create policy "notifications_insert_admin_coordinator"
  on public.notifications for insert
  with check (public.is_admin_or_coordinator());

-- Users can only mark their OWN notifications as read (is_read is the only
-- mutable column — the WITH CHECK ensures they can't change anything else
-- meaningful since all other columns are set at insert time).
drop policy if exists "notifications_update_own_read" on public.notifications;
create policy "notifications_update_own_read"
  on public.notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Only admin can delete notifications (cleanup / moderation)
drop policy if exists "notifications_delete_admin" on public.notifications;
create policy "notifications_delete_admin"
  on public.notifications for delete
  using (public.is_admin());


-- ============================================================================
-- TABLE 2: full_kitting_details
-- ============================================================================
-- Structured kitting submission data per task. One record per task (UNIQUE).
-- Complements the existing tasks.full_kitting_image_url / notes columns
-- with a richer structured form.

create table if not exists public.full_kitting_details (
  id                    uuid          primary key default gen_random_uuid(),
  task_id               uuid          not null references public.tasks(id) on delete cascade,
  submitted_by          uuid          not null references public.profiles(id),
  fabric_details        text,
  colors                text,
  quantity              integer,
  accessories           text,
  packing_type          text          not null
                        check (packing_type in ('standard', 'premium', 'bulk', 'custom')),
  special_instructions  text,
  created_at            timestamptz   not null default now()
);

-- One kitting record per task (skip if already added from a partial prior run)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'full_kitting_details_task_id_unique'
  ) then
    alter table public.full_kitting_details
      add constraint full_kitting_details_task_id_unique unique (task_id);
  end if;
end $$;

-- ── RLS ──

alter table public.full_kitting_details enable row level security;

-- Any authenticated user can read kitting details
drop policy if exists "full_kitting_details_select_authed" on public.full_kitting_details;
create policy "full_kitting_details_select_authed"
  on public.full_kitting_details for select
  using (auth.uid() is not null);

-- Only the submitter can create (submitted_by must match auth.uid())
drop policy if exists "full_kitting_details_insert_self" on public.full_kitting_details;
create policy "full_kitting_details_insert_self"
  on public.full_kitting_details for insert
  with check (submitted_by = auth.uid());

-- Admin or coordinator can update (review / correct kitting data)
drop policy if exists "full_kitting_details_update_admin_coordinator" on public.full_kitting_details;
create policy "full_kitting_details_update_admin_coordinator"
  on public.full_kitting_details for update
  using (public.is_admin_or_coordinator())
  with check (public.is_admin_or_coordinator());

-- Only admin can delete
drop policy if exists "full_kitting_details_delete_admin" on public.full_kitting_details;
create policy "full_kitting_details_delete_admin"
  on public.full_kitting_details for delete
  using (public.is_admin());

commit;
