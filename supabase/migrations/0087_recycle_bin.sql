-- 0087_recycle_bin.sql
-- ============================================================================
-- Recycle Bin — recoverable deletes for every transactional table.
-- ============================================================================
--
-- Why this exists:
--   Deleting data (Settings → Danger Zone bulk clears, or a single task/sample
--   deleted via its ⋮ menu) was a permanent hard DELETE — no recovery. A
--   super-admin who clicked "Clear all" or deleted the wrong batch lost it for
--   good.
--
-- How it works:
--   A BEFORE DELETE trigger on each transactional table snapshots the full row
--   (to_jsonb(OLD)) into `deleted_records` *before* it's removed. This captures
--   EVERY delete automatically — service-role (Danger Zone) AND client (RLS)
--   AND ON DELETE CASCADE children — with zero changes to app delete code.
--   Deletes still behave identically; the bin is purely additive.
--
--   All rows removed in one statement/transaction share a `batch_id`
--   (txid_current()), so a "Clear all" or a task + its cascaded children form
--   one restorable batch. Restore re-inserts the snapshots (see
--   api/admin-recycle-bin.ts). Items auto-purge 30 days after deletion.
--
-- Apply by hand in the Supabase SQL editor (prod ref not in MCP). The
-- pg_cron job at the bottom needs no secret — it calls a plain SQL function.
-- ============================================================================

-- ── 1. The bin table ────────────────────────────────────────────────────────
create table if not exists public.deleted_records (
  id          uuid        primary key default gen_random_uuid(),
  table_name  text        not null,                 -- source table, or '__storage__' for files
  record_id   text        not null,                 -- original PK (as text), or storage path
  data        jsonb       not null,                 -- full row snapshot / file metadata
  deleted_at  timestamptz not null default now(),
  deleted_by  uuid        references public.profiles(id) on delete set null,
  batch_id    bigint      not null,                 -- groups one delete op (incl. cascades)
  expires_at  timestamptz not null default (now() + interval '30 days'),
  restored_at timestamptz                            -- null = still in the bin
);

create index if not exists deleted_records_active_idx
  on public.deleted_records (deleted_at desc) where restored_at is null;
create index if not exists deleted_records_batch_idx
  on public.deleted_records (batch_id);
create index if not exists deleted_records_table_idx
  on public.deleted_records (table_name, record_id);
create index if not exists deleted_records_expiry_idx
  on public.deleted_records (expires_at);

-- ── 2. RLS — super-admin only (the UI reaches it via the service-role route) ──
alter table public.deleted_records enable row level security;

drop policy if exists deleted_records_super_admin_all on public.deleted_records;
create policy deleted_records_super_admin_all on public.deleted_records
  for all
  using (auth_role() = 'super_admin')
  with check (auth_role() = 'super_admin');

-- ── 3. Archive trigger — snapshot OLD before any delete ──────────────────────
-- SECURITY DEFINER so the insert succeeds regardless of the deleting user's
-- RLS (e.g. a designer deleting their own task can't write deleted_records
-- directly, but the trigger can).
create or replace function public.fn_archive_deleted_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_data jsonb := to_jsonb(OLD);
  v_by   uuid;
begin
  -- Prefer an explicit app.deleted_by GUC (set by privileged server flows),
  -- else the authenticated caller. Service-role deletes leave this null.
  begin
    v_by := nullif(current_setting('app.deleted_by', true), '')::uuid;
  exception when others then
    v_by := null;
  end;
  v_by := coalesce(v_by, auth.uid());

  insert into public.deleted_records (table_name, record_id, data, deleted_by, batch_id)
  values (TG_TABLE_NAME, v_data->>'id', v_data, v_by, txid_current());

  -- For `files` rows, ALSO bin the underlying Storage blob in the SAME batch,
  -- so deleting a task (which cascade-deletes its files) keeps the row AND the
  -- blob in one restore point. The blob is removed only on purge; until then
  -- the Files browser hides it (fn_binned_storage_paths). Task files live in
  -- the `design-files` bucket; files.storage_url is the in-bucket path.
  if TG_TABLE_NAME = 'files' and coalesce(v_data->>'storage_url', '') <> '' then
    insert into public.deleted_records (table_name, record_id, data, deleted_by, batch_id)
    values (
      '__storage__',
      v_data->>'storage_url',
      jsonb_build_object(
        'bucket', 'design-files',
        'path',   v_data->>'storage_url',
        'name',   v_data->>'file_name',
        'size',   coalesce((v_data->>'file_size')::numeric, 0)
      ),
      v_by,
      txid_current()
    );
  end if;

  return OLD;
