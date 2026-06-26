-- 0089_archive_entity_blobs.sql
-- ============================================================================
-- Recycle-bin a deleted entity's FULL set of uploaded files, not just the
-- `files` table rows.
-- ============================================================================
-- 0087 only binned the `design-files` blob behind each `files` row. But most
-- uploads aren't `files` rows — they're path columns on the entity:
--   tasks.full_kitting_image_url                (sample-files)
--   full_kitting_details.image_url/file_url/files[]   (sample-files)
--   samples.photo_url/video_url/signature_url/full_kitting_image_url (sample-files)
--   concepts.image_url/files[]                  (sample-files)
--   salvedge_records.attachment_url             (design-files)
--   sampling_logs.proof_url                     (proof-photos)
-- So deleting a task left its Full-Knitting image (and a sample's photos, a
-- concept's images, …) orphaned in the Files browser. Now the BEFORE DELETE
-- archive trigger bins those blobs too — in the SAME batch as the row — so
-- they vanish from Files and come back on restore. Blobs are only removed from
-- Storage on purge.
--
-- Idempotent. Apply by hand in the Supabase SQL editor.
-- ============================================================================

-- Bin one blob (dedup-guarded) — skips nulls, full URLs, and already-binned paths.
create or replace function public.fn_bin_one_blob(
  p_bucket text, p_path text, p_by uuid, p_batch bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_path is null or p_path = '' then
    return;
  end if;
  -- Only manage in-bucket paths; ignore full URLs (e.g. avatars store a URL).
  if p_path ~ '^https?://' then
    return;
  end if;
  -- Dedup on the indexed (table_name, record_id) — record_id IS the path.
  if exists (
    select 1 from public.deleted_records
    where table_name = '__storage__'
      and record_id = p_path
      and restored_at is null
      and data->>'bucket' = p_bucket
  ) then
    return;
  end if;
  insert into public.deleted_records (table_name, record_id, data, deleted_by, batch_id)
  values (
    '__storage__',
    p_path,
    jsonb_build_object(
      'bucket', p_bucket,
      'path',   p_path,
      'name',   regexp_replace(p_path, '^.*/', ''),
      'size',   0
    ),
    p_by,
    p_batch
  );
end;
$$;

-- Archive trigger — snapshot the row, then bin every blob it references.
create or replace function public.fn_archive_deleted_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_data  jsonb := to_jsonb(OLD);
  v_by    uuid;
  v_batch bigint := txid_current();
  v_el    text;
begin
  begin
    v_by := nullif(current_setting('app.deleted_by', true), '')::uuid;
  exception when others then
    v_by := null;
  end;
  v_by := coalesce(v_by, auth.uid());

  insert into public.deleted_records (table_name, record_id, data, deleted_by, batch_id)
  values (TG_TABLE_NAME, v_data->>'id', v_data, v_by, v_batch);

  -- Bin the blobs each table type owns (same batch ⇒ recovered together).
  if TG_TABLE_NAME = 'files' then
    perform public.fn_bin_one_blob('design-files', v_data->>'storage_url', v_by, v_batch);

  elsif TG_TABLE_NAME = 'tasks' then
    perform public.fn_bin_one_blob('sample-files', v_data->>'full_kitting_image_url', v_by, v_batch);

  elsif TG_TABLE_NAME = 'samples' then
    perform public.fn_bin_one_blob('sample-files', v_data->>'photo_url', v_by, v_batch);
    perform public.fn_bin_one_blob('sample-files', v_data->>'video_url', v_by, v_batch);
    perform public.fn_bin_one_blob('sample-files', v_data->>'signature_url', v_by, v_batch);
    perform public.fn_bin_one_blob('sample-files', v_data->>'full_kitting_image_url', v_by, v_batch);

  elsif TG_TABLE_NAME = 'concepts' then
    perform public.fn_bin_one_blob('sample-files', v_data->>'image_url', v_by, v_batch);
    for v_el in
      select jsonb_array_elements_text(coalesce(v_data->'files', '[]'::jsonb))
    loop
      perform public.fn_bin_one_blob('sample-files', v_el, v_by, v_batch);
    end loop;

  elsif TG_TABLE_NAME = 'full_kitting_details' then
    perform public.fn_bin_one_blob('sample-files', v_data->>'image_url', v_by, v_batch);
    perform public.fn_bin_one_blob('sample-files', v_data->>'file_url', v_by, v_batch);
    for v_el in
      select jsonb_array_elements_text(coalesce(v_data->'files', '[]'::jsonb))
    loop
      perform public.fn_bin_one_blob('sample-files', v_el, v_by, v_batch);
    end loop;

  elsif TG_TABLE_NAME = 'salvedge_records' then
    perform public.fn_bin_one_blob('design-files', v_data->>'attachment_url', v_by, v_batch);

  elsif TG_TABLE_NAME = 'sampling_logs' then
    perform public.fn_bin_one_blob('proof-photos', v_data->>'proof_url', v_by, v_batch);
  end if;

  return OLD;
end;
$$;

notify pgrst, 'reload schema';

-- Sanity: deleting a task with a Full-Knitting image should now create both the
-- task snapshot AND a '__storage__' row for that image in the same batch.
