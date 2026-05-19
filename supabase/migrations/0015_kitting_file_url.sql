-- Add file_url to full_kitting_details for file/image attachments
begin;
alter table public.full_kitting_details
  add column if not exists file_url text;
commit;
