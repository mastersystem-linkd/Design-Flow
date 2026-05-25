/**
 * Designer "My Work" board — the action-oriented surface designers land on
 * inside /concepts. Renders the post-approval lifecycle as grouped sections
 * (Ready / In Progress / On Hold / Changes Needed / In Revision / Completed)
 * with inline buttons for each transition so a designer can move work
 * without opening the drawer.
 *
 * Spec: CONCEPT-WORKFLOW-PROMPT.md §7.2.
 *
 * Wiring:
 *   • Concepts are pre-filtered by ConceptsView to the rows the current
 *     designer owns (designer_id OR submitted_by = me).
 *   • Mutations are passed down from useConcepts — never imported here, so
 *     the board stays a pure rendering component.
 *   • Clicking a row opens the same ConceptDetailDrawer the table uses, so
 *     the designer can fall back to the full lifecycle view for anything
 *     this board doesn't cover (e.g. file attachments, MD notes).
 */

import { useState } from "react";
import {
  PlayCircle,
  Pause,
  Play,
  CheckCircle2,
  AlertTriangle,
  Hourglass,
  Clock,
  Sparkles,
} from "lucide-react";
import { formatDistanceToNow, formatDistanceToNowStrict } from "date-fns";
import { ConceptImage } from "@/components/ui/ConceptImage";
import { Badge } from "@/components/ui/badge";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { WORK_STATUS_LABELS } from "@/lib/constants";
import type {
  Concept,
  ConceptWithRelations,
  ConceptWorkStatus,
} from "@/types/database";
import type { MutationResult } from "@/hooks/useConcepts";

interface DesignerWorkBoardProps {
  /** Concepts pre-filtered to the current designer's work. */
  concepts: ConceptWithRelations[];
  /** Open the standard drawer for full detail. */
  onSelect: (concept: ConceptWithRelations) => void;
  /** Mutations — same handlers passed to ConceptDetailDrawer. */
  onStart: (id: string) => Promise<MutationResult<Concept>>;
  onHold: (
    id: string,
    reason?: string | null
  ) => Promise<MutationResult<Concept>>;
  onResume: (id: string) => Promise<MutationResult<Concept>>;
  onMarkDone: (id: string) => Promise<MutationResult<Concept>>;
  onStartChanges: (id: string) => Promise<MutationResult<Concept>>;
}

// Section ordering reflects how a designer actually triages their day:
// Changes Needed first (MD blocked on them), then ready-to-start, then
// in-progress, then on-hold, then awaiting-review, then completed.
const SECTION_ORDER: readonly {
  key: ConceptWorkStatus;
  title: string;
  helper: string;
  icon: typeof PlayCircle;
  accent: string;
}[] = [
  {
    key: "changes_requested",
    title: "Changes needed",
    helper: "Ma'am asked for changes — feedback shown on each card.",
    icon: AlertTriangle,
    accent: "border-warning/40 bg-warning/[0.04]",
  },
  {
    key: "not_started",
    title: "Ready to start",
    helper: "Approved concepts waiting on your kickoff.",
    icon: Clock,
    accent: "border-primary/30 bg-primary/[0.04]",
  },
  {
    key: "in_progress",
    title: "In progress",
    helper: "Active work — hold when something urgent comes in, mark done when ready.",
    icon: PlayCircle,
    accent: "border-primary/40 bg-primary/[0.04]",
  },
  {
    key: "on_hold",
    title: "On hold",
    helper: "Paused — resume when you're back on this.",
    icon: Pause,
    accent: "border-warning/40 bg-warning/[0.04]",
  },
  {
    key: "in_revision",
    title: "Awaiting Ma'am's review",
    helper: "Sent in — no action needed until Ma'am responds.",
    icon: Hourglass,
    accent: "border-destructive/30 bg-destructive/[0.04]",
  },
  {
    key: "completed",
    title: "Completed",
    helper: "Fully approved designs — view only.",
    icon: CheckCircle2,
    accent: "border-success/30 bg-success/[0.04]",
  },
];

