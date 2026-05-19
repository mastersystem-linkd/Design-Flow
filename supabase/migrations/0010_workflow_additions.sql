-- ============================================================================
-- LinkD FMS — Workflow additions (samples + salvedge_records + task extras)
-- ============================================================================
-- Slot 0008 was used by 0008_design_coordinator_role; this migration follows
-- the existing chain at slot 0010. Wrapped in BEGIN/COMMIT for atomicity.
--
-- 3 new systems modeled after the existing Google-Sheets workflow:
--   PART A  Extends `tasks` with full-kitting + briefing-context columns
--   PART B  New `samples` table (daily sample records sent to customers)
--   PART C  New `salvedge_records` table (challan-based fabric distribution)
--   PART D  Auto-complete triggers + updated_at touchers
--   PART E  Indexes
--   PART F  RLS — admin full CRUD, designer read + write-own
--   PART G  Storage bucket `sample-files` (100 MB, images + videos)
-- ============================================================================

begin;

-- ============================================================================
-- PART A — Extend tasks with full-kitting + briefing-context columns
-- ============================================================================

alter table public.tasks
  add column if not exists mtr                          numeric,
  add column if not exists requires_full_kitting        boolean      not null default false,
  add column if not exists full_kitting_image_url       text,
  add column if not exists full_kitting_notes           text,
  add column if not exists full_kitting_submitted_at    timestamptz,
  add column if not exists full_kitting_submitted_by    uuid references auth.users(id) on delete set null,
  add column if not exists assigned_by                  text,
  add column if not exists started_late                 boolean      not null default false,
  add column if not exists concept_start_date           date;

-- ============================================================================
-- PART B — samples table
-- ============================================================================

create table if not exists public.samples (
  id                       uuid          primary key default gen_random_uuid(),
  created_at               timestamptz   not null default now(),
  updated_at               timestamptz   not null default now(),

  sr_no                    integer,
  uid                      text,                    -- sample UID code like "SM-042"
  party_name               text          not null,   -- stored as text, not FK to clients
  quality                  text,                    -- fabric quality, e.g. 'Georgette 60"'
  total_fabrics_received   numeric,
  requirement              text,
  assigned_by              text,
  sampling_done_by         text,
  printed_mtr              numeric       default 0,

  order_or_sample          text          default ''
                           check (order_or_sample in ('order', 'sample', '')),
  completion_timestamp     timestamptz,

  -- computed column — kept in sync by Postgres on every write
  pending_qty              numeric
                           generated always as
                             (coalesce(total_fabrics_received, 0) - coalesce(printed_mtr, 0))
                           stored,

  is_completed             boolean       not null default false,
  fusing_operator          text,
  neatly_prepared          boolean       not null default false,

  -- storage paths (sample-files bucket) — render via signed URL
  photo_url                text,
  video_url                text,
  signature_url            text,

  has_form                 boolean       not null default false,
  additional_comments      text,

  -- mirrors the same flag on tasks for samples that need full-kitting follow-up
  requires_full_kitting    boolean       not null default false,
  full_kitting_image_url   text,

  created_by               uuid          references auth.users(id) on delete set null
);

-- ============================================================================
-- PART C — salvedge_records table (challan-based fabric distribution)
-- ============================================================================

create table if not exists public.salvedge_records (
  id                    uuid           primary key default gen_random_uuid(),
  created_at            timestamptz    not null default now(),
  updated_at            timestamptz    not null default now(),

  designer_id           uuid           references public.profiles(id) on delete set null,
  challan_no            text           not null,
  party_name            text           not null,
  qty                   numeric        not null check (qty > 0),
  completed_qty         numeric        not null default 0 check (completed_qty >= 0),

  pending               numeric
                        generated always as (qty - completed_qty) stored,

  completion_timestamp  timestamptz,
  is_completed          boolean        not null default false,
  additional_comments   text,

  created_by            uuid           references auth.users(id) on delete set null
);

-- ============================================================================
-- PART D — Triggers
-- ============================================================================

-- D.1  updated_at touchers (reuse the touch_updated_at function from 0001)
create trigger samples_touch_updated_at
  before update on public.samples
  for each row execute procedure public.touch_updated_at();

