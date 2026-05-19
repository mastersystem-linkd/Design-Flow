-- ============================================================================
-- Remove MIME type restrictions from all storage buckets.
-- All file types up to 100 MB are now accepted everywhere.
-- ============================================================================

begin;

-- sample-files: remove mime restriction + ensure 100 MB limit
update storage.buckets
set allowed_mime_types = null,
    file_size_limit = 104857600
where id = 'sample-files';

-- design-files: remove mime restriction + increase to 100 MB
update storage.buckets
set allowed_mime_types = null,
    file_size_limit = 104857600
where id = 'design-files';

-- proof-photos: remove mime restriction + increase to 100 MB
update storage.buckets
set allowed_mime_types = null,
    file_size_limit = 104857600
where id = 'proof-photos';

commit;