end;
$$;

-- ── 4. Attach the trigger to every transactional table ───────────────────────
-- NOT profiles / clients / lookup tables / task_counters — those are protected
-- or never user-deleted. Every table below has a uuid `id` PK.
do $$
declare
  t text;
  tables text[] := array[
    'tasks', 'samples', 'concepts', 'salvedge_records', 'task_comments',
    'notifications', 'task_assignments', 'full_kitting_details', 'files',
    'task_logs', 'sampling_logs', 'coordinator_tasks'
  ];
begin
  foreach t in array tables loop
    -- Skip tables that don't exist in this deployment (schema can drift).
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('drop trigger if exists %I on public.%I',
                   'trg_archive_delete_' || t, t);
    execute format(
      'create trigger %I before delete on public.%I '
      || 'for each row execute function public.fn_archive_deleted_row()',
      'trg_archive_delete_' || t, t);
  end loop;
end $$;

-- ── 5. Auto-purge expired DATA snapshots (pure SQL; storage blobs are purged
--    opportunistically by the serverless route when the bin is viewed). ──
create or replace function public.fn_purge_expired_recycle_bin()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  -- '__storage__' rows are left for the serverless route to remove the blob
  -- first; deleting the row here would orphan the file in Storage.
  delete from public.deleted_records
   where expires_at < now()
     and table_name <> '__storage__';
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ── 6. Schedule the daily purge (pg_cron — plain SQL, no secret needed) ───────
create extension if not exists pg_cron with schema extensions;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'purge-recycle-bin') then
    perform cron.unschedule('purge-recycle-bin');
  end if;
end $$;

select cron.schedule(
  'purge-recycle-bin',
  '0 3 * * *',                       -- 03:00 UTC daily
  $cmd$ select public.fn_purge_expired_recycle_bin(); $cmd$
);

-- ── 7. Storage-file binning RPCs ─────────────────────────────────────────────
-- Storage blobs can't be archived by a row trigger, so the client "trashes" a
-- file by recording it here (the blob is NOT removed until purge). These are
-- SECURITY DEFINER so any authenticated deleter can bin a file even though
-- direct writes to deleted_records are super-admin only.

-- Record N files as deleted, grouped under one batch (no blob removal).
create or replace function public.fn_bin_storage_files(p_files jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  f jsonb;
  n integer := 0;
  b bigint := txid_current();
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  for f in select * from jsonb_array_elements(coalesce(p_files, '[]'::jsonb))
  loop
    insert into public.deleted_records (table_name, record_id, data, deleted_by, batch_id)
    values ('__storage__', f->>'path', f, auth.uid(), b);
    n := n + 1;
  end loop;
  return n;
end;
$$;
grant execute on function public.fn_bin_storage_files(jsonb) to authenticated;

-- The (bucket, path) of every file currently in the bin — so the Files browser
-- can hide trashed files for any viewer (exposes only paths, not row data).
create or replace function public.fn_binned_storage_paths()
returns table(bucket text, path text)
language sql
security definer
set search_path = public
as $$
  select data->>'bucket', data->>'path'
  from public.deleted_records
  where table_name = '__storage__' and restored_at is null;
$$;
grant execute on function public.fn_binned_storage_paths() to authenticated;

-- ── 8. Reload PostgREST schema cache so the new table is queryable at once ────
notify pgrst, 'reload schema';

-- Sanity checks (run in SQL editor after applying):
--   select count(*) from public.deleted_records;
--   select tgname, tgrelid::regclass from pg_trigger where tgname like 'trg_archive_delete_%';
--   select * from cron.job where jobname = 'purge-recycle-bin';
