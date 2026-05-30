-- Add attachment_url column to salvedge_records for file uploads.
ALTER TABLE salvedge_records
  ADD COLUMN IF NOT EXISTS attachment_url text;
