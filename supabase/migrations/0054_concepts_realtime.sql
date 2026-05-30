-- Add concepts table to supabase_realtime publication so changes
-- (new submissions, approvals, etc.) propagate to all connected clients.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'concepts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.concepts;
  END IF;
END $$;

ALTER TABLE public.concepts REPLICA IDENTITY FULL;
