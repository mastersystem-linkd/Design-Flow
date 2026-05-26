// ============================================================================
// daily-notifications — Supabase Edge Function (Deno runtime)
// ============================================================================
//
// Why this exists: the old in-browser polling system (`useDeadlineAlerts`)
// duplicated every "overdue tasks" notification on every page refresh, every
// hour, in every open tab. We moved deadline-style reminders OUT of the
// client and into a single server-scheduled job that runs once per day in
// IST.
//
// Performance note: a previous version did one COUNT-with-LIKE query per
// (user × kind) for dedup, which timed out at 150s once the notifications
// table grew. This version fetches *all of today's notifications once* and
// does dedup in memory (O(1) lookups), then batches every insert into a
// single round-trip. Same correctness guarantee, ~10x fewer queries.
//
// Schedule: 5:30 UTC = 11:00 IST. Configure via pg_cron (see deploy notes
// at the bottom of this file).
//
// Auth: the platform automatically injects SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY as env vars in every Edge Function. We use the
// service-role key to bypass RLS so the function can insert notifications
// on behalf of any user.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// Title "kinds" — short, lowercase, no whitespace. Each one corresponds to
// exactly one daily notification per user. Used both as the dedup key prefix
// and as a stable identifier inside the inserted title (which is human-readable).
type Kind =
  | "daily_review"
  | "overdue_summary"
  | "overdue_task"            // one per task — replaces the rolled-up "overdue_tasks"
  | "concept_target"
  | "concept_overdue"
  | "concept_stale_review";

interface PendingInsert {
  user_id: string;
  title: string;
  message: string;
  type: "info" | "warning" | "urgent" | "success";
  link: string;
  /** In-memory dedup key — `${user_id}|${kind}` (or with concept id appended). */
  dedupKey: string;
}

// ----------------------------------------------------------------------------
// Main handler
// ----------------------------------------------------------------------------

