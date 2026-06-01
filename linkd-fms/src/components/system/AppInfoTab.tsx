import { useEffect, useState } from "react";
import {
  Users,
  Database,
  GitBranch,
  Code2,
  Monitor,
  Globe,
  CheckCircle2,
  Server,
  Cpu,
  Shield,
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
import { cn } from "@/lib/utils";

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ??
  "https://jyfwyfpwbbgfpsntubfy.supabase.co";

const LATEST_MIGRATION = "0019";

interface RowCounts {
  tasks: number;
  concepts: number;
  samples: number;
  loading: boolean;
}

export function AppInfoTab() {
  const { profiles, isLoading: profilesLoading } = useProfiles();
  const { totalCount: clientCount } = useClients();
  const { resolvedTheme } = useTheme();

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

  const userBreakdown = (() => {
    const out = { admin: 0, design_coordinator: 0, designer: 0, deo: 0 };
    for (const p of profiles ?? []) {
      if (p.role in out) out[p.role as keyof typeof out]++;
    }
    return out;
  })();

  const totalUsers = profiles?.length ?? 0;
  const totalRecords = counts.tasks + counts.concepts + counts.samples + clientCount;

  const env = (() => {
    if (typeof window === "undefined") return { screen: "—", userAgent: "—", timezone: "—" };
    return {
      screen: `${window.innerWidth} × ${window.innerHeight}`,
      userAgent: navigator.userAgent.slice(0, 80),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "—",
    };
  })();

  const recordBreakdown = [
    { label: "Tasks", value: counts.tasks, color: "bg-primary" },
    { label: "Concepts", value: counts.concepts, color: "bg-success" },
    { label: "Samples", value: counts.samples, color: "bg-warning" },
    { label: "Clients", value: clientCount, color: "bg-destructive" },
  ];

  const roleBreakdown = [
    { label: "Admins", value: userBreakdown.admin, color: "bg-primary" },
    { label: "Coordinators", value: userBreakdown.design_coordinator, color: "bg-success" },
    { label: "Designers", value: userBreakdown.designer, color: "bg-warning" },
    { label: "DEO", value: userBreakdown.deo, color: "bg-destructive" },
  ];

  return (
    <div className="space-y-4">
      {/* ── System Status Banner ── */}
      <Card className="overflow-hidden">
        <div className="relative bg-gradient-to-r from-success/10 via-card to-card">
          <CardContent className="flex items-center justify-between gap-4 py-3.5">
            <div className="flex items-center gap-3">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-success/15">
                <CheckCircle2 className="h-[18px] w-[18px] text-success" />
                <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-success" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">All Systems Operational</p>
                <p className="text-[11px] text-muted-foreground">
                  Database connected · {totalUsers} active users · PostgreSQL 15
                </p>
              </div>
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <span className="rounded-full bg-card border border-border px-3 py-1 text-[11px] font-medium text-foreground">
                Design Flow v1.0.0
              </span>
            </div>
          </CardContent>
        </div>
      </Card>

      {/* ── Quick Stats Row ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <QuickStat
          icon={<Users className="h-4 w-4" />}
          label="Total Users"
          value={profilesLoading ? "—" : String(totalUsers)}
          tone="primary"
        />
        <QuickStat
          icon={<Database className="h-4 w-4" />}
          label="Total Records"
          value={counts.loading ? "—" : totalRecords.toLocaleString()}
          tone="success"
        />
        <QuickStat
          icon={<GitBranch className="h-4 w-4" />}
          label="Migration"
          value={LATEST_MIGRATION}
          tone="warning"
        />
        <QuickStat
          icon={<Code2 className="h-4 w-4" />}
          label="Build"
          value="v1.0.0"
          tone="primary"
        />
      </div>

      {/* ── Team & Data Breakdown ── */}
      <div className="grid gap-3 lg:grid-cols-2">
        {/* Team Composition */}
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">Team Composition</p>
            </div>
            {profilesLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              <div className="space-y-2.5">
                {roleBreakdown.filter((r) => r.value > 0).map((r) => {
                  const pct = totalUsers > 0 ? Math.round((r.value / totalUsers) * 100) : 0;
                  return (
                    <div key={r.label} className="flex items-center gap-3">
                      <span className="w-24 shrink-0 text-[12px] font-medium text-foreground">{r.label}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                        <div
                          className={cn("h-full rounded-full transition-[width] duration-700", r.color)}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                        {r.value} ({pct}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Database Records */}
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-success" />
                <p className="text-sm font-semibold text-foreground">Database Records</p>
              </div>
              <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
                {counts.loading ? "…" : totalRecords.toLocaleString()} total
              </span>
            </div>
            {counts.loading ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              <div className="space-y-2.5">
                {recordBreakdown.map((r) => {
                  const pct = totalRecords > 0 ? Math.max(1, Math.round((r.value / totalRecords) * 100)) : 0;
                  return (
                    <div key={r.label} className="flex items-center gap-3">
                      <span className="w-24 shrink-0 text-[12px] font-medium text-foreground">{r.label}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                        <div
                          className={cn("h-full rounded-full transition-[width] duration-700", r.color)}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                        {r.value.toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Tech Stack & Environment ── */}
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Cpu className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">Tech Stack & Environment</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <EnvItem label="Framework" value="React 18" />
            <EnvItem label="Bundler" value="Vite 5" />
            <EnvItem label="Language" value="TypeScript" />
            <EnvItem label="Styling" value="Tailwind CSS 3" />
            <EnvItem label="Database" value="PostgreSQL 15" />
            <EnvItem
              label="Backend"
              value={maskUrl(SUPABASE_URL).replace("https://", "")}
              icon={<Globe className="h-3 w-3" />}
            />
            <EnvItem label="Theme" value={resolvedTheme === "dark" ? "Dark" : "Light"} />
            <EnvItem label="Timezone" value={env.timezone} />
            <EnvItem label="Screen" value={env.screen} icon={<Monitor className="h-3 w-3" />} />
            <EnvItem
              label="Browser"
              value={env.userAgent.split(" ")[0]}
              className="sm:col-span-2 lg:col-span-1"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function QuickStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "primary" | "success" | "warning";
}) {
  const bg = { primary: "bg-primary/10", success: "bg-success/10", warning: "bg-warning/10" }[tone];
  const fg = { primary: "text-primary", success: "text-success", warning: "text-warning" }[tone];
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-3">
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", bg, fg)}>
          {icon}
        </div>
        <div>
          <p className="text-lg font-bold tabular-nums leading-tight text-foreground">{value}</p>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function EnvItem({
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
    <div className={cn("rounded-lg border border-border bg-secondary/30 px-3 py-2", className)}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 flex items-center gap-1 truncate text-[12px] font-medium text-foreground" title={value}>
        {icon}
        {value}
      </p>
    </div>
  );
}

function maskUrl(url: string): string {
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
