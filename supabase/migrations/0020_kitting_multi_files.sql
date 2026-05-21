-- ============================================================================
-- LinkD FMS — Multi-file uploads on full_kitting_details
-- ============================================================================
-- Before this migration the kitting form could carry at most one file
-- (`file_url`, a single storage path). The coordinator workflow needs to
-- upload several reference images at once (fabric swatches, packing
-- instructions, label artwork), so we add a `files` jsonb array holding all
-- storage paths.
--
-- Backwards compatibility:
--   - The first entry of `files[]` is mirrored into `file_url` by the app on
--     insert, so existing UI (rows, drawers, dashboards) that read file_url
--     keep working.
--   - The app's submit path has a fallback: if this column doesn't exist
--     yet (pre-0020 schema) it silently retries without `files` and still
--     succeeds.
-- ============================================================================

begin;

alter table public.full_kitting_details
  add column if not exists files jsonb not null default '[]'::jsonb;

-- Backfill — existing rows get a single-entry array built from their
-- file_url so the column is consistent across the table from day one.
update public.full_kitting_details
   set files = jsonb_build_array(file_url)
 where files = '[]'::jsonb
   and file_url is not null
   and file_url <> '';

commit;
