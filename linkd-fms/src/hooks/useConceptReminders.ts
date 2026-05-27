import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { sendNotification } from "@/lib/notifications";
import { useAuth } from "@/hooks/useAuth";

const REMINDER_TITLE = "Concept Submission Reminder";

// Week 1 (Day 8):  need at least 1 concept
// Week 2 (Day 17): need at least 2 concepts
// Week 3 (Day 24): need at least 3 concepts
const CHECKPOINTS: { day: number; minRequired: number }[] = [
  { day: 8, minRequired: 1 },
  { day: 17, minRequired: 2 },
  { day: 24, minRequired: 3 },
];

export function useConceptReminders() {
  const { user, role } = useAuth();
  const hasRun = useRef(false);

  useEffect(() => {
    if (!user || role !== "designer" || hasRun.current) return;

    const today = new Date();
    const dayOfMonth = today.getDate();
    const checkpoint = CHECKPOINTS.find((c) => c.day === dayOfMonth);
    if (!checkpoint) return;

    hasRun.current = true;

    (async () => {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
        .toISOString();
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1)
        .toISOString();

      const { count, error: countErr } = await supabase
        .from("concepts")
        .select("id", { count: "exact", head: true })
        .eq("submitted_by", user.id)
        .gte("created_at", monthStart)
        .lt("created_at", monthEnd);

      if (countErr) {
        console.error("[useConceptReminders] count query failed:", countErr.message);
        return;
      }

      const submitted = count ?? 0;
      if (submitted >= checkpoint.minRequired) return;

      const todayStart = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate()
      ).toISOString();

      const { count: existingCount } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("title", REMINDER_TITLE)
        .gte("created_at", todayStart);

      if ((existingCount ?? 0) > 0) return;

      const remaining = checkpoint.minRequired - submitted;
      const message =
        submitted === 0
          ? `You haven't submitted any concepts this month yet. Submit at least ${checkpoint.minRequired} by now to stay on track.`
          : `You've submitted ${submitted} concept${submitted > 1 ? "s" : ""} this month but need at least ${checkpoint.minRequired} by now. Submit ${remaining} more to stay on track!`;

      void sendNotification(user.id, REMINDER_TITLE, message, "warning", "/concepts");
    })();
  }, [user, role]);
}