create trigger salvedge_touch_updated_at
  before update on public.salvedge_records
  for each row execute procedure public.touch_updated_at();

-- D.2  samples_auto_complete: when is_completed flips to true, stamp the
--      completion_timestamp if it isn't already set.
create or replace function public.samples_auto_complete()
returns trigger language plpgsql as $$
begin
  if new.is_completed = true
     and (old.is_completed is distinct from new.is_completed)
     and new.completion_timestamp is null then
    new.completion_timestamp := now();
  end if;
  return new;
end;
$$;

create trigger samples_auto_complete_trg
  before update on public.samples
  for each row execute procedure public.samples_auto_complete();

-- D.3  salvedge_auto_complete: when completed_qty meets/exceeds qty, set
--      is_completed = true and stamp completion_timestamp (if not set).
create or replace function public.salvedge_auto_complete()
returns trigger language plpgsql as $$
begin
  if new.completed_qty >= new.qty then
    if new.is_completed is not true then
      new.is_completed := true;
    end if;
    if new.completion_timestamp is null then
      new.completion_timestamp := now();
    end if;
  end if;
  return new;
end;
$$;

create trigger salvedge_auto_complete_trg
  before update on public.salvedge_records
  for each row execute procedure public.salvedge_auto_complete();

-- ============================================================================
-- PART E — Indexes
-- ============================================================================

-- samples
create index if not exists samples_created_at_idx     on public.samples(created_at desc);
create index if not exists samples_party_name_idx     on public.samples(party_name);
create index if not exists samples_is_completed_idx   on public.samples(is_completed);
create index if not exists samples_created_by_idx     on public.samples(created_by);

-- salvedge_records
create index if not exists salvedge_created_at_idx    on public.salvedge_records(created_at desc);
create index if not exists salvedge_designer_id_idx   on public.salvedge_records(designer_id);
create index if not exists salvedge_party_name_idx    on public.salvedge_records(party_name);
create index if not exists salvedge_is_completed_idx  on public.salvedge_records(is_completed);

-- tasks: partial — only rows that actually need full kitting
create index if not exists tasks_requires_full_kitting_idx
  on public.tasks(requires_full_kitting)
  where requires_full_kitting = true;

-- ============================================================================
-- PART F — Row Level Security
-- ============================================================================

alter table public.samples           enable row level security;
alter table public.salvedge_records  enable row level security;

-- ---------------- samples ----------------
-- (using is_admin() strictly — design_coordinator does NOT get write access
-- here unless you widen these policies to is_admin_or_coordinator() later)
create policy "samples_admin_all"
  on public.samples for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "samples_designer_read"
  on public.samples for select
  using (auth.uid() is not null);

create policy "samples_designer_insert"
  on public.samples for insert
  with check (created_by = auth.uid());

create policy "samples_designer_update_own"
  on public.samples for update
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- ---------------- salvedge_records ----------------
create policy "salvedge_admin_all"
  on public.salvedge_records for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "salvedge_designer_read"
  on public.salvedge_records for select
  using (auth.uid() is not null);

create policy "salvedge_designer_insert"
  on public.salvedge_records for insert
  with check (designer_id = auth.uid() and created_by = auth.uid());

create policy "salvedge_designer_update_own"
  on public.salvedge_records for update
  using (designer_id = auth.uid())
  with check (designer_id = auth.uid());

-- ============================================================================
-- PART G — Storage: sample-files bucket
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sample-files',
  'sample-files',
  false,
  104857600,  -- 100 MB
  array[
    'image/jpeg',
    'image/png',
    'image/gif',
    'video/mp4',
    'video/quicktime'
  ]
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ----- Storage policies (same {user_id}/... convention as design-files) -----

drop policy if exists "sample_files_authed_read" on storage.objects;
create policy "sample_files_authed_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'sample-files');

drop policy if exists "sample_files_user_upload" on storage.objects;
create policy "sample_files_user_upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'sample-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "sample_files_user_update_own" on storage.objects;
create policy "sample_files_user_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'sample-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'sample-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "sample_files_admin_delete" on storage.objects;
create policy "sample_files_admin_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'sample-files'
    and public.is_admin()
  );

commit;
