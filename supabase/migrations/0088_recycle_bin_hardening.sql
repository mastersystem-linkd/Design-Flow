-- 0088_recycle_bin_hardening.sql
-- ============================================================================
-- Hardening for the Recycle Bin (0087), from an adversarial correctness review.
-- ============================================================================
-- Fixes:
--   (#5) A single storage blob could be binned twice in two different batches
--        (once via the Files browser, once when its task is later deleted).
--        Purging one batch would then delete a blob the other batch still
--        claims to hold → silent file loss. Fix: dedup at bin time — never
--        create a second ACTIVE __storage__ row for the same (bucket, path).
--   (#4/#7) "Clear all" ran one DELETE per table = one txid each = ~10 separate
--        restore points (the 0087 docs promised ONE). It also reset
--        task_counters, which is NOT archived — after a Clear-all + Restore the
--        counter sat at 0 while restored tasks held ORD-YYYY-0001…, so the next
--        new task collided on task_code and INSERT failed. Fix: a single-
--        transaction RPC (one batch_id) that does NOT touch task_counters.
--
-- Idempotent — safe to re-run. Apply by hand in the Supabase SQL editor.
-- ============================================================================

-- ── #5 — dedup-guarded archive trigger (replaces the 0087 version) ───────────
create or replace function public.fn_archive_deleted_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_data jsonb := to_jsonb(OLD);
  v_by   uuid;
  v_path text;
begin
  begin
    v_by := nullif(current_setting('app.deleted_by', true), '')::uuid;
  exception when others then
    v_by := null;
  end;
  v_by := coalesce(v_by, auth.uid());

  insert into public.deleted_records (table_name, record_id, data, deleted_by, batch_id)
  values (TG_TABLE_NAME, v_data->>'id', v_data, v_by, txid_current());

  -- For `files` rows, ALSO bin the underlying `design-files` blob in the same
  -- batch (recoverable with the row; hidden from the Files browser until purge).
  -- Dedup: don't create a second ACTIVE __storage__ row for a blob already in
  -- the bin (e.g. the file was deleted from the Files browser first), else
  -- purging one batch would destroy a blob another batch still references.
  v_path := v_data->>'storage_url';
  if TG_TABLE_NAME = 'files' and coalesce(v_path, '') <> '' then
    if not exists (
      select 1 from public.deleted_records
      where table_name = '__storage__'
        and restored_at is null
        and data->>'bucket' = 'design-files'
        and data->>'path' = v_path
    ) then
      insert into public.deleted_records (table_name, record_id, data, deleted_by, batch_id)
      values (
        '__storage__',
        v_path,
        jsonb_build_object(
          'bucket', 'design-files',
          'path',   v_path,
          'name',   v_data->>'file_name',
          'size',   coalesce((v_data->>'file_size')::numeric, 0)
        ),
        v_by,
        txid_current()
      );
    end if;
  end if;

  return OLD;
end;
$$;

-- ── #5 — dedup-guarded client file binning (replaces the 0087 version) ───────
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
    -- Skip if this blob is already in the bin (active) — avoids a duplicate
    -- __storage__ row that a later per-batch purge could orphan.
    if exists (
      select 1 from public.deleted_records
      where table_name = '__storage__'
        and restored_at is null
        and data->>'bucket' = f->>'bucket'
        and data->>'path' = f->>'path'
    ) then
      continue;
    end if;
    insert into public.deleted_records (table_name, record_id, data, deleted_by, batch_id)
    values ('__storage__', f->>'path', f, auth.uid(), b);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ── #4/#7 — single-transaction "Clear all" (one batch, no counter reset) ──────
-- Deletes every transactional table child-first inside ONE transaction, so the
-- archive trigger stamps a single batch_id ⇒ one restore point that the Recycle
-- Bin can restore parents-first. Does NOT reset task_counters (a monotonic
-- counter is harmless and avoids task_code collisions after a restore).
-- service_role-only (the Danger Zone endpoint gates super_admin in front of it).
create or replace function public.fn_clear_all_transactional()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tbls text[] := array[
    'task_logs', 'task_comments', 'files', 'sampling_logs', 'notifications',
    'full_kitting_details', 'task_assignments', 'samples', 'salvedge_records',
    'concepts', 'tasks'
  ];
  t     text;
  n     bigint;
  per   jsonb := '{}'::jsonb;
  total bigint := 0;
begin
  foreach t in array tbls loop
    if to_regclass('public.' || t) is null then
      continue;  -- table not in this deployment — skip, don't fail the wipe
    end if;
    execute format('delete from public.%I', t);
    get diagnostics n = row_count;
    per := per || jsonb_build_object(t, n);
    total := total + n;
  end loop;
  return jsonb_build_object('cleared', total, 'perTable', per);
end;
$$;

-- Lock it down: only the server's service-role may call this (it gates
-- super_admin in TS first). Never expose to authenticated/anon users.
revoke execute on function public.fn_clear_all_transactional() from public;
revoke execute on function public.fn_clear_all_transactional() from anon, authenticated;
grant execute on function public.fn_clear_all_transactional() to service_role;

notify pgrst, 'reload schema';
