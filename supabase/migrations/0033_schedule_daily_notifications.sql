-- 0033_schedule_daily_notifications.sql
-- Activates the daily-notifications Edge Function via pg_cron.
--
-- This is the missing piece — the function itself has been deployed for a
-- while but nothing was ever scheduled to call it. As a result the
-- "Overdue Tasks", "Concept Target Reminder", and "Concept Awaiting
-- Review" notifications never fired.
--
-- After this migration runs, the function fires once per day at 11:00 IST
-- (= 05:30 UTC). It self-deduplicates per (user × kind × concept id) so
-- re-runs in the same calendar day are safe.
--
-- ─── BEFORE running this migration ────────────────────────────────────
-- 1. Deploy the function:
--    npx supabase functions deploy daily-notifications --project-ref jyfwyfpwbbgfpsntubfy
--
-- 2. Replace the placeholder service-role key below with the value from:
--    Supabase Dashboard → Project Settings → API → service_role key
--    (we use the service-role key — NOT anon — so the cron call can
--    insert notifications on behalf of any user without tripping RLS.)
-- ──────────────────────────────────────────────────────────────────────

-- Prerequisites: pg_cron + pg_net extensions live in the `extensions`
-- schema on Supabase. Enabling here is idempotent.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Drop any previously-scheduled run with the same name so the file is
-- idempotent (re-running the migration won't double-schedule).
do $$ begin
  if exists (select 1 from cron.job where jobname = 'daily-notifications') then
    perform cron.unschedule('daily-notifications');
  end if;
end $$;

select
  cron.schedule(
    'daily-notifications',
    '30 5 * * *',   -- 05:30 UTC = 11:00 IST, every day
    $cmd$
      select net.http_post(
        url     := 'https://jyfwyfpwbbgfpsntubfy.functions.supabase.co/daily-notifications',
        headers := jsonb_build_object(
          'Authorization', 'Bearer REPLACE_WITH_SERVICE_ROLE_KEY',
          'Content-Type',  'application/json'
        ),
        body    := '{}'::jsonb
      );
    $cmd$
  );

-- Sanity check: confirm the job was registered.
-- After applying, you can verify in SQL Editor:
--   select * from cron.job where jobname = 'daily-notifications';
--   select * from cron.job_run_details
--     where jobid = (select jobid from cron.job where jobname = 'daily-notifications')
--     order by start_time desc limit 5;
