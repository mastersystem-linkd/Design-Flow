import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { sendNotification } from "@/lib/notifications";
import { useAuth } from "@/hooks/useAuth";

const MONTHLY_TARGET = 3;
const REMINDER_DAYS = [8, 18, 28];
const REMINDER_TITLE = "Concept Submission Reminder";

export function useConceptReminders() {
  const { user, role } = useAuth();
  const hasRun = useRef(false);

  useEffect(() => {
    if (!user || role !== "designer" || hasRun.current) return;

    const today = new Date();
    const dayOfMonth = today.getDate();
    if (!REMINDER_DAYS.includes(dayOfMonth)) return;

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
      if (submitted >= MONTHLY_TARGET) return;

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

      const remaining = MONTHLY_TARGET - submitted;
      const message =
        submitted === 0
          ? `You haven't submitted any concepts this month yet. Submit ${remaining} concepts to meet your monthly target of ${MONTHLY_TARGET}.`
          : `You've submitted ${submitted} of ${MONTHLY_TARGET} concepts this month. Submit ${remaining} more to meet your target!`;

      void sendNotification(user.id, REMINDER_TITLE, message, "warning", "/concepts");
    })();
  }, [user, role]);
}
