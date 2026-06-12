/**
 * Canonical pool ordering — the single source of truth for "who's next".
 *
 * Rule: **URGENT first, then strict FIFO by timestamp** (oldest
 * `requirement_received_at`, falling back to `created_at`, with `created_at` as
 * the final tiebreaker). Priority and time are the ONLY factors — internal
 * briefs and external (Sales ERP) tasks are ranked identically, with no source
 * partiality.
 *
 * Used by BOTH the claim path (`getNextPoolTasks` / `claimPoolTask` in
 * useTaskMutations) AND the pool DISPLAY (`usePoolWithGhosts` in useTasks), so
 * the order designers SEE is exactly the order they'll CLAIM in.
 */

/** Priority sort weight (lower = first in the pool). */
export const POOL_PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export function comparePoolFifo(
  a: { priority: string; requirement_received_at: string | null; created_at: string },
  b: { priority: string; requirement_received_at: string | null; created_at: string }
): number {
  const pa = POOL_PRIORITY_ORDER[a.priority] ?? 2;
  const pb = POOL_PRIORITY_ORDER[b.priority] ?? 2;
  if (pa !== pb) return pa - pb;
  const ra = new Date(a.requirement_received_at || a.created_at).getTime();
  const rb = new Date(b.requirement_received_at || b.created_at).getTime();
  if (ra !== rb) return ra - rb;
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}
