import { useEffect, useState } from "react";
import {
  Users,
  Database,
  GitBranch,
  Code2,
  Info,
  Monitor,
  Globe,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useProfiles } from "@/hooks/useProfiles";
import { useClients } from "@/hooks/useClients";
import { useTheme } from "@/hooks/useTheme";
import {
  Card,
  CardContent,
  Skeleton,
} from "@/components/ui";

// ============================================================================
// AppInfoTab — system + environment overview
// ============================================================================
//
// Read-only summary page. Useful for the admin to confirm "what's running"
// at a glance without leaving the app, and to drop into a support ticket
// (Supabase URL is masked so it can be copy/pasted from a screenshot
// without leaking the full ref).

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ??
  "https://jyfwyfpwbbgfpsntubfy.supabase.co";

const LATEST_MIGRATION = "0019"; // bump this when migrations advance

interface RowCounts {
  tasks: number;
  concepts: number;
  samples: number;
  loading: boolean;
}

export function AppInfoTab() {
  const { profiles, isLoading: profilesLoading } = useProfiles();
  const { totalCount: clientCount } = useClients();
  const { theme, resolvedTheme } = useTheme();

  // Three head-count queries in parallel — much cheaper than fetching rows.
  const [counts, setCounts] = useState<RowCounts>({
    tasks: 0,
    concepts: 0,
    samples: 0,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      supabase.from("tasks").select("*", { count: "exact", head: true }),
      supabase.from("concepts").select("*", { count: "exact", head: true }),
      supabase.from("samples").select("*", { count: "exact", head: true }),
    ]).then(([t, c, s]) => {
      if (cancelled) return;
      setCounts({
        tasks: t.count ?? 0,
        concepts: c.count ?? 0,
        samples: s.count ?? 0,
        loading: false,
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Group profiles by role for the Users tile breakdown.
  const userBreakdown = (() => {
    const out = { admin: 0, design_coordinator: 0, designer: 0 };
    for (const p of profiles ?? []) {
      if (p.role in out) out[p.role as keyof typeof out]++;
    }
    return out;
  })();

  // Environment fingerprint — collected once on mount. Window dimensions
  // could update on resize but that's noisy to subscribe to; the snapshot
  // is good enough for support.
  const env = (() => {
    if (typeof window === "undefined") {
      return {
        screen: "—",
        userAgent: "—",
        timezone: "—",
      };
    }
    return {
      screen: `${window.innerWidth} × ${window.innerHeight}`,
      userAgent: navigator.userAgent.slice(0, 80),
      timezone:
        Intl.DateTimeFormat().resolvedOptions().timeZone ?? "—",
    };
  })();

  return (
    <div className="space-y-5">
      {/* Header */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-primary" />
            <h3 className="text-base font-semibold text-foreground">App Info</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Build, database, and environment snapshot. Useful for support
            tickets and confirming what's deployed.
          </p>
        </CardContent>
      </Card>

      {/* Stats grid — 4 cards in a 2×2 (desktop) / 1-col (mobile). */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <InfoTile
          icon={<Users className="h-5 w-5 text-primary" />}
          tone="primary"
          label="Users"
          value={
            profilesLoading
              ? "—"
              : (profiles?.length ?? 0).toLocaleString()
          }
          sub={
            <span>
              {userBreakdown.admin} admins · {userBreakdown.design_coordinator}{" "}
              coordinators · {userBreakdown.designer} designers
            </span>
          }
        />
        <InfoTile
          icon={<Database className="h-5 w-5 text-success" />}
          tone="success"
          label="Total records"
          value={
            counts.loading
              ? "—"
              : (counts.tasks + counts.concepts + counts.samples + clientCount).toLocaleString()
          }
          sub={
            counts.loading ? (
              <Skeleton className="h-3 w-32" />
            ) : (
              <span>
                Tasks: {counts.tasks.toLocaleString()} · Concepts:{" "}
                {counts.concepts.toLocaleString()} · Samples:{" "}
                {counts.samples.toLocaleString()} · Clients:{" "}
                {clientCount.toLocaleString()}
              </span>
            )
          }
        />
        <InfoTile
          icon={<GitBranch className="h-5 w-5 text-warning" />}
          tone="warning"
          label="Last migration"
          value={`Migration ${LATEST_MIGRATION}`}
          sub={<span>Database version: PostgreSQL 15</span>}
        />
        <InfoTile
          icon={<Code2 className="h-5 w-5 text-primary" />}
          tone="primary"
          label="App version"
          value="Design Flow v1.0.0"
          sub={
            <span>
              Vite 5 · React 18 · TypeScript · Tailwind ·{" "}
              <span className="font-mono">jyfwyfpwbbgfpsntubfy</span>
            </span>
          }
        />
      </div>

      {/* Environment key/value list — debug stuff. */}
      <Card>
        <CardContent className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <Monitor className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-semibold text-foreground">Environment</h4>
          </div>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <KvRow
              label="Supabase URL"
              value={maskUrl(SUPABASE_URL)}
              icon={<Globe className="h-3.5 w-3.5" />}
            />
            <KvRow
              label="Theme"
              value={`${theme} (resolved: ${resolvedTheme})`}
            />
            <KvRow label="Timezone" value={env.timezone} />
            <KvRow label="Screen" value={env.screen} />
            <KvRow
              label="Browser"
              value={env.userAgent}
              className="sm:col-span-2"
            />
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

// ----------------------------------------------------------------------------
// InfoTile — icon + label + big value + sub line
// ----------------------------------------------------------------------------

function InfoTile({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: React.ReactNode;
  tone: "primary" | "success" | "warning";
}) {
  const tintBg: Record<typeof tone, string> = {
    primary: "bg-primary/10",
    success: "bg-success/10",
    warning: "bg-warning/10",
  };
  return (
    <Card className="border border-border">
      <CardContent className="flex gap-3 p-4">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tintBg[tone]}`}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="mt-0.5 text-xl font-bold leading-tight tabular-nums text-foreground">
            {value}
          </p>
          <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// ----------------------------------------------------------------------------
// KvRow — uppercase label + monospace value
// ----------------------------------------------------------------------------

function KvRow({
  label,
  value,
  icon,
  className,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 truncate font-mono text-xs text-foreground" title={value}>
        {value}
      </dd>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Mask a Supabase URL for screenshot safety
// ----------------------------------------------------------------------------

function maskUrl(url: string): string {
  // https://<ref>.supabase.co → https://jyfw…pbfy.supabase.co
  try {
    const u = new URL(url);
    const host = u.host;
    const dot = host.indexOf(".");
    if (dot <= 0) return url;
    const ref = host.slice(0, dot);
    if (ref.length <= 7) return url;
    const masked = `${ref.slice(0, 4)}…${ref.slice(-3)}`;
    return `${u.protocol}//${masked}.${host.slice(dot + 1)}`;
  } catch {
    return url;
  }
}
