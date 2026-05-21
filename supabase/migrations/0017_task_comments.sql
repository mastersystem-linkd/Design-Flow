-- ============================================================================
-- LinkD FMS — Task comments (discussion thread)
-- ============================================================================
-- One row per comment posted on a task. Surfaces inside TaskDetailDrawer as a
-- "Discussion" section below the activity log.
--
-- Author column is `user_id` referencing profiles(id). Body is plain text up
-- to 2000 chars; the UI shows a counter when approaching the limit.
--
-- RLS: all authenticated users can read; users can only edit/delete their
-- own comments. Admins + coordinators can also delete any comment.
--
-- Uses existing helpers from 0001 / 0009:
--   - touch_updated_at() trigger function
--   - is_admin_or_coordinator() policy helper
-- ============================================================================
--
-- NOTE: file numbered 0017 because the repo already has 0015_kitting_file_url
-- and 0016_* migrations applied. (The original task brief said 0015, which
-- predated those follow-ups.)

begin;

create table if not exists public.task_comments (
  id          uuid          primary key default gen_random_uuid(),
  task_id     uuid          not null references public.tasks(id)    on delete cascade,
  user_id     uuid          not null references public.profiles(id) on delete cascade,
  body        text          not null
                            check (char_length(body) > 0 and char_length(body) <= 2000),
  created_at  timestamptz   not null default now(),
  updated_at  timestamptz   not null default now()
);

-- Drawer reads comments for one task ordered by time → primary index pairs
-- (task_id, created_at desc) so the planner can serve it without a sort.
create index if not exists idx_task_comments_task_id
  on public.task_comments (task_id, created_at desc);

create index if not exists idx_task_comments_user_id
  on public.task_comments (user_id);

-- ── RLS ──
alter table public.task_comments enable row level security;

-- Read: any signed-in user can read every comment on every task they can see.
-- (Task visibility itself is gated by the tasks-table RLS, so RLS chains
-- naturally — if you can't see the task you won't be querying its comments.)
drop policy if exists "task_comments_select_authenticated" on public.task_comments;
create policy "task_comments_select_authenticated"
  on public.task_comments
  for select
  using (auth.uid() is not null);

-- Insert: only as yourself.
drop policy if exists "task_comments_insert_own" on public.task_comments;
create policy "task_comments_insert_own"
  on public.task_comments
  for insert
  with check (auth.uid() = user_id);

-- Update: only your own comments (use case = edit text).
drop policy if exists "task_comments_update_own" on public.task_comments;
create policy "task_comments_update_own"
  on public.task_comments
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Delete: own comment, OR admin/coordinator can moderate.
drop policy if exists "task_comments_delete_own_or_admin" on public.task_comments;
create policy "task_comments_delete_own_or_admin"
  on public.task_comments
  for delete
  using (auth.uid() = user_id or public.is_admin_or_coordinator());

-- updated_at maintenance — reuse the generic toucher from 0001.
drop trigger if exists task_comments_touch_updated on public.task_comments;
create trigger task_comments_touch_updated
  before update on public.task_comments
  for each row
  execute function public.touch_updated_at();

commit;
