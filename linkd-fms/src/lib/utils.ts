import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Loose parser for Postgres `interval` values. Supabase returns intervals in
 * either ISO-8601 (`PT5025S`), HH:MM:SS (`01:23:45.6`), or numeric-string
 * (`5025` / `5025 seconds`) shapes depending on rest config. Returns total
 * seconds, or 0 on anything unparseable. Used by hold-duration UI surfaces.
 */
export function parseIntervalSeconds(raw: string | null | undefined): number {
  if (!raw) return 0;
  const iso = raw.match(/^P(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
  if (iso) {
    const h = parseInt(iso[1] ?? "0", 10);
    const m = parseInt(iso[2] ?? "0", 10);
    const s = parseFloat(iso[3] ?? "0");
    return h * 3600 + m * 60 + s;
  }
  const hms = raw.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
  if (hms) {
    return (
      parseInt(hms[1], 10) * 3600 +
      parseInt(hms[2], 10) * 60 +
      parseFloat(hms[3])
    );
  }
  const numeric = parseFloat(raw);
  return Number.isFinite(numeric) ? numeric : 0;
}

/**
 * Compact human-readable duration from seconds. Reads as:
 *   < 1 min   → "just now"
 *   < 1 hour  → "{m}m"
 *   < 24h     → "{h}h" or "{h}h {m}m" when minutes > 0
 *   < 7 days  → "{d}d" or "{d}d {h}h"
 *   ≥ 7 days  → "{d}d" (collapse hours past a week)
 */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 60) return "just now";
  const totalMinutes = Math.floor(seconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const totalHours = Math.floor(seconds / 3600);
  const remMinutes = Math.floor((seconds % 3600) / 60);
  if (totalHours < 24) {
    return remMinutes > 0 ? `${totalHours}h ${remMinutes}m` : `${totalHours}h`;
  }
  const days = Math.floor(seconds / 86400);
  const remHours = Math.floor((seconds % 86400) / 3600);
  if (days < 7 && remHours > 0) return `${days}d ${remHours}h`;
  return `${days}d`;
}
