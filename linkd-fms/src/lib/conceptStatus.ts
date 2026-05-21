/**
 * Concept lifecycle helpers shared by every dashboard/scorecard hook.
 *
 * These exist because `md_status === 'approved'` is **not** the same as
 * "the work is finished". After MD's initial approval, a concept still needs
 * the designer to mark it done (`designer_actual_date`) and MD to grant final
 * approval (`final_approved_at`). Only then does it count as shipped.
 *
 * The dashboards used to lump those two together, which made completion rates
 * look identical to approval rates and hid the gap of "approved but stuck
 * waiting on designer / MD final signoff". Centralising the predicate keeps
 * every hook honest.
 */
import type {
  ConceptWithRelations,
  CompletionHistoryEntry,
} from "@/types/database";

/**
 * Is this concept "shipped"? Mirrors ConceptsView's Completed tab predicate.
 *
 * All three must be true:
 *   1. MD initially approved it (`md_status === 'approved'`)
 *   2. MD granted final approval (`final_approved_at` set)
 *   3. Designer marked it done (`designer_actual_date` set)
 *
 * Revision loop is naturally handled: when MD requests revision on an
 * already-approved concept, `resubmitConcept` leaves `designer_actual_date`
 * untouched and the eventual post-revision final approval re-stamps
 * `final_approved_at` — so the same predicate still flips true.
 */
export function isCompleted(c: ConceptWithRelations): boolean {
  return (
    c.md_status === "approved" &&
    !!c.final_approved_at &&
    !!c.designer_actual_date
  );
}

/**
 * Approved by MD but not yet finalised (waiting on designer to mark done or
 * MD to grant final approval). This is the "stuck in handoff" cohort.
 */
export function isApprovedAwaitingFinalisation(
  c: ConceptWithRelations
): boolean {
  return c.md_status === "approved" && !isCompleted(c);
}

/**
 * Count the number of times a concept went through the revision loop.
 *
 * The DB column `md_status === 'revision_requested'` only captures the
 * *current* state — a concept that was revised once and then approved shows 0
 * revisions in raw status, even though it absorbed reviewer time. We tally
 * `type === 'revision'` entries in `completion_history` for the true count.
 */
export function countRevisionCycles(c: ConceptWithRelations): number {
  const history = (c.completion_history ?? []) as CompletionHistoryEntry[];
  if (!Array.isArray(history)) return 0;
  return history.filter((e) => e?.type === "revision").length;
}

/**
 * Sum revision cycles across a list of concepts. The dashboards use this for
 * "true revisions absorbed" so a concept that was revised twice and then
 * approved counts as 2, not 0.
 */
export function sumRevisionCycles(concepts: ConceptWithRelations[]): number {
  let total = 0;
  for (const c of concepts) total += countRevisionCycles(c);
  return total;
}

/**
 * Did this concept survive at least one revision cycle before final approval?
 * Used by insights ("had to be revised — refine first draft").
 */
export function wasRevised(c: ConceptWithRelations): boolean {
  return countRevisionCycles(c) > 0;
}
