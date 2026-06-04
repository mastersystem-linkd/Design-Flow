import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { sendNotificationToRole } from "@/lib/notifications";
import { useAuth } from "@/hooks/useAuth";
import { isAdminOrCoordinator } from "@/lib/permissions";

const HOLD_THRESHOLD_DAYS = 4;
const ALERT_TITLE = "Concept held too long";

export function useHeldConceptAlerts() {
  const { user, role } = useAuth();
  const hasRun = useRef(false);

  useEffect(() => {
    if (!user || !isAdminOrCoordinator(role) || hasRun.current) return;
    hasRun.current = true;

    (async () => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - HOLD_THRESHOLD_DAYS);

      const { data: held, error } = await supabase
        .from("concepts")
        .select("id, title, work_held_at, designer:profiles!concepts_designer_id_fkey(full_name)")
        .eq("work_status", "on_hold")
        .lt("work_held_at", cutoff.toISOString());

      if (error || !held?.length) return;

      const todayStr = new Date().toISOString().slice(0, 10);

      for (const c of held) {
        const { count } = await supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("title", ALERT_TITLE)
          .ilike("message", `%${c.id.slice(0, 8)}%`)
          .gte("created_at", todayStr);

        if ((count ?? 0) > 0) continue;

        const daysHeld = Math.floor(
          (Date.now() - new Date(c.work_held_at!).getTime()) / 86400000
        );
        const designer = (c.designer as any)?.full_name ?? "A designer";
        void sendNotificationToRole(
          ["admin", "design_coordinator"],
          ALERT_TITLE,
          `"${c.title}" by ${designer} has been on hold for ${daysHeld} days [${c.id.slice(0, 8)}]`,
          "warning",
          "/concepts"
        );
      }
    })();
  }, [user, role]);
}
