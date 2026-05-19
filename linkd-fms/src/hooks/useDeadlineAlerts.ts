import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { sendNotification, sendNotificationToRole } from "@/lib/notifications";

/**
 * Runs periodic checks for:
 *  1. Overdue tasks — tasks past their deadline that aren't done
 *  2. Concept submission pace — if a designer hasn't submitted enough
 *     concepts this month, send a warning
 *
 * Fires once on mount, then every 60 minutes.
 * Uses a localStorage key to avoid spamming the same alerts within a day.
 */

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const STORAGE_KEY = "linkd-deadline-alerts-last";
const MONTHLY_TARGET = 3;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function useDeadlineAlerts() {
  const { user, profile } = useAuth();
  const ranRef = useRef(false);

  useEffect(() => {
    if (!user || !profile) return;

    // Only run once per day per browser
    const last = localStorage.getItem(STORAGE_KEY);
    const today = todayKey();
    if (last === today && ranRef.current) return;

    async function runChecks() {
      if (!user || !profile) return;
      ranRef.current = true;
      localStorage.setItem(STORAGE_KEY, todayKey());

      // ── 1. Overdue tasks → notify assignees ──
      try {
        const todayStr = new Date().toISOString().slice(0, 10);
        const { data: overdue } = await supabase
          .from("tasks")
          .select("id, task_code, assigned_to, planned_deadline")
          .lt("planned_deadline", todayStr)
          .not("status", "eq", "done")
          .not("assigned_to", "is", null);

        if (overdue && overdue.length > 0) {
          // Group by assignee to avoid duplicate spam
          const byAssignee = new Map<string, string[]>();
          for (const t of overdue) {
            if (!t.assigned_to) continue;
            const list = byAssignee.get(t.assigned_to) ?? [];
            list.push(t.task_code);
            byAssignee.set(t.assigned_to, list);
          }

          for (const [assigneeId, codes] of byAssignee) {
            void sendNotification(
              assigneeId,
              "Overdue Tasks",
              `You have ${codes.length} overdue task${codes.length > 1 ? "s" : ""}: ${codes.slice(0, 3).join(", ")}${codes.length > 3 ? ` +${codes.length - 3} more` : ""}.`,
              "urgent",
              "/dashboard"
            );
          }
        }
      } catch (e) {
        console.warn("[useDeadlineAlerts] overdue check failed:", e);
      }

      // ── 2. Concept submission pace (designers only) ──
      if (profile.role === "designer") {
        try {
          const now = new Date();
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
          const dayOfMonth = now.getDate();
          const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
          const daysRemaining = lastDayOfMonth - dayOfMonth;

          const { count } = await supabase
            .from("concepts")
            .select("*", { count: "exact", head: true })
            .eq("submitted_by", user.id)
            .gte("created_at", monthStart);

          const submitted = count ?? 0;

          // Week 1 warning: 0 concepts in first 7 days
          if (dayOfMonth <= 7 && submitted === 0) {
            void sendNotification(
              user.id,
              "Concept Reminder",
              `You haven't submitted any concepts this month yet. Monthly target is ${MONTHLY_TARGET}.`,
              "warning",
              "/concepts"
            );
          }

          // Last week warning: less than target
          if (daysRemaining <= 7 && submitted < MONTHLY_TARGET) {
            void sendNotification(
              user.id,
              "Concept Deadline Approaching",
              `You've submitted ${submitted} of ${MONTHLY_TARGET} concepts this month. ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""} remaining.`,
              "urgent",
              "/concepts"
            );
          }
        } catch (e) {
          console.warn("[useDeadlineAlerts] concept pace check failed:", e);
        }
      }
    }

    void runChecks();
    const interval = setInterval(() => void runChecks(), CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [user, profile]);
}
