import { useEffect, useState } from "react";
import { Trophy, Flame, Calendar } from "lucide-react";
import {
  Card,
  CardContent,
  Avatar,
  AvatarFallback,
  AvatarImage,
  getInitials,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import type { TargetRaceEntry } from "@/hooks/useAnalytics";

const TARGET = 2;

interface Props {
  data: TargetRaceEntry[];
  periodStart: Date;
  periodEnd: Date;
}

/**
 * TeamTargetHero
 * -------------------------------------------------------------------------
 * Vertical-friendly hero. Designed to fit a narrow column (e.g. xl:col-span-2
 * of a 5-col grid). Layout:
 *   Row 1 — radial dial + headline (side by side)
 *   Row 2 — inline stat line (days left · pace · not started)
 *   Row 3 — designer dock (wrapping pips)
 */
export function TeamTargetHero({ data, periodStart, periodEnd }: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 80);
    return () => clearTimeout(t);
  }, []);

  const totalDesigners = data.length || 1;
  const onTarget = data.filter((d) => d.isOnTarget).length;
  const teamRate = Math.round((onTarget / totalDesigners) * 100);

  const totalApproved = data.reduce((s, d) => s + d.approvedCount, 0);
  const teamTarget = TARGET * totalDesigners;

  const now = new Date();
  const monthDays = Math.max(
    1,
    Math.round((periodEnd.getTime() - periodStart.getTime()) / 86400000) + 1
  );
  const elapsedDays = Math.max(
    0,
    Math.min(
      monthDays,
      Math.round((now.getTime() - periodStart.getTime()) / 86400000) + 1
    )
  );
  const daysLeft = Math.max(0, monthDays - elapsedDays);
  const monthProgress = Math.round((elapsedDays / monthDays) * 100);
  const onPace = teamRate >= monthProgress - 10;
  const notStartedCount = data.filter((d) => d.approvedCount === 0).length;
  const inProgressCount = data.filter(
    (d) => d.approvedCount > 0 && !d.isOnTarget
  ).length;
  const teamProgressPct = Math.round((totalApproved / Math.max(1, teamTarget)) * 100);
  const champion = [...data].sort((a, b) => b.approvedCount - a.approvedCount)[0];

  const tone: "success" | "warning" | "destructive" =
    teamRate >= 80 ? "success" : teamRate >= 50 ? "warning" : "destructive";

  return (
    <Card className="relative h-full overflow-hidden">
      {/* soft tier-tinted wash for a high-tech backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(120% 70% at 0% 0%, rgb(var(--warning)/0.06), transparent 55%)",
        }}
      />
      <CardContent className="relative flex h-full flex-col gap-3 py-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-warning" />
            <h3 className="text-sm font-semibold text-foreground">
              Monthly Concept Target
            </h3>
          </div>
          {champion && champion.approvedCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
              🏆 {champion.name.split(" ")[0]} · {champion.approvedCount}
            </span>
          )}
        </div>

        {/* Hero row — 3D target gyro + headline side-by-side. */}
        <div className="flex items-center gap-4">
          <div className="shrink-0">
            <TargetGyro pct={teamRate} tone={tone} />
          </div>

          {/* Headline numbers + concepts-approved progress */}
          <div className="min-w-0 flex-1 space-y-2.5">
            <div>
              <p className="text-2xl font-bold tabular-nums leading-none text-foreground">
                {onTarget}
                <span className="text-base font-normal text-muted-foreground">
                  {" "}/ {totalDesigners}
                </span>
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                designers hit <b className="text-foreground">{TARGET}</b> approved this month
              </p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-medium uppercase tracking-wider text-muted-foreground">
                  Concepts approved
                </span>
                <span className="font-semibold tabular-nums text-foreground">
                  {totalApproved}/{teamTarget}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary/60">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary via-primary to-primary/60 shadow-[0_0_10px_-2px_rgb(var(--primary)/0.6)] transition-[width] duration-1000 ease-out"
                  style={{ width: `${mounted ? Math.min(100, teamProgressPct) : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Designer roster — compact 3-column grid so 6 designers land in
            2 rows (was a 2-col / 3-row block). */}
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Designers this period
          </p>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
            {data.map((d) => (
              <DesignerRow key={d.id} entry={d} />
            ))}
          </div>
        </div>

        {/* Two compact charts. `flex-1` lets the grid grow when the sibling
            matrix card is taller; each chart card uses `h-full` + internal
            flex centering so their content sits in the middle of the cell
            instead of leaving an empty band at the bottom. */}
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
          <StatusDonut
            onTarget={onTarget}
            inProgress={inProgressCount}
            notStarted={notStartedCount}
            total={totalDesigners}
          />
          <PacingBars
            teamProgressPct={teamProgressPct}
            monthProgress={monthProgress}
            totalApproved={totalApproved}
            teamTarget={teamTarget}
          />
        </div>

        {/* Stat strip — pinned to the card bottom. */}
        <div>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-[11px]">
            <Calendar className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">Days left:</span>
            <span className="font-semibold tabular-nums text-foreground">{daysLeft}</span>
            <Divider />
            <Flame
              className={cn(
                "h-3 w-3",
                onPace ? "text-success" : "text-warning"
              )}
            />
            <span className={cn(
              "font-semibold",
              onPace ? "text-success" : "text-warning"
            )}>
              {onPace ? "On pace" : "Behind pace"}
            </span>
            <Divider />
            <span className="text-muted-foreground">Not started:</span>
            <span
              className={cn(
                "font-semibold tabular-nums",
                notStartedCount === 0 ? "text-success" : "text-warning"
              )}
            >
              {notStartedCount}
            </span>
            <span className="ml-auto text-[10px] text-muted-foreground">
              {monthProgress}% through
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

// TargetGyro — an always-on 3D "gyroscope" of target rings (pure CSS 3D, no
// three.js). Three concentric rings orbit on different axes for an elegant,
// minimal high-tech centrepiece; the live % sits flat in the middle. Rings
// are tinted by tier and the whole thing freezes under reduced-motion.
function TargetGyro({
  pct,
  tone,
}: {
  pct: number;
  tone: "success" | "warning" | "destructive";
}) {
  const toneVar =
    tone === "success" ? "--success" : tone === "warning" ? "--warning" : "--destructive";
  return (
    <div className="tg-scene">
      <style>{`
        .tg-scene { position: relative; width: 116px; height: 116px; perspective: 360px; }
        .tg-rings { position: absolute; inset: 0; transform-style: preserve-3d; }
        .tg-ring { position: absolute; border-radius: 9999px; border-style: solid; border-width: 2px; will-change: transform; }
        .tg-r1 { inset: 6px;  animation: tg-x 7s linear infinite; }
        .tg-r2 { inset: 22px; animation: tg-y 5.5s linear infinite; }
        .tg-r3 { inset: 38px; animation: tg-xy 9s linear infinite; }
        @keyframes tg-x  { to { transform: rotateX(360deg); } }
        @keyframes tg-y  { to { transform: rotateY(360deg); } }
        @keyframes tg-xy { to { transform: rotateX(360deg) rotateY(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          .tg-r1 { transform: rotateX(64deg); animation: none; }
          .tg-r2 { transform: rotateY(64deg); animation: none; }
          .tg-r3 { transform: rotateX(48deg) rotateY(48deg); animation: none; }
        }
      `}</style>
      <div className="tg-rings">
        <span className="tg-ring tg-r1" style={{ borderColor: `rgb(var(${toneVar}) / 0.75)` }} />
        <span className="tg-ring tg-r2" style={{ borderColor: "rgb(var(--primary) / 0.55)" }} />
        <span className="tg-ring tg-r3" style={{ borderColor: `rgb(var(${toneVar}) / 0.6)` }} />
      </div>
      {/* soft glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full opacity-40 blur-2xl"
        style={{ background: `radial-gradient(closest-side, rgb(var(${toneVar})/0.45), transparent 70%)` }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-2xl font-bold leading-none tabular-nums text-foreground">
          {pct}
          <span className="text-sm font-semibold text-muted-foreground">%</span>
        </p>
        <p className="mt-0.5 text-[8px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          on target
        </p>
      </div>
    </div>
  );
}

function Divider() {
  return <span className="mx-1.5 h-3 w-px shrink-0 bg-border" />;
}

function DesignerRow({ entry }: { entry: TargetRaceEntry }) {
  const countColor = entry.isOnTarget
    ? "text-success"
    : entry.approvedCount > 0
      ? "text-warning"
      : "text-muted-foreground";
  const barColor = entry.isOnTarget
    ? "bg-success"
    : entry.approvedCount > 0
      ? "bg-warning"
      : "bg-muted-foreground/30";
  const pct = Math.min(100, Math.round((entry.approvedCount / TARGET) * 100));

  return (
    <div
      className="flex flex-col gap-1 rounded-lg border border-border/60 bg-card/40 px-2 py-1.5 transition-all hover:border-primary/30 hover:bg-card hover:shadow-card-soft"
      title={`${entry.name} — ${entry.approvedCount}/${TARGET} approved`}
    >
      <div className="flex items-center gap-1.5">
        <Avatar className="h-5 w-5 shrink-0">
          {entry.avatarUrl ? <AvatarImage src={entry.avatarUrl} /> : null}
          <AvatarFallback className="bg-primary/10 text-[8px] text-primary">
            {getInitials(entry.name)}
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">
          {entry.name.split(" ")[0]}
        </span>
        <span className={cn("shrink-0 text-[10px] font-semibold tabular-nums", countColor)}>
          {entry.approvedCount}/{TARGET}
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-secondary/60">
        <div
          className={cn("h-full rounded-full transition-[width] duration-700", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------- //
// StatusDonut — splits the team into On Target / In Progress / Not Started.
// Compact 84px donut + legend on the right. Pure SVG to avoid recharts cost.
// -------------------------------------------------------------------------- //

function StatusDonut({
  onTarget,
  inProgress,
  notStarted,
  total,
}: {
  onTarget: number;
  inProgress: number;
  notStarted: number;
  total: number;
}) {
  const slices = [
    { value: onTarget, color: "rgb(34, 197, 94)", label: "On target" }, // success
    { value: inProgress, color: "rgb(245, 158, 11)", label: "In progress" }, // warning
    { value: notStarted, color: "rgb(148, 163, 184)", label: "Not started" }, // muted
  ];
  const safeTotal = Math.max(1, total);

  // SVG donut math: build cumulative arc lengths
  const r = 36;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const segs = slices.map((s) => {
    const len = (s.value / safeTotal) * c;
    const seg = { ...s, len, offset };
    offset += len;
    return seg;
  });

  return (
    <div className="flex h-full items-center gap-3 rounded-lg border border-border/60 bg-card/40 p-3">
      <div className="relative h-[84px] w-[84px] shrink-0">
        <svg viewBox="0 0 84 84" className="-rotate-90 h-full w-full" aria-hidden>
          {/* Background ring (covers 0-total gap if any) */}
          <circle cx="42" cy="42" r={r} fill="none" stroke="rgb(var(--secondary))" strokeWidth="10" />
          {segs.map(
            (s, i) =>
              s.value > 0 && (
                <circle
                  key={i}
                  cx="42"
                  cy="42"
                  r={r}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="10"
                  strokeDasharray={`${s.len} ${c}`}
                  strokeDashoffset={-s.offset}
                />
              )
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold tabular-nums leading-none text-foreground">
            {total}
          </span>
          <span className="text-[9px] text-muted-foreground">designers</span>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-[10px]">
        {slices.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: s.color }}
            />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{s.label}</span>
            <span className="font-semibold tabular-nums text-foreground">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------- //
// PacingBars — side-by-side comparison of how far the team has gotten vs
// how far through the period we are. Highlights the gap (delta) so the
// "Behind/On pace" verdict has concrete numbers behind it.
// -------------------------------------------------------------------------- //

function PacingBars({
  teamProgressPct,
  monthProgress,
  totalApproved,
  teamTarget,
}: {
  teamProgressPct: number;
  monthProgress: number;
  totalApproved: number;
  teamTarget: number;
}) {
  const ahead = teamProgressPct >= monthProgress;
  const delta = teamProgressPct - monthProgress;

  return (
    <div className="flex h-full flex-col justify-center gap-2 rounded-lg border border-border/60 bg-card/40 p-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Pacing
        </p>
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[9px] font-semibold tabular-nums",
            ahead
              ? "bg-success/10 text-success"
              : delta >= -10
                ? "bg-warning/10 text-warning"
                : "bg-destructive/10 text-destructive"
          )}
        >
          {delta >= 0 ? "+" : ""}
          {delta}%
        </span>
      </div>

      {/* Team progress bar */}
      <div className="space-y-0.5">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground">Team progress</span>
          <span className="font-semibold tabular-nums text-foreground">
            {totalApproved}/{teamTarget}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary/60">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-700",
              ahead ? "bg-success" : "bg-warning"
            )}
            style={{ width: `${Math.min(100, teamProgressPct)}%` }}
          />
        </div>
      </div>

      {/* Month elapsed bar */}
      <div className="space-y-0.5">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground">Month elapsed</span>
          <span className="font-semibold tabular-nums text-foreground">
            {monthProgress}%
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary/60">
          <div
            className="h-full rounded-full bg-primary/60 transition-[width] duration-700"
            style={{ width: `${Math.min(100, monthProgress)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
