# Activating daily notifications

The notification engine itself was already built — it just needs to be
turned on. This is a one-time setup.

## What's already in place

- **Realtime fan-out** from the `notifications` table. New rows trigger
  a sound (synthesised, 880 Hz / 200 ms) and a tab-title flash for any
  user currently viewing the app.
- **Event-driven notifications** that fire from the client today:
  - Designer submits a concept → admins + coordinators are notified.
  - MD reviews a concept (approve / reject / revision) → submitter.
  - Designer re-submits after revision → admins.
  - Task assigned, status change, comment posted, kitting events.
- **Edge Function `daily-notifications`** that runs once per day at
  11:00 IST and emits (each scoped per user, deduped per day):
  1. `Overdue Task: <code>` — **one notification per overdue task**,
     sent to its assignee. Ten overdue tasks → ten alerts, not one
     summary; the user can mark each off individually. Dedup is by
     (user × task id × day) so the same task can't fire twice in
     one day no matter how many times the function runs.
  2. `Overdue Summary` — admins + coordinators, team-wide rollup so
     they see the total without scrolling.
  3. `Daily Review` — admins, count + age of pending concepts.
  4. `Concept Awaiting Review: <title>` — admins, per concept that has
     sat in MD review for ≥ 48 h. Repeats daily; severity escalates to
     `urgent` after 96 h.
  5. `Concept Target Reminder` — designer hasn't hit pace on day 8 / 16.
  6. `Concept Target — Critical` — designer hasn't hit pace by day 25.
  7. `Concept Overdue: <title>` — designer past `designer_planned_date`
     on an approved concept. Repeats daily until they mark it done.

## Two steps to turn it on

### Step 1 — Deploy the Edge Function

From the repo root:

```bash
npx supabase functions deploy daily-notifications \
  --project-ref jyfwyfpwbbgfpsntubfy
```

(If you've never deployed an Edge Function before, you'll need to run
`npx supabase login` first.)

### Step 2 — Schedule it with `pg_cron`

Two ways — pick one.

**Option A: apply migration `0033_schedule_daily_notifications.sql`**
(via `supabase db push` or by pasting into the SQL editor). You need to
edit the file first to replace `REPLACE_WITH_SERVICE_ROLE_KEY` with the
real service-role key from Supabase Dashboard → Settings → API.

**Option B: paste this into the SQL editor in Supabase Dashboard** —
slightly faster for a one-off and keeps the service-role key out of git:

```sql
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

-- Remove any previously-scheduled run so re-running is safe.
do $$ begin
  if exists (select 1 from cron.job where jobname = 'daily-notifications') then
    perform cron.unschedule('daily-notifications');
  end if;
end $$;

select cron.schedule(
  'daily-notifications',
  '30 5 * * *',   -- 05:30 UTC = 11:00 IST, every day
  $$
  select net.http_post(
    url     := 'https://jyfwyfpwbbgfpsntubfy.functions.supabase.co/daily-notifications',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <PASTE_SERVICE_ROLE_KEY_HERE>',
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);
```

## Verify it works

After both steps, fire a manual run to seed today's notifications and
confirm the wiring is right:

```bash
curl -X POST \
  https://jyfwyfpwbbgfpsntubfy.functions.supabase.co/daily-notifications \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
```

You should get back something like
`{"sent": 14, "skipped": 0, "date": "2026-05-26"}`.

Check the next scheduled runs in Supabase SQL editor:

```sql
select * from cron.job where jobname = 'daily-notifications';

select * from cron.job_run_details
where jobid = (
  select jobid from cron.job where jobname = 'daily-notifications'
)
order by start_time desc
limit 5;
```

## Time-zone

All thresholds (overdue cut-off, day-of-month gates) are computed in
**Asia/Kolkata (UTC + 05:30)** inside the function. The cron firing time
is 05:30 UTC = 11:00 IST. If you move offices to a different time zone,
update both the cron expression *and* the IST offset constant at the top
of `supabase/functions/daily-notifications/index.ts`.

## Dedup behaviour

Each notification kind is unique per (user × kind) per day, except the
per-concept ones (`Concept Overdue`, `Concept Awaiting Review`) which are
unique per (user × kind × concept id). Re-running the function manually
on the same day is safe — it will report `skipped: N` and add nothing.