export default async function handler(_req: Request): Promise<Response> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // IST-anchored "now" for day-of-month / month boundary checks.
  const now = new Date();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffsetMs);
  const dayOfMonth = istNow.getUTCDate();
  const currentMonth = istNow.getUTCMonth();
  const currentYear = istNow.getUTCFullYear();
  const todayISO = istNow.toISOString().split("T")[0];

  const monthStart = new Date(Date.UTC(currentYear, currentMonth, 1));
  const monthEnd = new Date(
    Date.UTC(currentYear, currentMonth + 1, 0, 23, 59, 59)
  );

  // Today's IST window in absolute UTC.
  const dayStart = `${todayISO}T00:00:00+05:30`;
  const dayEnd = `${todayISO}T23:59:59+05:30`;

  // ──────────────────────────────────────────────────────────────────
  // Single fetch of today's notifications across ALL users. This is the
  // foundation of the in-memory dedup — we never query again to check
  // whether a row exists.
  // ──────────────────────────────────────────────────────────────────
  const { data: todaysNotifications, error: notifFetchErr } = await supabase
    .from("notifications")
    .select("user_id, title")
    .gte("created_at", dayStart)
    .lt("created_at", dayEnd);

  if (notifFetchErr) {
    return new Response(
      JSON.stringify({ error: notifFetchErr.message, stage: "fetch_today" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Build dedup Set: `${user_id}|${kind}` — derived from the row's title.
  // The keys we INSERT include the concept/task id (we have it in code),
  // but the rows we READ BACK only have the title. We use stable Maps
  // from title → id so title-based dedup catches re-runs within the
  // same day. Single fetch each covers every concept / task that could
  // appear in the per-id loops below.
  const sentKeys = new Set<string>();
  const conceptIdByStaleTitle = new Map<string, string>();
  const conceptIdByOverdueTitle = new Map<string, string>();
  const taskIdByOverdueTitle = new Map<string, string>();

  const [{ data: allRelevantConcepts }, { data: allRelevantTasks }] =
    await Promise.all([
      supabase
        .from("concepts")
        .select("id, title, md_status, designer_actual_date")
        .or("md_status.eq.pending,md_status.eq.approved"),
      supabase
        .from("tasks")
        .select("id, task_code")
        .not("status", "eq", "done"),
    ]);

  for (const c of allRelevantConcepts ?? []) {
    const t = c.title || "Untitled";
    conceptIdByStaleTitle.set(`Concept Awaiting Review: ${t}`, c.id);
    conceptIdByOverdueTitle.set(`Concept Overdue: ${t}`, c.id);
  }
  for (const t of allRelevantTasks ?? []) {
    taskIdByOverdueTitle.set(`Overdue Task: ${t.task_code}`, t.id);
  }

  for (const n of todaysNotifications ?? []) {
    const k = kindFromTitle(n.title);
    if (k && k !== "overdue_task") sentKeys.add(`${n.user_id}|${k}`);
    // Per-task overdue rows — dedup by (user × task id × day).
    if (n.title.startsWith("Overdue Task: ")) {
      const tid = taskIdByOverdueTitle.get(n.title);
      if (tid) sentKeys.add(`${n.user_id}|overdue_task|${tid}`);
    }
    // Per-concept rows — dedup by (user × kind × concept id × day).
    if (n.title.startsWith("Concept Overdue: ")) {
      const cid = conceptIdByOverdueTitle.get(n.title);
      if (cid) sentKeys.add(`${n.user_id}|concept_overdue|${cid}`);
      // Legacy title-suffixed key — kept so older rows that pre-date the
      // id-based scheme still dedup correctly.
      sentKeys.add(`${n.user_id}|concept_overdue|${n.title}`);
    }
    if (n.title.startsWith("Concept Awaiting Review: ")) {
      const cid = conceptIdByStaleTitle.get(n.title);
      if (cid) sentKeys.add(`${n.user_id}|concept_stale_review|${cid}`);
    }
  }

  // Profile fetch — single query.
  const { data: allProfiles, error: profErr } = await supabase
    .from("profiles")
    .select("id, full_name, role");
  if (profErr) {
    return new Response(
      JSON.stringify({ error: profErr.message, stage: "fetch_profiles" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const admins =
    allProfiles?.filter(
      (p) => p.role === "admin" || p.role === "design_coordinator"
    ) ?? [];
  const designers = allProfiles?.filter((p) => p.role === "designer") ?? [];

  // All inserts go here; we flush as one batch at the end.
  const toInsert: PendingInsert[] = [];
  let skippedCount = 0;

  // Helper: queue an insert iff its dedup key isn't already in the set.
  function queue(row: PendingInsert) {
    if (sentKeys.has(row.dedupKey)) {
      skippedCount++;
      return;
    }
    sentKeys.add(row.dedupKey); // prevent same-run duplicates too
    toInsert.push(row);
  }

  // ══════════════════════════════════════════════════════════════════
  // ADMIN + COORDINATOR · Pending concept reviews
  // ══════════════════════════════════════════════════════════════════
  const { count: pendingConceptCount } = await supabase
    .from("concepts")
    .select("*", { count: "exact", head: true })
    .eq("md_status", "pending");

  if (pendingConceptCount && pendingConceptCount > 0) {
    const { data: oldestPending } = await supabase
      .from("concepts")
      .select("created_at")
      .eq("md_status", "pending")
      .order("created_at", { ascending: true })
      .limit(1);

    const oldestDays = oldestPending?.[0]
      ? Math.floor(
          (now.getTime() - new Date(oldestPending[0].created_at).getTime()) /
            86_400_000
        )
      : 0;

    for (const admin of admins) {
      queue({
        user_id: admin.id,
        title: "Daily Review",
        message: `${pendingConceptCount} concept${
          pendingConceptCount > 1 ? "s" : ""
        } awaiting your approval (oldest: ${oldestDays} day${
          oldestDays !== 1 ? "s" : ""
        })`,
        type: pendingConceptCount > 3 ? "urgent" : "warning",
        link: "/concepts",
        dedupKey: `${admin.id}|daily_review`,
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // ADMIN + COORDINATOR · Per-concept reminder when an MD review has
  // sat untouched for more than 48 hours. The "Daily Review" tile above
  // gives a roll-up — this loop gives a named, clickable nudge per
  // concept so admins can't lose individual cases in the count.
  //
  // Repeats daily until the concept is approved/rejected/revised
  // (dedup key includes the concept id + a daily timestamp prefix).
  // ══════════════════════════════════════════════════════════════════
  const cutoff48h = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
  const { data: staleReviews } = await supabase
    .from("concepts")
    .select("id, title, created_at, submitted_by")
    .eq("md_status", "pending")
    .lt("created_at", cutoff48h)
    .order("created_at", { ascending: true });

  if (staleReviews && staleReviews.length > 0) {
    // Batch-fetch submitter names so the message reads "Krupesh's
    // concept …" instead of just the title.
    const submitterIds = Array.from(
      new Set(staleReviews.map((c) => c.submitted_by).filter(Boolean))
    );
    const submitterName = new Map<string, string>();
    if (submitterIds.length > 0) {
      const { data: subs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", submitterIds);
      for (const s of subs ?? []) submitterName.set(s.id, s.full_name);
    }

    for (const concept of staleReviews) {
      const hoursOld = Math.floor(
        (now.getTime() - new Date(concept.created_at).getTime()) / 3_600_000
      );
      const conceptTitle = concept.title || "Untitled";
      const designer = concept.submitted_by
        ? submitterName.get(concept.submitted_by) ?? "a designer"
        : "a designer";
      const titlePrefix = `Concept Awaiting Review: ${conceptTitle}`;

      for (const admin of admins) {
        queue({
          user_id: admin.id,
          title: titlePrefix,
          message: `${designer}'s concept "${conceptTitle}" has been waiting ${hoursOld}h for your review.`,
          type: hoursOld >= 96 ? "urgent" : "warning",
          link: "/concepts",
          dedupKey: `${admin.id}|concept_stale_review|${concept.id}`,
        });
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // PER OVERDUE TASK · One notification per task per day, sent to the
  // assignee (designer or design coordinator — whoever holds it).
  //
  // This intentionally replaces the previous "rolled-up summary per
  // designer" behaviour, which silently hid which tasks were overdue
  // and felt repetitive when the same summary line appeared on screen
  // every day. With one notification per task, the user can mark
  // individual ones off as they tackle them, and the dedup key keys
  // on the task id so the same task never fires twice in one day.
  // ══════════════════════════════════════════════════════════════════
  const { data: overdueTasks } = await supabase
    .from("tasks")
    .select("id, task_code, concept, assigned_to, planned_deadline")
    .not("status", "eq", "done")
    .not("planned_deadline", "is", null)
    .lt("planned_deadline", todayISO);

  if (overdueTasks && overdueTasks.length > 0) {
    for (const task of overdueTasks) {
      if (!task.assigned_to) continue; // unassigned — no one to notify
      const daysLate = Math.floor(
        (now.getTime() - new Date(task.planned_deadline!).getTime()) /
          86_400_000
      );
      const conceptHint = task.concept ? ` (${task.concept})` : "";
      queue({
        user_id: task.assigned_to,
        title: `Overdue Task: ${task.task_code}`,
        message: `Task ${task.task_code}${conceptHint} is ${daysLate} day${
          daysLate !== 1 ? "s" : ""
        } past its planned deadline.`,
        type: "urgent",
        link: "/dashboard",
        dedupKey: `${task.assigned_to}|overdue_task|${task.id}`,
      });
    }

    // Admins + coordinators still get a single daily roll-up so they
    // can see team-wide load without scrolling through every task.
    const uniqueAssignees = new Set(
      overdueTasks.map((t) => t.assigned_to).filter(Boolean)
    );
    for (const admin of admins) {
      queue({
        user_id: admin.id,
        title: "Overdue Summary",
        message: `${overdueTasks.length} task${
          overdueTasks.length > 1 ? "s" : ""
        } overdue across ${uniqueAssignees.size} assignee${
          uniqueAssignees.size !== 1 ? "s" : ""
        }`,
        type: "urgent",
        link: "/dashboard",
        dedupKey: `${admin.id}|overdue_summary`,
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // EACH DESIGNER · Monthly concept target (day 8 / 16 / 25) + overdue
  // concept completions
  //
  // The monthly concept count is one query per designer (so far the only
  // unavoidable per-designer query). The overdue-concepts pull is one query
  // per designer too, but we fan-out in parallel via Promise.all to keep
  // total wall-clock manageable even for 20+ designers.
  // ══════════════════════════════════════════════════════════════════
  await Promise.all(
    designers.map(async (designer) => {
      const [conceptCountRes, overdueConceptsRes] = await Promise.all([
        supabase
          .from("concepts")
          .select("*", { count: "exact", head: true })
          .or(`submitted_by.eq.${designer.id},designer_id.eq.${designer.id}`)
          .gte("created_at", monthStart.toISOString())
          .lte("created_at", monthEnd.toISOString()),
        supabase
          .from("concepts")
          .select("id, title, designer_planned_date")
          .or(`submitted_by.eq.${designer.id},designer_id.eq.${designer.id}`)
          .eq("md_status", "approved")
          .is("designer_actual_date", null)
          .not("designer_planned_date", "is", null)
          .lt("designer_planned_date", todayISO),
      ]);

      const submitted = conceptCountRes.count ?? 0;

      // Day 8 — zero → gentle nudge.
      if (dayOfMonth === 8 && submitted < 1) {
        queue({
          user_id: designer.id,
          title: "Concept Target Reminder",
          message:
            "You haven't submitted any concept this month. Target: 3 concepts. Start this week!",
          type: "warning",
          link: "/concepts",
          dedupKey: `${designer.id}|concept_target`,
        });
      }
      // Day 16 — below pace.
      if (dayOfMonth === 16 && submitted < 2) {
        queue({
          user_id: designer.id,
          title: "Concept Target Reminder",
          message: `You have ${submitted}/3 concepts this month. Submit ${
            2 - submitted
          } more to stay on track.`,
          type: "warning",
          link: "/concepts",
          dedupKey: `${designer.id}|concept_target`,
        });
      }
      // Day 25 — urgent.
      if (dayOfMonth === 25 && submitted < 3) {
        queue({
          user_id: designer.id,
          title: "Concept Target — Critical",
          message: `Only 5 days left! You have ${submitted}/3 concepts. Submit ${
            3 - submitted
          } more before month end.`,
          type: "urgent",
          link: "/concepts",
          dedupKey: `${designer.id}|concept_target`,
        });
      }

      const overdueConcepts = overdueConceptsRes.data ?? [];
      for (const concept of overdueConcepts) {
        const conceptTitle = concept.title || "Untitled";
        const title = `Concept Overdue: ${conceptTitle}`;
        const daysLate = Math.floor(
          (now.getTime() -
            new Date(concept.designer_planned_date!).getTime()) /
            86_400_000
        );
        queue({
          user_id: designer.id,
          title,
          message: `Your concept "${conceptTitle}" is ${daysLate} day${
            daysLate !== 1 ? "s" : ""
          } past the completion deadline.`,
          type: "urgent",
          link: "/concepts",
          dedupKey: `${designer.id}|concept_overdue|${concept.id}`,
        });
      }
    })
  );

  // ──────────────────────────────────────────────────────────────────
  // Single batch insert. Strips the dedupKey before sending — the DB
  // doesn't care about it.
  // ──────────────────────────────────────────────────────────────────
  let insertedCount = 0;
  if (toInsert.length > 0) {
    const rows = toInsert.map(({ dedupKey: _ignored, ...row }) => row);
    const { error: insertErr } = await supabase
      .from("notifications")
      .insert(rows);
    if (insertErr) {
      return new Response(
        JSON.stringify({
          error: insertErr.message,
          stage: "batch_insert",
          attempted: rows.length,
          skipped: skippedCount,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    insertedCount = rows.length;
  }

  return new Response(
    JSON.stringify({
      sent: insertedCount,
      skipped: skippedCount,
      date: todayISO,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}

// ----------------------------------------------------------------------------
// Title → Kind classifier (for in-memory dedup)
//
// We classify by string prefix because the title is the only signal we
// fetch in the bulk pull. Keep this in sync with the titles emitted above.
// ----------------------------------------------------------------------------

function kindFromTitle(title: string): Kind | null {
  if (title === "Daily Review") return "daily_review";
  if (title === "Overdue Summary") return "overdue_summary";
  if (title.startsWith("Overdue Task: ")) return "overdue_task";
  if (
    title === "Concept Target Reminder" ||
    title === "Concept Target — Critical"
  )
    return "concept_target";
  if (title.startsWith("Concept Overdue: ")) return "concept_overdue";
  if (title.startsWith("Concept Awaiting Review: ")) return "concept_stale_review";
  return null;
}

// ============================================================================
// Deployment notes
// ============================================================================
//
//   # Deploy this function
//   npx supabase functions deploy daily-notifications \
//     --project-ref jyfwyfpwbbgfpsntubfy
//
//   # Cron schedule (Supabase Dashboard → Database → Extensions → enable
//   # pg_cron + pg_net, then in SQL Editor):
//
//   SELECT cron.schedule(
//     'daily-notifications',
//     '30 5 * * *',   -- 5:30 UTC = 11:00 IST
//     $$
//     SELECT net.http_post(
//       url := 'https://jyfwyfpwbbgfpsntubfy.functions.supabase.co/daily-notifications',
//       headers := '{"Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
//     )
//     $$
//   );
//
//   # Manual test:
//   curl -X POST https://jyfwyfpwbbgfpsntubfy.functions.supabase.co/daily-notifications \
//     -H "Authorization: Bearer YOUR_ANON_KEY"
//
// ============================================================================
