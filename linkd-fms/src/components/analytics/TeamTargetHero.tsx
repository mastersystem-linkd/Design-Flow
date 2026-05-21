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

const TARGET = 3;

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
      <CardContent className="flex h-full flex-col py-5">
        {/* Header label */}
        <div className="mb-4 flex items-center gap-2">
          <Trophy className="h-4 w-4 text-warning" />
          <h3 className="text-sm font-semibold text-foreground">
            Monthly Concept Target
          </h3>
        </div>

        {/* Hero — donut fills the column, headline numbers stacked below.
            240px square viewBox so r=96 has breathing room; the surrounding
            soft halo (radial gradient on the parent div) lifts the ring off
            the card. */}
        <div className="flex flex-col items-center text-center">
          <div className="relative h-[240px] w-[240px]">
            {/* Soft outer halo — pure CSS, no extra DOM, only shows on
                high-percentage states where it reads as celebratory. */}
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
                  {/* Subtle outer glow so the arc has a slight bloom */}
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              {/* Track — recessed grey background ring */}
              <circle
                cx="120"
                cy="120"
                r={r}
                className="fill-none stroke-secondary"
                strokeWidth={20}
              />
              {/* Active arc with gradient fill + soft glow */}
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
              {/* Endpoint dot — pinpoints where the arc currently lands.
                  Only renders once mounted so the dot animates IN with the
                  arc rather than jumping from 0°. */}
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
            {/* Centered composition — note we counter-rotate text by using
                a positioned div rather than letting the SVG rotation flip it. */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <Target className={cn("h-5 w-5", radialColor.replace("stroke-", "text-"))} />
              <p className="mt-1.5 text-6xl font-bold leading-none tabular-nums text-foreground">
                {teamRate}
                <span className="text-3xl font-semibold text-muted-foreground">%</span>
              </p>
              <p className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
                on target
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground/70">
                {onTarget} of {totalDesigners} designers
              </p>
            </div>
          </div>

          {/* Headline numbers — sit centered below the ring */}
          <div className="mt-4 max-w-[280px]">
            <p className="text-2xl font-bold tabular-nums leading-tight text-foreground">
              {onTarget}
              <span className="text-base font-normal text-muted-foreground">
                {" "}/ {totalDesigners}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              designers hit <b className="text-foreground">{TARGET}</b> approved
            </p>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {totalApproved}/{teamTarget} concepts approved this month
            </p>
            {champion && champion.approvedCount > 0 && (
              <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
                🏆 {champion.name.split(" ")[0]} · {champion.approvedCount}
              </p>
            )}
          </div>
        </div>

        {/* Designer dock — comes BEFORE the stat strip per the new order. */}
        <div className="mt-5">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Designers this period
          </p>
          <div className="flex flex-wrap gap-1.5">
            {data.map((d) => (
              <DesignerPip key={d.id} entry={d} />
            ))}
          </div>
        </div>

        {/* Stat strip pinned to bottom — `mt-auto` pushes it to the card footer
            so it sits at the very end regardless of how many designer pips
            wrap above it. */}
        <div className="mt-auto pt-4">
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

function DesignerPip({ entry }: { entry: TargetRaceEntry }) {
  const pct = Math.min(100, (entry.approvedCount / TARGET) * 100);
  const ringColor = entry.isOnTarget
    ? "rgb(var(--success))"
    : entry.approvedCount > 0
    ? "rgb(var(--warning))"
    : "rgb(var(--muted))";

  return (
    <div
      className="group flex items-center gap-1.5 rounded-full border border-border bg-card/70 py-0.5 pr-2 pl-0.5 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm"
      title={`${entry.name} — ${entry.approvedCount}/${TARGET} approved`}
    >
      <div className="relative h-6 w-6 shrink-0">
        <svg
          viewBox="0 0 28 28"
          className="-rotate-90 absolute inset-0 h-full w-full"
          aria-hidden
        >
          <circle
            cx="14"
            cy="14"
            r="12"
            fill="none"
            stroke="rgb(var(--border))"
            strokeWidth="2"
          />
          <circle
            cx="14"
            cy="14"
            r="12"
            fill="none"
            stroke={ringColor}
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 12}
            strokeDashoffset={2 * Math.PI * 12 * (1 - pct / 100)}
            style={{ transition: "stroke-dashoffset 700ms ease-out" }}
          />
        </svg>
        <Avatar className="absolute inset-[3px] h-[18px] w-[18px]">
          {entry.avatarUrl ? <AvatarImage src={entry.avatarUrl} /> : null}
          <AvatarFallback className="text-[7px] bg-primary/10 text-primary">
            {getInitials(entry.name)}
          </AvatarFallback>
        </Avatar>
      </div>
      <span className="text-[10px] font-medium text-foreground">
        {entry.name.split(" ")[0]}
      </span>
      <span
        className={cn(
          "text-[9px] font-semibold tabular-nums",
          entry.isOnTarget
            ? "text-success"
            : entry.approvedCount > 0
            ? "text-warning"
            : "text-muted-foreground"
        )}
      >
        {entry.approvedCount}/{TARGET}
      </span>
    </div>
  );
}
