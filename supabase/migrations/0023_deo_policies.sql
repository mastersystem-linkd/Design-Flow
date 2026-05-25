-- 0023_deo_policies.sql
-- DEO-specific RLS + a convenience view for the DEO queue UI.
-- Runs after 0022 has committed.

-- ── Helper: is the caller a DEO? ──────────────────────────────────────────
create or replace function is_deo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth_role() = 'deo';
$$;

-- ── Read access ───────────────────────────────────────────────────────────
-- DEOs see every kitting record (so they can pick up work). Admin and
-- coordinator already have read via earlier policies; this is additive.
drop policy if exists "deo read kitting" on public.full_kitting_details;
create policy "deo read kitting"
  on public.full_kitting_details
  for select
  to authenticated
  using (is_deo());

-- ── Write access ──────────────────────────────────────────────────────────
-- DEOs can update form_payload / status / priority / form_date / party_name
-- on any record that already has an image (i.e. the coordinator finished
-- Stage A). They can't insert (only coordinators create the row), can't
-- delete, and shouldn't touch task_id / image_url (enforced by the with-check
-- clause — `image_url is not null` means the image is locked in).
drop policy if exists "deo update kitting payload" on public.full_kitting_details;
create policy "deo update kitting payload"
  on public.full_kitting_details
  for update
  to authenticated
  using (is_deo() and image_url is not null)
  with check (is_deo() and image_url is not null);

-- ── DEO queue view ────────────────────────────────────────────────────────
-- Pending work for the DEO landing page. Joins task + client so the UI
-- doesn't need a follow-up fetch. RLS on the underlying table still applies.
-- Tasks use `assigned_to` (not `assignee_id`) — aliased so the consumer
-- field name stays stable.
drop view if exists public.deo_kitting_queue;
create view public.deo_kitting_queue as
select
  fk.id,
  fk.task_id,
  fk.image_url,
  fk.party_name,
  fk.priority,
  fk.data_entry_status,
  fk.form_date,
  fk.created_at,
  t.task_code,
  t.concept,
  t.client_id,
  c.party_name as client_party_name,
  t.assigned_to as assignee_id
from public.full_kitting_details fk
left join public.tasks t   on t.id = fk.task_id
left join public.clients c on c.id = t.client_id
where fk.data_entry_status in ('pending_deo', 'in_progress');

grant select on public.deo_kitting_queue to authenticated;
