import { useEffect, useState } from "react";
import { Target, Trophy, Flame, Calendar } from "lucide-react";
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

  const radialColor =
    teamRate >= 80
      ? "stroke-success"
      : teamRate >= 50
      ? "stroke-warning"
      : "stroke-destructive";

  // Pushed to a 240px viewBox with r=96 so the donut fills the column and
  // reads as the hero of the card. Stroke 20 to match — at this radius a
  // thin stroke looks anaemic. The arc paints a gradient (deep→light hue
  // along the sweep) for a richer look than a flat colored ring.
  const r = 96;
  const c = 2 * Math.PI * r;
  const dash = mounted ? (teamRate / 100) * c : 0;

  // Tier-driven gradient ids — different `id`s per render lets multiple
  // hero cards coexist on the page without sharing strokes (Concept and
  // future variants).
  const gradId = "team-target-gradient";
  const glowId = "team-target-glow";
  const gradStart =
    teamRate >= 80
      ? "rgb(34, 197, 94)"  // success-500 — bright leaf
      : teamRate >= 50
      ? "rgb(245, 158, 11)" // warning-500 — amber
      : "rgb(239, 68, 68)"; // destructive-500 — coral
  const gradEnd =
    teamRate >= 80
      ? "rgb(74, 222, 128)" // success-400 — lighter mint
      : teamRate >= 50
      ? "rgb(251, 191, 36)" // warning-400 — sun
      : "rgb(248, 113, 113)"; // destructive-400 — peach

  return (
    <Card className="h-full overflow-hidden">
      <CardContent className="flex h-full flex-col gap-3 py-4">
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

        {/* Hero row — donut + headline side-by-side. */}
        <div className="flex items-center gap-4">
          <div className="relative h-[120px] w-[120px] shrink-0">
            {teamRate >= 50 && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-full opacity-40 blur-2xl"
                style={{
                  background: `radial-gradient(closest-side, ${gradStart} 0%, transparent 70%)`,
                }}
              />
            )}
            <svg viewBox="0 0 240 240" className="-rotate-90 h-full w-full" aria-hidden>
              <defs>
                <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor={gradStart} />
                  <stop offset="100%" stopColor={gradEnd} />
                </linearGradient>
                <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <circle
                cx="120"
                cy="120"
                r={r}
                className="fill-none stroke-secondary"
                strokeWidth={20}
              />
              <circle
                cx="120"
                cy="120"
                r={r}
                stroke={`url(#${gradId})`}
                fill="none"
                strokeWidth={20}
                strokeDasharray={c}
                strokeDashoffset={c - dash}
                strokeLinecap="round"
                filter={`url(#${glowId})`}
                style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.4,0,0.2,1)" }}
              />
              {mounted && teamRate > 0 && (
                <circle
                  cx="120"
                  cy="120"
                  r="5"
                  fill={gradEnd}
                  transform={`rotate(${(teamRate / 100) * 360 - 90} 120 120) translate(${r} 0)`}
                  style={{ transition: "transform 900ms cubic-bezier(0.4,0,0.2,1)" }}
                />
              )}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <Target className={cn("h-3 w-3", radialColor.replace("stroke-", "text-"))} />
              <p className="text-2xl font-bold leading-none tabular-nums text-foreground">
                {teamRate}
                <span className="text-sm font-semibold text-muted-foreground">%</span>
              </p>
              <p className="mt-0.5 text-[8px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                on target
              </p>
            </div>
          </div>

          {/* Headline numbers — right column of the hero */}
          <div className="min-w-0 flex-1">
            <p className="text-2xl font-bold tabular-nums leading-none text-foreground">
              {onTarget}
              <span className="text-base font-normal text-muted-foreground">
                {" "}/ {totalDesigners}
              </span>
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              designers hit <b className="text-foreground">{TARGET}</b> approved
            </p>
            <p className="mt-1.5 rounded-md bg-secondary/40 px-2 py-0.5 text-[10px] text-muted-foreground">
              <span className="font-semibold tabular-nums text-foreground">
                {totalApproved}/{teamTarget}
              </span>{" "}
              concepts approved this month
            </p>
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

function Divider() {
  return <span className="mx-1.5 h-3 w-px shrink-0 bg-border" />;
}

function DesignerRow({ entry }: { entry: TargetRaceEntry }) {
  const countColor = entry.isOnTarget
    ? "text-success"
    : entry.approvedCount > 0
      ? "text-warning"
      : "text-muted-foreground";

  return (
    <div
      className="flex items-center gap-1.5 rounded-md border border-border/60 bg-card/40 px-1.5 py-1 transition-colors hover:border-primary/30 hover:bg-card"
      title={`${entry.name} — ${entry.approvedCount}/${TARGET} approved`}
    >
      <Avatar className="h-4 w-4 shrink-0">
        {entry.avatarUrl ? <AvatarImage src={entry.avatarUrl} /> : null}
        <AvatarFallback className="bg-primary/10 text-[7px] text-primary">
          {getInitials(entry.name)}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-foreground">
        {entry.name.split(" ")[0]}
      </span>
      <span className={cn("shrink-0 text-[9px] font-semibold tabular-nums", countColor)}>
        {entry.approvedCount}/{TARGET}
      </span>
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
