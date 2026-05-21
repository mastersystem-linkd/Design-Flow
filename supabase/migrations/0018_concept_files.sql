-- ============================================================================
-- LinkD FMS — Concept attachments (multiple files per concept)
-- ============================================================================
-- Before this migration, concepts could only carry one file (stored as the
-- `image_url` path string). Designers asked for multi-file submissions, so
-- we add a `files` jsonb column holding an array of storage paths.
--
-- Backwards compatibility:
--   - The first entry of `files[]` is also written into `image_url` by the
--     app on insert, so existing detail-drawer previews keep working.
--   - The app's insert path has a fallback: if this column doesn't exist
--     yet (pre-0018 schema), it silently retries without `files` and still
--     succeeds.
-- ============================================================================

begin;

alter table public.concepts
  add column if not exists files jsonb not null default '[]'::jsonb;

-- Backfill: pre-existing concepts get a single-entry array built from their
-- image_url so the column is consistent for everything created before today.
update public.concepts
   set files = jsonb_build_array(image_url)
 where files = '[]'::jsonb
   and image_url is not null
   and image_url <> '';

commit;