export function DesignerWorkBoard({
  concepts,
  onSelect,
  onStart,
  onHold,
  onResume,
  onMarkDone,
  onStartChanges,
}: DesignerWorkBoardProps) {
  const grouped = groupByWorkStatus(concepts);
  // If nothing approved is in the designer's queue, hide the board entirely
  // (the wide table below is still informative for legacy / pending rows).
  const totalApproved = SECTION_ORDER.reduce(
    (sum, s) => sum + (grouped[s.key]?.length ?? 0),
    0
  );
  if (totalApproved === 0) return null;

  // Per-row busy tracking keyed by `${op}:${conceptId}` so multiple rows can
  // animate independently without sharing a single global busy lock.
  return (
    <BoardInner
      grouped={grouped}
      onSelect={onSelect}
      onStart={onStart}
      onHold={onHold}
      onResume={onResume}
      onMarkDone={onMarkDone}
      onStartChanges={onStartChanges}
    />
  );
}

// ----------------------------------------------------------------------------
// Inner component — owns the per-row busy state and the Hold dialog. Kept
// separate so the empty-state short-circuit above doesn't allocate state
// for an unmounted board.
// ----------------------------------------------------------------------------

function BoardInner({
  grouped,
  onSelect,
  onStart,
  onHold,
  onResume,
  onMarkDone,
  onStartChanges,
}: {
  grouped: Record<ConceptWorkStatus, ConceptWithRelations[]>;
  onSelect: (concept: ConceptWithRelations) => void;
  onStart: (id: string) => Promise<MutationResult<Concept>>;
  onHold: (
    id: string,
    reason?: string | null
  ) => Promise<MutationResult<Concept>>;
  onResume: (id: string) => Promise<MutationResult<Concept>>;
  onMarkDone: (id: string) => Promise<MutationResult<Concept>>;
  onStartChanges: (id: string) => Promise<MutationResult<Concept>>;
}) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [holdTarget, setHoldTarget] = useState<ConceptWithRelations | null>(null);
  const [holdReason, setHoldReason] = useState("");

  async function run(
    op: string,
    conceptId: string,
    fn: () => Promise<MutationResult<Concept>>,
    successMsg: string
  ) {
    setBusyKey(`${op}:${conceptId}`);
    const { error } = await fn();
    setBusyKey(null);
    if (error) return void toast.error(error);
    toast.success(successMsg);
  }

  async function handleHoldSubmit() {
    if (!holdTarget) return;
    setBusyKey(`hold:${holdTarget.id}`);
    const { error } = await onHold(holdTarget.id, holdReason || null);
    setBusyKey(null);
    if (error) return void toast.error(error);
    toast.success("Concept put on hold");
    setHoldTarget(null);
    setHoldReason("");
  }

  return (
    <section className="space-y-3">
      <header className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-foreground">My work</h2>
          <p className="text-[11px] text-muted-foreground">
            Approved concepts in your post-approval pipeline.
          </p>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {SECTION_ORDER.map((s) => {
          const rows = grouped[s.key] ?? [];
          if (rows.length === 0) return null;
          const Icon = s.icon;
          return (
            <div
              key={s.key}
              className={cn(
                "rounded-xl border bg-card p-3 shadow-card-soft",
                s.accent
              )}
            >
              <header className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Icon className="h-3.5 w-3.5 text-foreground" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                    {s.title}
                  </h3>
                </div>
                <Badge className="border border-border bg-card/80 text-foreground">
                  {rows.length}
                </Badge>
              </header>
              <p className="mb-2 text-[11px] leading-snug text-muted-foreground">
                {s.helper}
              </p>
              <ul className="space-y-2">
                {rows.map((c) => (
                  <ConceptRow
                    key={c.id}
                    concept={c}
                    busyKey={busyKey}
                    onOpen={() => onSelect(c)}
                    onStart={() =>
                      run("start", c.id, () => onStart(c.id), "Started")
                    }
                    onOpenHold={() => {
                      setHoldTarget(c);
                      setHoldReason("");
                    }}
                    onResume={() =>
                      run("resume", c.id, () => onResume(c.id), "Resumed")
                    }
                    onMarkDone={() =>
                      run(
                        "mark_done",
                        c.id,
                        () => onMarkDone(c.id),
                        "Sent to Ma'am for review"
                      )
                    }
                    onStartChanges={() =>
                      run(
                        "start_changes",
                        c.id,
                        () => onStartChanges(c.id),
                        "Working on changes"
                      )
                    }
                  />
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* Hold dialog — shared across all rows. */}
      <Dialog
        open={!!holdTarget}
        onOpenChange={(o) => {
          if (!o) {
            setHoldTarget(null);
            setHoldReason("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Hold "{holdTarget?.title}"?</DialogTitle>
            <DialogDescription>
              You can resume anytime. Hold duration is tracked so Ma'am sees
              what actually delayed the work.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 pt-2">
            <Label htmlFor="board-hold-reason" className="text-xs">
              Reason (optional)
            </Label>
            <textarea
              id="board-hold-reason"
              value={holdReason}
              onChange={(e) => setHoldReason(e.target.value)}
              placeholder="e.g. Urgent job-work brief came in"
              rows={3}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setHoldTarget(null)}
              disabled={busyKey?.startsWith("hold:")}
            >
              Cancel
            </Button>
            <LoadingButton
              size="sm"
              loading={busyKey === `hold:${holdTarget?.id}`}
              loadingText="Holding…"
              onClick={handleHoldSubmit}
              className="gap-1.5"
            >
              <Pause className="h-3.5 w-3.5" />
              Hold concept
            </LoadingButton>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// ----------------------------------------------------------------------------
// ConceptRow — compact card per concept with state-specific action buttons.
// Click anywhere outside the action buttons opens the drawer.
// ----------------------------------------------------------------------------

function ConceptRow({
  concept,
  busyKey,
  onOpen,
  onStart,
  onOpenHold,
  onResume,
  onMarkDone,
  onStartChanges,
}: {
  concept: ConceptWithRelations;
  busyKey: string | null;
  onOpen: () => void;
  onStart: () => void;
  onOpenHold: () => void;
  onResume: () => void;
  onMarkDone: () => void;
  onStartChanges: () => void;
}) {
  const ws = concept.work_status;
  const startedRel = concept.work_started_at
    ? formatDistanceToNow(new Date(concept.work_started_at), {
        addSuffix: true,
      })
    : null;
  const heldRel = concept.work_held_at
    ? formatDistanceToNowStrict(new Date(concept.work_held_at), {
        addSuffix: true,
      })
    : null;

  return (
    <li
      className="group rounded-lg border border-border bg-card p-2 transition-colors hover:bg-secondary/40"
    >
      <div className="flex items-start gap-2.5">
        {/* Thumbnail — opens drawer for full detail. */}
        <button
          type="button"
          onClick={onOpen}
          className="h-12 w-12 shrink-0 overflow-hidden rounded-md border border-border bg-secondary"
          title="Open full detail"
        >
          {concept.image_url ? (
            <ConceptImage
              src={concept.image_url}
              alt={concept.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
              {concept.concept_code?.slice(0, 4) ?? "—"}
            </div>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpen}
            className="block w-full truncate text-left text-[13px] font-medium leading-tight text-foreground hover:text-primary"
            title={concept.title}
          >
            {concept.title}
          </button>
          <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
            {concept.concept_code}
            {concept.client?.party_name ? ` · ${concept.client.party_name}` : ""}
          </p>

          {/* State-specific metadata banner. */}
          {ws === "changes_requested" && concept.md_feedback && (
            <p
              className="mt-1.5 line-clamp-2 rounded border border-warning/20 bg-warning/10 px-2 py-1 text-[11px] italic text-foreground"
              title={concept.md_feedback}
            >
              "{concept.md_feedback}"
            </p>
          )}
          {ws === "on_hold" && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {concept.hold_reason
                ? `"${concept.hold_reason}"`
                : "Paused"}
              {heldRel && (
                <span className="ml-1 text-muted-foreground/80">· {heldRel}</span>
              )}
            </p>
          )}
          {ws === "in_progress" && startedRel && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Started {startedRel}
              {(concept.revision_count ?? 0) > 1 && (
                <span className="ml-1 text-warning">
                  · round {concept.revision_count}
                </span>
              )}
            </p>
          )}
          {ws === "in_revision" && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Sent for review · round {Math.max(1, concept.revision_count ?? 1)}
            </p>
          )}
          {ws === "completed" && concept.work_completed_at && (
            <p className="mt-1 text-[11px] text-success">
              Approved {formatDistanceToNow(new Date(concept.work_completed_at), { addSuffix: true })}
            </p>
          )}

          {/* Inline action row. */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {ws === "not_started" && (
              <LoadingButton
                size="sm"
                loading={busyKey === `start:${concept.id}`}
                loadingText="…"
                onClick={onStart}
                className="h-7 gap-1 px-2.5 text-[11px]"
              >
                <PlayCircle className="h-3 w-3" />
                Start
              </LoadingButton>
            )}
            {ws === "in_progress" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onOpenHold}
                  disabled={busyKey !== null}
                  className="h-7 gap-1 px-2.5 text-[11px]"
                >
                  <Pause className="h-3 w-3" />
                  Hold
                </Button>
                <LoadingButton
                  size="sm"
                  loading={busyKey === `mark_done:${concept.id}`}
                  loadingText="…"
                  onClick={onMarkDone}
                  className="h-7 gap-1 px-2.5 text-[11px]"
                >
                  <CheckCircle2 className="h-3 w-3" />
                  Mark done
                </LoadingButton>
              </>
            )}
            {ws === "on_hold" && (
              <LoadingButton
                size="sm"
                loading={busyKey === `resume:${concept.id}`}
                loadingText="…"
                onClick={onResume}
                className="h-7 gap-1 px-2.5 text-[11px]"
              >
                <Play className="h-3 w-3" />
                Resume
              </LoadingButton>
            )}
            {ws === "changes_requested" && (
              <LoadingButton
                size="sm"
                loading={busyKey === `start_changes:${concept.id}`}
                loadingText="…"
                onClick={onStartChanges}
                className="h-7 gap-1 px-2.5 text-[11px]"
              >
                <PlayCircle className="h-3 w-3" />
                Start changes
              </LoadingButton>
            )}
            {ws === "in_revision" && (
              <Badge className="border border-destructive/30 bg-destructive/10 text-destructive text-[10px]">
                {WORK_STATUS_LABELS.in_revision}
              </Badge>
            )}
            {ws === "completed" && (
              <Badge className="border border-success/30 bg-success/10 text-success text-[10px]">
                <CheckCircle2 className="mr-1 h-3 w-3" />
                {WORK_STATUS_LABELS.completed}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function groupByWorkStatus(
  concepts: ConceptWithRelations[]
): Record<ConceptWorkStatus, ConceptWithRelations[]> {
  const out: Record<ConceptWorkStatus, ConceptWithRelations[]> = {
    not_started: [],
    in_progress: [],
    on_hold: [],
    done_partial: [],
    in_revision: [],
    changes_requested: [],
    completed: [],
  };
  for (const c of concepts) {
    if (c.md_status !== "approved") continue;
    const ws = c.work_status;
    if (ws in out) out[ws].push(c);
  }
  return out;
}
