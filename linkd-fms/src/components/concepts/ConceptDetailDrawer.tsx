import { useEffect, useState } from "react";
import {
  Check,
  RotateCcw,
  X,
  Loader2,
  User,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowRight,
  Palette,
  Building2,
  CalendarDays,
  Tag,
  Layers,
} from "lucide-react";
import { differenceInDays, format, parseISO } from "date-fns";
import { toast } from "@/components/ui";
import type { CompletionHistoryEntry } from "@/types/database";
// The concept detail surface is now a centered modal (was a right-side
// drawer). Keeps the existing Dialog* helpers used by Hold / Suggest-Changes
// inner dialogs — no extra primitives needed.
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  getInitials,
} from "@/components/ui/avatar";
import { ConceptImage } from "@/components/ui/ConceptImage";
import { useAuth } from "@/hooks/useAuth";
import { VoiceFeedback } from "@/components/ui/VoiceFeedback";
import { FeedbackDisplay } from "@/components/ui/FeedbackDisplay";
import { MarkDoneDialog } from "@/components/concepts/MarkDoneDialog";
import {
  CONCEPT_STATUS_LABELS,
  CONCEPT_STATUS_COLORS,
  WORK_STATUS_LABELS,
  WORK_STATUS_COLORS,
} from "@/lib/constants";
import {
  cn,
  formatDate,
  parseIntervalSeconds,
  formatDuration,
} from "@/lib/utils";
import type {
  ConceptStatus,
  ConceptWithRelations,
  UserRole,
} from "@/types/database";
import type { ReviewInput, MutationResult } from "@/hooks/useConcepts";
import type { Concept } from "@/types/database";
import {
  Pause,
  Play,
  PlayCircle,
  Hourglass,
  Send,
  ThumbsUp,
  PencilLine,
  AlertTriangle,
  ChevronDown,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { LoadingButton } from "@/components/ui/LoadingButton";

function isAdminRole(role: UserRole | null | undefined): boolean {
  return role === "admin" || role === "design_coordinator";
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return format(parseISO(d), "dd MMM yyyy");
  } catch {
    return "—";
  }
}

function delayDays(planned: string | null, actual: string | null): number | null {
  if (!planned || !actual) return null;
  try {
    return differenceInDays(parseISO(actual), parseISO(planned));
  } catch {
    return null;
  }
}

// ============================================================================
// Pipeline stage config
// ============================================================================

type StageKey = "creation" | "approval" | "completion" | "final";

interface StageConfig {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

const STAGES: Record<StageKey, StageConfig> = {
  creation: {
    label: "Concept Creation",
    color: "text-primary",
    bgColor: "bg-primary",
    borderColor: "border-primary",
  },
  approval: {
    label: "MD Approval",
    color: "text-[#7C5CFC]",
    bgColor: "bg-[#7C5CFC]",
    borderColor: "border-[#7C5CFC]",
  },
  completion: {
    label: "Designer Completion",
    color: "text-success",
    bgColor: "bg-success",
    borderColor: "border-success",
  },
  final: {
    label: "Final Approval",
    color: "text-warning",
    bgColor: "bg-warning",
    borderColor: "border-warning",
  },
};

function getStageStatus(
  concept: ConceptWithRelations,
  stage: StageKey
): "done" | "active" | "upcoming" | "blocked" {
  switch (stage) {
    case "creation":
      return "done"; // always done if concept exists
    case "approval":
      if (concept.md_status === "approved") return "done";
      if (concept.md_status === "rejected") return "blocked";
      if (concept.md_status === "revision_requested") return "active";
      return "active"; // pending
    case "completion":
      if (concept.designer_actual_date) return "done";
      if (concept.md_status === "approved") return "active";
      return "upcoming";
    case "final":
      if (concept.final_approved_at) return "done";
      if (concept.designer_actual_date) return "active";
      return "upcoming";
  }
}

// ============================================================================
// Props
// ============================================================================

interface FinalApproveInput {
  notes?: string | null;
  approved_designs_count?: number | null;
}

interface Props {
  concept: ConceptWithRelations | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onReview: (
    id: string,
    input: ReviewInput
  ) => Promise<{ error: string | null }>;
  onFinalize: (id: string) => Promise<{ error: string | null }>;
  onFinalApprove?: (
    id: string,
    input?: FinalApproveInput
  ) => Promise<{ error: string | null }>;
  onFinalRevise?: (
    id: string,
    notes?: string | null
  ) => Promise<{ error: string | null }>;
  onResubmit?: (id: string) => Promise<{ error: string | null }>;
  /** Designer re-submits after MD asked for revision on the initial concept.
   *  Opens the ResubmitConceptDialog where the designer uploads revised
   *  file(s) and optionally notes what they changed — that dialog calls
   *  the resubmitForReview mutation. The drawer just signals "user wants
   *  to start the re-submit flow". */
  onOpenResubmitForReview?: (concept: ConceptWithRelations) => void;
  // Work-status lifecycle (0025/0026)
  onStart?: (id: string) => Promise<MutationResult<Concept>>;
  onHold?: (
    id: string,
    reason?: string | null
  ) => Promise<MutationResult<Concept>>;
  onResume?: (id: string) => Promise<MutationResult<Concept>>;
  onMarkDone?: (id: string, options?: { newFiles?: string[]; notes?: string }) => Promise<MutationResult<Concept>>;
  onApproveDesign?: (
    id: string,
    approvedDesignsCount?: number | null
  ) => Promise<MutationResult<Concept>>;
  onSuggestChanges?: (
    id: string,
    feedback: string
  ) => Promise<MutationResult<Concept>>;
  onStartChanges?: (id: string) => Promise<MutationResult<Concept>>;
}

// ============================================================================
// Main component
// ============================================================================

export function ConceptDetailDrawer({
  concept,
  open,
  onOpenChange,
  onReview,
  onFinalize,
  onFinalApprove,
  onFinalRevise,
  onResubmit,
  onOpenResubmitForReview,
  onStart,
  onHold,
  onResume,
  onMarkDone,
  onApproveDesign,
  onSuggestChanges,
  onStartChanges,
}: Props) {
  const { profile } = useAuth();
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewAudioUrl, setReviewAudioUrl] = useState<string | null>(null);
  const [finalNotes, setFinalNotes] = useState("");
  // Storage path for the audio recorded in the Final Approval revision form.
  // Set by VoiceFeedback's onAudioUrl callback after upload; appended to the
  // submitted notes so the recipient can play it back and the activity log
  // keeps both transcript + audio side-by-side.
  const [finalAudioUrl, setFinalAudioUrl] = useState<string | null>(null);
  const [approvedCount, setApprovedCount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  // Work-status lifecycle dialogs
  const [holdOpen, setHoldOpen] = useState(false);
  const [markDoneOpen, setMarkDoneOpen] = useState(false);
  const [holdReason, setHoldReason] = useState("");
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestFeedback, setSuggestFeedback] = useState("");
  // Same idea for the standalone "Suggest changes" dialog.
  const [suggestAudioUrl, setSuggestAudioUrl] = useState<string | null>(null);

  if (!concept) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-3xl" srTitle="Concept details" />
      </Dialog>
    );
  }

  const isAdmin = isAdminRole(profile?.role);
  const isMine =
    profile?.id === concept.submitted_by ||
    profile?.id === concept.designer_id;
  const canReview = isAdmin && concept.md_status === "pending";
  // Admin can only re-review AFTER the designer re-submits (status flips
  // back to "pending"). While status is "revision_requested" the ball is
  // with the designer — hide the review buttons so admins don't double-click.
  const canRequestRevisionReview = false;
  const canFinalize =
    isMine &&
    concept.md_status === "approved" &&
    !concept.designer_actual_date;
  // Admin can approve/revise ONLY when work is submitted for review (in_revision)
  // AND no pending feedback exists (if feedback exists, the ball is with designer)
  const hasPendingFeedback = !!(concept.md_feedback || concept.final_approval_notes);
  const canFinalApprove =
    isAdmin &&
    !!concept.designer_actual_date &&
    !concept.final_approved_at &&
    concept.work_status === "in_revision" &&
    !hasPendingFeedback;

  const submitter = concept.submitter ?? concept.designer;

  // Handlers
  async function handleReview(status: ReviewInput["status"]) {
    if (voiceBusy) {
      toast.error("Please wait — audio is still processing");
      return;
    }
    setBusy(status);
    const feedbackText = reviewAudioUrl
      ? `${reviewNotes || ""}\n\n🎙 Voice feedback: ${reviewAudioUrl}`.trim()
      : reviewNotes || null;
    console.log("[Review] Sending feedback:", { status, hasAudio: !!reviewAudioUrl, textLength: feedbackText?.length, feedbackText });
    const { error } = await onReview(concept!.id, {
      status,
      notes: feedbackText,
    });
    setBusy(null);
    if (error) return void toast.error(error);
    toast.success(`Marked as ${CONCEPT_STATUS_LABELS[status]}`);
    setReviewNotes("");
    setReviewAudioUrl(null);
    onOpenChange(false);
  }

  async function handleFinalize() {
    setBusy("finalize");
    const { error } = await onFinalize(concept!.id);
    setBusy(null);
    if (error) return void toast.error(error);
    toast.success("Marked as completed");
    onOpenChange(false);
  }

  async function handleFinalApprove() {
    if (!onFinalApprove) return;
    setBusy("final_approve");
    const { error } = await onFinalApprove(concept!.id, {
      notes: finalNotes || null,
      approved_designs_count: approvedCount
        ? parseInt(approvedCount, 10)
        : null,
    });
    setBusy(null);
    if (error) return void toast.error(error);
    toast.success("Final approval granted");
    setFinalNotes("");
    setApprovedCount("");
    onOpenChange(false);
  }

  async function handleFinalRevise() {
    if (!onFinalRevise) return;
    setBusy("final_revise");
    // Pack the transcript and the audio path into a single string so both
    // get persisted on `final_approval_notes`. FeedbackDisplay splits them
    // back out at read time — text shown as prose, audio shown as a player.
    // Same envelope the initial-review path at handleReview() uses.
    const payload = finalAudioUrl
      ? `${finalNotes || ""}\n\n🎙 Voice feedback: ${finalAudioUrl}`.trim()
      : finalNotes || null;
    const { error } = await onFinalRevise(concept!.id, payload);
    setBusy(null);
    if (error) return void toast.error(error);
    toast.success("Revision feedback sent");
    setFinalNotes("");
    setFinalAudioUrl(null);
    onOpenChange(false);
  }

  /** Designer re-submits an initial concept after MD requested revision.
   *  Opens the ResubmitConceptDialog (in ConceptsView) where the designer
   *  uploads revised file(s) + optional notes — that dialog owns the
   *  mutation call. We just close the drawer so the dialog gets focus. */
  function handleOpenResubmit() {
    if (!onOpenResubmitForReview || !concept) return;
    onOpenResubmitForReview(concept);
    onOpenChange(false);
  }

  async function handleResubmit() {
    if (!onResubmit) return;
    setBusy("resubmit");
    const { error } = await onResubmit(concept!.id);
    setBusy(null);
    if (error) return void toast.error(error);
    toast.success("Re-submitted for final approval");
    onOpenChange(false);
  }

  // ────── Work-status lifecycle handlers ──────
  // Every handler short-circuits when `busy !== null` — defense in depth
  // against rapid double-clicks before React applies the disabled state
  // to the LoadingButton. The visual disabled style takes care of intent;
  // the guard takes care of the rare race window.
  async function handleStart() {
    if (!onStart || busy !== null) return;
    setBusy("start");
    const { error } = await onStart(concept!.id);
    setBusy(null);
    if (error) return void toast.error(error);
    toast.success("You're now working on this concept");
  }

  async function handleHoldSubmit() {
    if (!onHold || busy !== null) return;
    setBusy("hold");
    const { error } = await onHold(concept!.id, holdReason || null);
    setBusy(null);
    if (error) return void toast.error(error);
    toast.success("Concept put on hold");
    setHoldReason("");
    setHoldOpen(false);
  }

  async function handleResume() {
    if (!onResume || busy !== null) return;
    setBusy("resume");
    const { error } = await onResume(concept!.id);
    setBusy(null);
    if (error) return void toast.error(error);
    toast.success("Resumed — back to work");
  }

  function handleMarkDone() {
    if (!onMarkDone || busy !== null) return;
    setMarkDoneOpen(true);
  }

  async function handleMarkDoneSubmit(
    conceptId: string,
    options?: { newFiles?: string[]; notes?: string }
  ) {
    if (!onMarkDone) return { data: null, error: "Not available" } as const;
    const result = await onMarkDone(conceptId, options);
    if (!result.error) {
      onOpenChange(false);
    }
    return result;
  }

  async function handleApproveDesign() {
    if (!onApproveDesign || busy !== null) return;
    // Use the same `approvedCount` state that the legacy final-approval card
    // already binds to. If the user typed a number, send it; otherwise null
    // (and the mutation leaves any prior value in place).
    const parsed =
      approvedCount.trim() === "" ? null : parseInt(approvedCount, 10);
    if (parsed !== null && (Number.isNaN(parsed) || parsed < 0)) {
      toast.error("Approved designs count must be 0 or more");
      return;
    }
    if (
      parsed !== null &&
      concept!.designs_count !== null &&
      concept!.designs_count !== undefined &&
      parsed > concept!.designs_count
    ) {
      toast.error(
        `Can't approve more than ${concept!.designs_count} (designer submitted ${concept!.designs_count})`
      );
      return;
    }
    setBusy("approve_design");
    const { error } = await onApproveDesign(concept!.id, parsed);
    setBusy(null);
    if (error) return void toast.error(error);
    toast.success("Design approved — concept completed");
    setApprovedCount("");
    onOpenChange(false);
  }

  async function handleSuggestChangesSubmit() {
    if (!onSuggestChanges || busy !== null) return;
    setBusy("suggest_changes");
    // Same audio + transcript envelope as handleReview / handleFinalRevise
    // so FeedbackDisplay can render the saved log entry with the transcript
    // as prose and the audio as an inline player.
    const payload = suggestAudioUrl
      ? `${suggestFeedback || ""}\n\n🎙 Voice feedback: ${suggestAudioUrl}`.trim()
      : suggestFeedback;
    const { error } = await onSuggestChanges(concept!.id, payload);
    setBusy(null);
    if (error) return void toast.error(error);
    toast.success("Feedback sent to designer");
    setSuggestFeedback("");
    setSuggestAudioUrl(null);
    setSuggestOpen(false);
  }

  async function handleStartChanges() {
    if (!onStartChanges || busy !== null) return;
    setBusy("start_changes");
    const { error } = await onStartChanges(concept!.id);
    setBusy(null);
    if (error) return void toast.error(error);
    toast.success("Working on the requested changes");
  }

  // Work-status capability gates. Designer can act on their own concept;
  // admin / coordinator can act on behalf of the designer (e.g. unsticking a
  // held concept while the designer is unavailable). `isMine` covers both
  // submitted_by and designer_id; `isAdmin` here = admin OR coordinator.
  const ws = concept.work_status;
  const showWorkActions = concept.md_status === "approved";
  const canDriveWork = isMine || isAdmin;
  const canStart = !!onStart && canDriveWork && ws === "not_started";
  const canHold = !!onHold && canDriveWork && ws === "in_progress";
  const canResume = !!onResume && canDriveWork && ws === "on_hold";
  const canMarkDone = !!onMarkDone && canDriveWork && ws === "in_progress";
  const canStartChanges =
    !!onStartChanges && canDriveWork && ws === "changes_requested";
  const canReviewDesign = isAdmin && ws === "in_revision";

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[98vh] min-h-[85vh] w-[95vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* ── Header (sticky, shows code + status pills + title + pipeline) ──
             The Dialog primitive renders its own X close button at top-right;
             we add right padding to keep the title from colliding with it. */}
        <div className="shrink-0 border-b border-primary/15 bg-gradient-to-br from-primary/10 via-primary/[0.04] to-card px-5 pb-3 pr-12 pt-4">
          <DialogHeader className="space-y-1 border-0 p-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge className="border border-primary/20 bg-primary/10 font-mono text-[9px] font-medium text-primary">
                {concept.concept_code}
              </Badge>
              <Badge
                className={cn(
                  "text-[9px]",
                  CONCEPT_STATUS_COLORS[concept.md_status]
                )}
              >
                {CONCEPT_STATUS_LABELS[concept.md_status]}
              </Badge>
              {showWorkActions && (
                <Badge
                  className={cn(
                    "text-[9px]",
                    WORK_STATUS_COLORS[concept.work_status]
                  )}
                >
                  {WORK_STATUS_LABELS[concept.work_status]}
                </Badge>
              )}
              {concept.priority === "urgent" && (
                <Badge className="bg-destructive/15 text-destructive text-[9px] ring-1 ring-inset ring-destructive/30">
                  Urgent
                </Badge>
              )}
            </div>
            <DialogTitle className="text-base font-semibold leading-tight tracking-tight">
              {concept.title}
            </DialogTitle>
          </DialogHeader>

          {/* ── Pipeline progress bar ── */}
          <div className="mt-3 flex items-center gap-0.5">
            {(["creation", "approval", "completion", "final"] as StageKey[]).map(
              (stage, i) => {
                const status = getStageStatus(concept, stage);
                const cfg = STAGES[stage];
                return (
                  <div key={stage} className="flex flex-1 items-center gap-0.5">
                    <div
                      className={cn(
                        "h-1 flex-1 rounded-full transition-all",
                        status === "done" && cfg.bgColor,
                        status === "active" &&
                          `${cfg.bgColor} animate-pulse opacity-70`,
                        status === "blocked" && "bg-destructive",
                        status === "upcoming" && "bg-border"
                      )}
                    />
                    {i < 3 && (
                      <ArrowRight className="h-2.5 w-2.5 shrink-0 text-muted-foreground/30" />
                    )}
                  </div>
                );
              }
            )}
          </div>
          <div className="mt-1 flex text-[8px] uppercase tracking-wider text-muted-foreground">
            {(["creation", "approval", "completion", "final"] as StageKey[]).map(
              (stage) => (
                <span key={stage} className="flex-1 text-center">
                  {STAGES[stage].label.split(" ")[0]}
                </span>
              )
            )}
          </div>
        </div>

        {/* ── Scrollable body — fills remaining dialog height, internal
             scroll so the sticky header stays put. ── */}
        <div className="flex-1 overflow-y-auto">

        {/* Design review actions moved entirely into Stage 4 (Final Approval)
             to avoid duplicate UI. The top-level panel is removed. */}

        {/* ── Body ── */}
        <div className="space-y-0 pb-4">
          {/* ═══════ STAGE 1: Concept Creation ═══════ */}
          <StageSection stage="creation" concept={concept}>
            {/* Details grid */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              <DetailItem
                icon={<User className="h-3.5 w-3.5" />}
                label="Designer"
              >
                {submitter ? (
                  <div className="flex items-center gap-1.5">
                    <Avatar className="h-5 w-5 ring-1 ring-border">
                      {submitter.avatar_url ? (
                        <AvatarImage src={submitter.avatar_url} />
                      ) : null}
                      <AvatarFallback className="text-[7px]">
                        {getInitials(submitter.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">
                      {submitter.full_name}
                    </span>
                  </div>
                ) : (
                  "—"
                )}
              </DetailItem>

              <DetailItem
                icon={<CalendarDays className="h-3.5 w-3.5" />}
                label="Start Date"
              >
                {fmtDate(concept.start_date ?? concept.created_at)}
              </DetailItem>

              <DetailItem
                icon={<Building2 className="h-3.5 w-3.5" />}
                label="Party Name"
              >
                {concept.client?.party_name || "—"}
              </DetailItem>

              <DetailItem
                icon={<Tag className="h-3.5 w-3.5" />}
                label="Assigned By"
              >
                {concept.assigned_by || "—"}
              </DetailItem>

              {/* Designs in this concept — denominator at final approval.
                  Hidden for pre-0028 rows that don't have the field set. */}
              {concept.designs_count != null && (
                <DetailItem
                  icon={<Layers className="h-3.5 w-3.5" />}
                  label="Designs in Concept"
                >
                  <span className="font-semibold tabular-nums">
                    {concept.designs_count}
                  </span>
                </DetailItem>
              )}
            </div>

            {/* Image */}
            <ConceptImage
              src={concept.image_url}
              alt={concept.title}
              className="mt-3 h-56 w-full rounded-lg border border-border"
              showDownload
            />

            {/* Description */}
            {concept.description && (
              <div className="mt-3 rounded-lg bg-secondary/50 p-3 text-sm leading-relaxed text-foreground">
                {concept.description}
              </div>
            )}

            {concept.remarks && (
              <DetailItem
                icon={<FileText className="h-3.5 w-3.5" />}
                label="Remarks"
                className="mt-3"
              >
                {concept.remarks}
              </DetailItem>
            )}
          </StageSection>

          {/* ═══════ STAGE 2: MD Approval ═══════ */}
          <StageSection stage="approval" concept={concept}>
            {/* Timeline info */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              <DetailItem
                icon={<Clock className="h-3.5 w-3.5" />}
                label="Planned Review"
              >
                {fmtDate(concept.md_planned_date)}
              </DetailItem>
              <DetailItem
                icon={<CalendarDays className="h-3.5 w-3.5" />}
                label="Actual Review"
              >
                <span>{fmtDate(concept.md_actual_date)}</span>
                {(() => {
                  const d = delayDays(
                    concept.md_planned_date,
                    concept.md_actual_date
                  );
                  if (d === null) return null;
                  return d <= 0 ? (
                    <span className="ml-1.5 text-[10px] font-medium text-success">
                      On time
                    </span>
                  ) : (
                    <span className="ml-1.5 text-[10px] font-medium text-destructive">
                      +{d}d late
                    </span>
                  );
                })()}
              </DetailItem>
            </div>

            {/* Status result */}
            {concept.md_status !== "pending" && (
              <div
                className={cn(
                  "mt-3 flex items-center gap-2 rounded-lg p-3 text-sm font-medium",
                  concept.md_status === "approved" &&
                    "bg-success/10 text-success",
                  concept.md_status === "rejected" &&
                    "bg-destructive/10 text-destructive",
                  concept.md_status === "revision_requested" &&
                    "bg-warning/10 text-warning"
                )}
              >
                {concept.md_status === "approved" && (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {concept.md_status === "rejected" && (
                  <XCircle className="h-4 w-4" />
                )}
                {concept.md_status === "revision_requested" && (
                  <AlertCircle className="h-4 w-4" />
                )}
                {concept.md_status === "approved" && "Approved by MD"}
                {concept.md_status === "rejected" && "Rejected by MD"}
                {concept.md_status === "revision_requested" &&
                  "Revision Requested"}
                {concept.reviewer && (
                  <span className="ml-auto flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                    <Avatar className="h-4 w-4">
                      {concept.reviewer.avatar_url ? (
                        <AvatarImage src={concept.reviewer.avatar_url} />
                      ) : null}
                      <AvatarFallback className="text-[7px]">
                        {getInitials(concept.reviewer.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    {concept.reviewer.full_name}
                    {concept.md_reviewed_at && (
                      <> · {fmtDate(concept.md_reviewed_at)}</>
                    )}
                  </span>
                )}
              </div>
            )}

            {/* MD notes */}
            {concept.md_notes && (
              <div className="mt-2 rounded-lg border border-border bg-card p-3">
                <FeedbackDisplay text={concept.md_notes} />
              </div>
            )}

            {/* ── Designer's resubmit surface ──
                 When MD has asked for revision on the initial submission
                 (md_status='revision_requested'), the designer's only
                 next step is to address the feedback and re-submit. This
                 panel sits inside Stage 2 because that's where the
                 revision verdict landed; the designer needs to act on it
                 here, not in the post-approval lifecycle below. */}
            {concept.md_status === "revision_requested" &&
              isMine &&
              onOpenResubmitForReview && (
                <div className="mt-3 rounded-lg border border-warning/30 bg-warning/5 p-4">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-warning">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Your action: revise the file and re-submit
                  </p>
                  <p className="mb-3 text-[11px] text-muted-foreground">
                    The next screen lets you upload the revised file(s) and
                    optionally note what you changed. Ma'am's feedback above
                    stays available there too.
                  </p>
                  <Button
                    size="sm"
                    onClick={handleOpenResubmit}
                    className="w-full gap-1.5"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Re-submit for review
                  </Button>
                </div>
              )}

            {/* ── Admin: waiting for designer to revise ── */}
            {isAdmin && concept.md_status === "revision_requested" && (
              <div className="mt-3 rounded-lg border border-warning/30 bg-warning/5 p-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-warning">
                  <Clock className="h-3.5 w-3.5" />
                  Waiting for designer to revise and re-submit
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  The review buttons will reappear once the designer uploads the revised files.
                </p>
              </div>
            )}

            {/* ── Action: Review (pending concepts) ── */}
            {canReview && (
              <div className="mt-3 space-y-3 rounded-lg border border-border bg-card p-4">
                <p className="text-xs font-medium text-foreground">
                  This concept is awaiting your review.
                </p>
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Feedback <span className="font-normal text-muted-foreground">(type or record voice)</span>
                  </Label>
                  <VoiceFeedback
                    value={reviewNotes}
                    onChange={setReviewNotes}
                    onAudioUrl={setReviewAudioUrl}
                    onBusyChange={setVoiceBusy}
                    placeholder="Type feedback or tap 🎤 to record voice…"
                    disabled={busy !== null}
                    rows={2}
                  />
                </div>
                {voiceBusy && (
                  <p className="flex items-center gap-1.5 rounded-md border border-warning/30 bg-warning/5 px-2.5 py-1.5 text-[11px] text-warning">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Recording in progress — stop recording before submitting
                  </p>
                )}
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleReview("approved")}
                    disabled={busy !== null || voiceBusy}
                    size="sm"
                    className="flex-1 gap-1.5"
                  >
                    {busy === "approved" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    Approve
                  </Button>
                  <Button
                    onClick={() => handleReview("revision_requested")}
                    disabled={busy !== null || voiceBusy}
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-1.5"
                  >
                    {busy === "revision_requested" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5" />
                    )}
                    Revision
                  </Button>
                  <Button
                    onClick={() => handleReview("rejected")}
                    disabled={busy !== null || voiceBusy}
                    variant="destructive"
                    size="sm"
                    className="gap-1.5"
                  >
                    {busy === "rejected" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <X className="h-3.5 w-3.5" />
                    )}
                    Reject
                  </Button>
                </div>
              </div>
            )}
          </StageSection>

          {/* ═══════ STAGE 3: Designer Completion ═══════ */}
          <StageSection stage="completion" concept={concept}>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              <DetailItem
                icon={<Clock className="h-3.5 w-3.5" />}
                label="Planned Completion"
              >
                {fmtDate(concept.designer_planned_date)}
              </DetailItem>
              <DetailItem
                icon={<CalendarDays className="h-3.5 w-3.5" />}
                label="Actual Completion"
              >
                <span>{fmtDate(concept.designer_actual_date)}</span>
                {(() => {
                  const d = delayDays(
                    concept.designer_planned_date,
                    concept.designer_actual_date
                  );
                  if (d === null) return null;
                  return d <= 0 ? (
                    <span className="ml-1.5 text-[10px] font-medium text-success">
                      On time
                    </span>
                  ) : (
                    <span className="ml-1.5 text-[10px] font-medium text-destructive">
                      +{d}d late
                    </span>
                  );
                })()}
              </DetailItem>
            </div>

            {/* ── Lifecycle-driven content. State decides what shows; legacy
                 fields are read-only. The old "Mark as Completed" button
                 here bypassed the lifecycle and let designers complete
                 without ever starting — removed. ── */}
            {concept.md_status !== "approved" ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {concept.md_status === "pending"
                  ? "Waiting for MD approval before this stage begins."
                  : concept.md_status === "rejected"
                    ? "This concept was rejected — no further work."
                    : "Needs MD approval before completion can begin."}
              </p>
            ) : (
              <>
                {/* Status banner — tells the user exactly what state the
                     concept is in right now, no ambiguity. `revision_count`
                     drives rework-vs-first-pass copy below: `>= 1` means
                     the designer is back working on MD's feedback. */}
                <div className="mt-3">
                  {/* Fallback for not_started — happens on legacy rows that
                       pre-date the 0029 auto-start trigger and pre-date the
                       client-side mirror in reviewConcept. New approvals
                       skip this state entirely. */}
                  {concept.work_status === "not_started" && (
                    <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm">
                      <Clock className="h-4 w-4 text-primary" />
                      <span className="font-medium text-foreground">
                        Ready to start
                      </span>
                      <span className="ml-auto text-[11px] text-muted-foreground">
                        Click Start working to log your kickoff
                      </span>
                    </div>
                  )}
                  {concept.work_status === "in_progress" &&
                    (concept.revision_count ?? 0) === 0 && (
                      <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
                        <div className="flex items-center gap-2 text-sm">
                          <PlayCircle className="h-4 w-4 text-primary" />
                          <span className="font-medium text-foreground">
                            Working now
                          </span>
                          {concept.work_started_at && (
                            <span className="ml-auto text-[11px] text-muted-foreground">
                              Started {fmtDate(concept.work_started_at)}
                            </span>
                          )}
                        </div>
                        {/* Hold history sub-line — only shows once the designer
                             has been on hold at least once, so the badge isn't
                             noise on a clean first-pass row. Includes the most
                             recent resume date for quick context. */}
                        {(concept.hold_count ?? 0) > 0 && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Pause className="h-3 w-3" />
                              Held {concept.hold_count}× · {formatDuration(parseIntervalSeconds(concept.total_hold_duration))} total
                            </span>
                            {concept.work_resumed_at && (
                              <span className="inline-flex items-center gap-1">
                                <Play className="h-3 w-3" />
                                Resumed {fmtDate(concept.work_resumed_at)}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  {/* Rework banner — designer reworking MD's feedback. We
                       keep the feedback inline so it stays referenceable
                       while they're working. */}
                  {concept.work_status === "in_progress" &&
                    (concept.revision_count ?? 0) >= 1 && (
                      <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5">
                        <div className="flex items-center gap-2 text-sm font-medium text-warning">
                          <RotateCcw className="h-4 w-4" />
                          Reworking — round {(concept.revision_count ?? 0) + 1}
                        </div>
                        {concept.md_feedback && (
                          <div className="mt-1">
                            <FeedbackDisplay text={concept.md_feedback} />
                          </div>
                        )}
                      </div>
                    )}
                  {concept.work_status === "on_hold" && (() => {
                    // Live duration of the current hold = now - work_held_at.
                    // total_hold_duration only includes previously-ended holds;
                    // we add the current sliver client-side so the display
                    // reads "current hold of N days · X total" without
                    // touching the DB until resume.
                    const heldAt = concept.work_held_at
                      ? new Date(concept.work_held_at).getTime()
                      : null;
                    const currentHoldSec = heldAt
                      ? Math.max(0, Math.floor((Date.now() - heldAt) / 1000))
                      : 0;
                    const priorTotalSec = parseIntervalSeconds(
                      concept.total_hold_duration
                    );
                    const cumulativeSec = priorTotalSec + currentHoldSec;
                    const isRepeatHold = (concept.hold_count ?? 0) > 1;
                    return (
                      <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5">
                        <div className="flex items-center gap-2 text-sm font-medium text-warning">
                          <Pause className="h-4 w-4" />
                          On hold
                          {heldAt && (
                            <span className="ml-auto text-[11px] font-normal text-muted-foreground">
                              Held {formatDuration(currentHoldSec)} so far
                            </span>
                          )}
                        </div>
                        {concept.hold_reason && (
                          <p className="mt-1 text-xs italic text-foreground">
                            "{concept.hold_reason}"
                          </p>
                        )}
                        {/* Date trail — when the current hold started, and (if
                             this isn't the first) the cumulative hold time. */}
                        {(heldAt || isRepeatHold) && (
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                            {heldAt && (
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Held since {formatDate(concept.work_held_at)}
                              </span>
                            )}
                            {isRepeatHold && (
                              <span className="inline-flex items-center gap-1">
                                <RotateCcw className="h-3 w-3" />
                                Hold #{concept.hold_count} · {formatDuration(cumulativeSec)} cumulative
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {concept.work_status === "in_revision" && (
                    <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm font-medium text-destructive">
                      <Hourglass className="h-4 w-4" />
                      {(concept.revision_count ?? 0) > 1
                        ? `Changes submitted — awaiting MD review (round ${concept.revision_count})`
                        : "Sent for MD review — awaiting verdict"}
                    </div>
                  )}
                  {/* `changes_requested` collapsed into `in_progress` via
                       0030 — the rework banner above (revision_count >= 1)
                       carries MD's feedback inline. Kept this branch only
                       as a defensive fallback for pre-0030 legacy rows. */}
                  {concept.work_status === "changes_requested" && (
                    <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5">
                      <div className="flex items-center gap-2 text-sm font-medium text-warning">
                        <AlertTriangle className="h-4 w-4" />
                        Reworking — Ma'am's feedback
                      </div>
                      {concept.md_feedback && (
                        <div className="mt-1">
                          <FeedbackDisplay text={concept.md_feedback} />
                        </div>
                      )}
                    </div>
                  )}
                  {concept.work_status === "completed" && (
                    <div className="flex items-center gap-2 rounded-lg bg-success/10 p-3 text-sm font-medium text-success">
                      <CheckCircle2 className="h-4 w-4" />
                      Completed by designer
                      {concept.work_completed_at && (
                        <span className="ml-auto text-[11px] font-normal text-muted-foreground">
                          {fmtDate(concept.work_completed_at)}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Inline lifecycle actions — single decisive surface so
                     the user always knows the next step. Each button is
                     gated by both work_status AND ownership; admins and
                     coordinators can drive the lifecycle on behalf of the
                     designer (matches canDriveWork = isMine || isAdmin
                     above), so a held concept never gets stuck just
                     because the designer is offline. */}
                {canDriveWork && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {/* Start working — fallback for legacy not_started rows.
                         New approvals auto-start so this rarely shows in
                         practice. Each action button also disables when ANY
                         other action is busy (`disabled={busy !== null}`)
                         so sibling buttons can't fire mid-mutation. The
                         disabled override classes make the inactive state
                         unmistakably grey instead of just "dim coloured". */}
                    {canStart && (
                      <LoadingButton
                        size="sm"
                        loading={busy === "start"}
                        loadingText="Starting…"
                        onClick={handleStart}
                        disabled={busy !== null && busy !== "start"}
                        className="gap-1.5 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:cursor-not-allowed"
                      >
                        <PlayCircle className="h-3.5 w-3.5" />
                        Start working
                      </LoadingButton>
                    )}
                    {canHold && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setHoldOpen(true)}
                        disabled={busy !== null}
                        className="gap-1.5 disabled:bg-muted/30 disabled:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-100"
                      >
                        <Pause className="h-3.5 w-3.5" />
                        Hold
                      </Button>
                    )}
                    {canResume && (
                      <LoadingButton
                        size="sm"
                        loading={busy === "resume"}
                        loadingText="Resuming…"
                        onClick={handleResume}
                        disabled={busy !== null && busy !== "resume"}
                        className="gap-1.5 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:cursor-not-allowed"
                      >
                        <Play className="h-3.5 w-3.5" />
                        Resume
                      </LoadingButton>
                    )}
                    {canMarkDone && (
                      <LoadingButton
                        size="sm"
                        loading={busy === "mark_done"}
                        loadingText="Sending…"
                        onClick={handleMarkDone}
                        disabled={busy !== null && busy !== "mark_done"}
                        className="ml-auto gap-1.5 bg-success text-white hover:bg-success/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:cursor-not-allowed"
                      >
                        {(concept.revision_count ?? 0) >= 1 ? (
                          <>
                            <Send className="h-3.5 w-3.5" />
                            Submit changes
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Mark as Done
                          </>
                        )}
                      </LoadingButton>
                    )}
                    {canStartChanges && (
                      <LoadingButton
                        size="sm"
                        loading={busy === "start_changes"}
                        loadingText="Starting…"
                        onClick={handleStartChanges}
                        disabled={busy !== null && busy !== "start_changes"}
                        className="ml-auto gap-1.5 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:cursor-not-allowed"
                      >
                        <PlayCircle className="h-3.5 w-3.5" />
                        Start changes
                      </LoadingButton>
                    )}
                  </div>
                )}
              </>
            )}
          </StageSection>

          {/* ═══════ STAGE 4: Final Approval ═══════ */}
          <StageSection stage="final" concept={concept} last>
            {concept.final_approved_at ? (
              /* ── Done: Final approval granted ── */
              <>
                <div className="flex items-center gap-2 rounded-lg bg-success/10 p-3 text-sm font-medium text-success">
                  <CheckCircle2 className="h-4 w-4" />
                  Final Approval Granted
                  <span className="ml-auto text-xs font-normal text-muted-foreground">
                    {fmtDate(concept.final_approved_at)}
                  </span>
                </div>
                {(concept.approved_designs_count != null || concept.final_approval_notes) && (
                  <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
                    {concept.approved_designs_count != null && (
                      <DetailItem
                        icon={<Palette className="h-3.5 w-3.5" />}
                        label="Approved Designs"
                      >
                        <span className="text-lg font-bold tabular-nums">
                          {concept.approved_designs_count}
                        </span>
                      </DetailItem>
                    )}
                  </div>
                )}
                {concept.final_approval_notes && (
                  <div className="mt-2 rounded-lg border border-border bg-card p-3">
                    <FeedbackDisplay text={concept.final_approval_notes} />
                  </div>
                )}
              </>
            ) : concept.designer_actual_date ? (
              /* ── Active: Final review lifecycle ── */
              <>
                {/* Round indicator */}
                {(concept.revision_count ?? 0) > 0 && (
                  <div className="mb-2 flex items-center gap-2">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-primary">
                      Round {(concept.revision_count ?? 0) + 1}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {concept.revision_count} revision{(concept.revision_count ?? 0) > 1 ? "s" : ""} so far
                    </span>
                  </div>
                )}

                {/* State: Waiting for designer to revise */}
                {concept.work_status === "changes_requested" && (
                  <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
                      <Clock className="h-3.5 w-3.5" />
                      Waiting for designer to revise
                    </p>
                    {concept.md_feedback && (
                      <div className="mt-1">
                        <FeedbackDisplay text={concept.md_feedback} />
                      </div>
                    )}
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      The designer will upload revised files and re-submit. You'll be able to review again.
                    </p>
                  </div>
                )}

                {/* State: Designer is working on changes */}
                {concept.work_status === "in_progress" && (concept.revision_count ?? 0) > 0 && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Designer is working on changes
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      The designer is implementing your feedback. You'll see their work when they re-submit.
                    </p>
                  </div>
                )}

                {/* State: Ready for admin to review (in_revision) */}
                {/* Previous feedback trail */}
                {concept.final_approval_notes && concept.work_status === "in_revision" && (
                  <div className="mb-2 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-2.5">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                    <div>
                      <p className="text-[10px] font-semibold text-warning">Previous feedback (Round {concept.revision_count ?? 1})</p>
                      <FeedbackDisplay text={concept.final_approval_notes!} className="mt-0.5" />
                    </div>
                  </div>
                )}

                {canFinalApprove ? (
                  <div className="space-y-3">
                    {/* Outcome cue — kept compact so the two action cards
                        below carry the visual weight. */}
                    <div className="flex items-start gap-2 rounded-lg border border-primary/15 bg-primary/[0.04] px-3 py-2">
                      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <p className="text-[12px] leading-snug text-foreground">
                        Designer re-submitted — your review decides the outcome.
                        {concept.designs_count != null && (
                          <span className="text-muted-foreground"> · {concept.designs_count} designs submitted</span>
                        )}
                      </p>
                    </div>

                    {/* ── Option A: Approve ──
                         Icon-chip header + tinted gradient surface + refined
                         input. Same pattern the ScoreCard uses so the drawer
                         reads in one visual language. */}
                    {onFinalApprove && (
                      <div className="relative overflow-hidden rounded-xl border border-success/25 bg-gradient-to-br from-success/[0.09] via-success/[0.04] to-transparent">
                        <div
                          aria-hidden
                          className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-success via-success/70 to-success/30"
                        />
                        <div className="space-y-3 p-4">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-success/15 text-success ring-1 ring-inset ring-success/30">
                              <Check className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-[13px] font-semibold leading-tight text-success">
                                Approve this concept
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                Final sign-off — concept ships
                              </p>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label
                              htmlFor="fa-count"
                              className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground"
                            >
                              Approved Designs #
                            </Label>
                            <input
                              id="fa-count"
                              type="number"
                              min="0"
                              value={approvedCount}
                              onChange={(e) => setApprovedCount(e.target.value)}
                              placeholder="e.g. 5"
                              disabled={busy !== null}
                              className="w-full rounded-lg border border-success/20 bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus-visible:border-success/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/30 disabled:opacity-50"
                            />
                          </div>
                          <Button
                            onClick={handleFinalApprove}
                            disabled={busy !== null}
                            size="sm"
                            className="w-full gap-1.5 bg-success text-white shadow-sm shadow-success/20 hover:bg-success/90"
                          >
                            {busy === "final_approve" ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Check className="h-3.5 w-3.5" />
                            )}
                            Approve
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* ── Refined OR divider — pill-shaped label on a
                         softly faded hairline so it reads as a decision
                         point, not a structural break. */}
                    {onFinalApprove && onFinalRevise && (
                      <div className="flex items-center gap-3 py-0.5">
                        <div className="h-px flex-1 bg-gradient-to-r from-transparent via-border to-border/60" />
                        <span className="rounded-full border border-border bg-secondary/60 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                          or
                        </span>
                        <div className="h-px flex-1 bg-gradient-to-l from-transparent via-border to-border/60" />
                      </div>
                    )}

                    {/* ── Option B: Request Revision ── */}
                    {onFinalRevise && (
                      <div className="relative overflow-hidden rounded-xl border border-warning/25 bg-gradient-to-br from-warning/[0.09] via-warning/[0.04] to-transparent">
                        <div
                          aria-hidden
                          className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-warning via-warning/70 to-warning/30"
                        />
                        <div className="space-y-3 p-4">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning ring-1 ring-inset ring-warning/30">
                              <RotateCcw className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-[13px] font-semibold leading-tight text-warning">
                                Request revision
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                Round {(concept.revision_count ?? 1) + 1} feedback — designer reworks
                              </p>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                              What needs to change?{" "}
                              <span className="font-normal normal-case tracking-normal text-muted-foreground/60">
                                (type or record voice)
                              </span>
                            </Label>
                            <VoiceFeedback
                              value={finalNotes}
                              onChange={setFinalNotes}
                              onAudioUrl={setFinalAudioUrl}
                              placeholder="Describe what needs to change or tap 🎤 to record…"
                              disabled={busy !== null}
                              rows={2}
                            />
                          </div>
                          <Button
                            onClick={handleFinalRevise}
                            disabled={busy !== null || !finalNotes.trim()}
                            size="sm"
                            className={cn(
                              "w-full gap-1.5",
                              finalNotes.trim()
                                ? "bg-warning text-white shadow-sm shadow-warning/20 hover:bg-warning/90"
                                : "border border-border bg-card text-muted-foreground hover:bg-secondary/40"
                            )}
                          >
                            {busy === "final_revise" ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="h-3.5 w-3.5" />
                            )}
                            {finalNotes.trim()
                              ? "Send Revision Feedback"
                              : "Type feedback above to send"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Designer / non-admin view */
                  <>
                    {(() => {
                      const feedback = concept.md_feedback || concept.final_approval_notes;
                      const needsRevision =
                        concept.work_status === "changes_requested" ||
                        (concept.work_status === "in_revision" && !!feedback);
                      const isWorking =
                        concept.work_status === "in_progress" && !!concept.designer_actual_date && (concept.revision_count ?? 0) > 0;
                      const isWaiting =
                        concept.work_status === "in_revision" && !feedback;

                      if (isMine && needsRevision) {
                        return (
                          <div className="space-y-2">
                            <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
                              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                              <div>
                                <p className="text-xs font-semibold text-warning">
                                  Changes Requested {(concept.revision_count ?? 0) > 0 && `· Round ${concept.revision_count}`}
                                </p>
                                {feedback && <FeedbackDisplay text={feedback} className="mt-1" />}
                              </div>
                            </div>
                            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                              <p className="mb-1 text-xs font-medium text-primary">Your action: revise and re-submit</p>
                              <p className="mb-2 text-[11px] text-muted-foreground">Upload your revised files and notes. The feedback above stays visible for reference.</p>
                              <Button size="sm" onClick={handleMarkDone} disabled={busy !== null} className="gap-1.5 bg-success hover:bg-success/90">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Re-submit Revised Work
                              </Button>
                            </div>
                          </div>
                        );
                      }

                      if (isMine && isWorking) {
                        return (
                          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                            <p className="mb-1 text-xs font-medium text-primary">Working on changes — ready to re-submit?</p>
                            <p className="mb-2 text-[11px] text-muted-foreground">Upload your revised files and mark as done for final review.</p>
                            <Button size="sm" onClick={handleMarkDone} disabled={busy !== null} className="gap-1.5 bg-success hover:bg-success/90">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Mark as Done
                            </Button>
                          </div>
                        );
                      }

                      if (isWaiting) {
                        return (
                          <div className="rounded-lg border border-success/30 bg-success/5 p-3">
                            <p className="flex items-center gap-1.5 text-xs font-medium text-success">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Your work was submitted
                            </p>
                            <p className="mt-1 text-[10px] text-muted-foreground">Waiting for admin to review and approve.</p>
                          </div>
                        );
                      }

                      return (
                        <p className="text-xs text-muted-foreground">Waiting for admin to grant final approval.</p>
                      );
                    })()}
                  </>
                )}
              </>
            ) : (
              /* ── Upcoming: Not ready yet ── */
              <p className="text-xs text-muted-foreground">
                This stage begins after the designer completes the concept.
              </p>
            )}
          </StageSection>

          {/* ═══════ Activity Timeline ═══════
               Synthesises the early lifecycle (creation, first MD review) so
               the log reads as the *full* story, not just the tail kept in
               completion_history. Always renders — at minimum we have the
               "Concept Submitted" event from concept.created_at. */}
          {(() => {
            const timeline = buildConceptTimeline(
              concept,
              submitter ?? null,
              concept.reviewer ?? null
            );
            return (
              <div className="border-t border-border bg-gradient-to-b from-secondary/30 via-transparent to-transparent px-5 py-5">
                <div className="mb-3.5 flex items-center gap-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
                    <Clock className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
                      Activity Timeline
                    </h3>
                    <p className="text-[10px] text-muted-foreground">
                      Full lifecycle from submission through final approval
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-medium tabular-nums text-muted-foreground">
                    {timeline.length} event{timeline.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="rounded-xl border border-border/60 bg-card/40 p-2">
                  {timeline.map((entry, i) => (
                    <HistoryEntry
                      key={`${entry.type}-${entry.date}-${i}`}
                      entry={entry}
                      isLast={i === timeline.length - 1}
                    />
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* ────── Mark Done dialog (designer — upload files + notes) ────── */}
    <MarkDoneDialog
      concept={concept}
      open={markDoneOpen}
      onOpenChange={setMarkDoneOpen}
      onMarkDone={handleMarkDoneSubmit}
    />

    {/* ────── Hold dialog (designer) ────── */}
    <Dialog open={holdOpen} onOpenChange={setHoldOpen}>
      <DialogContent className="max-w-[480px] p-0" srTitle="Hold concept">
        <div className="relative overflow-hidden border-b border-warning/20 bg-gradient-to-br from-warning/10 via-warning/[0.04] to-card px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-warning text-white shadow-sm shadow-warning/20">
              <Pause className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold tracking-tight text-foreground">Hold this concept?</h2>
              <p className="text-[10px] text-muted-foreground">Resume anytime — hold duration is tracked.</p>
            </div>
          </div>
        </div>
        <div className="space-y-2 px-4 py-3">
          <section className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm transition-colors hover:border-warning/30">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-warning/10 text-warning">
                <AlertTriangle className="h-3 w-3" />
              </span>
              <h3 className="text-[13px] font-semibold tracking-tight text-foreground">Reason <span className="text-[10px] font-normal text-muted-foreground">(optional)</span></h3>
            </div>
            <textarea
              value={holdReason}
              onChange={(e) => setHoldReason(e.target.value)}
              placeholder="e.g. Urgent job-work brief came in"
              rows={2}
              className="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </section>
          <div className="flex items-center justify-between gap-3 border-t border-border pt-2">
            <Button variant="ghost" onClick={() => setHoldOpen(false)} disabled={busy === "hold"}>Cancel</Button>
            <LoadingButton loading={busy === "hold"} loadingText="Holding…" onClick={handleHoldSubmit} className="gap-1.5 px-6 bg-warning hover:bg-warning/90 shadow-sm shadow-warning/20">
              <Pause className="h-3.5 w-3.5" />
              Hold Concept
            </LoadingButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* ────── Suggest changes dialog (admin) ────── */}
    <Dialog open={suggestOpen} onOpenChange={setSuggestOpen}>
      <DialogContent className="max-w-[520px] p-0" srTitle="Suggest changes">
        <div className="relative overflow-hidden border-b border-primary/15 bg-gradient-to-br from-primary/10 via-primary/[0.04] to-card px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-white shadow-sm shadow-primary/20">
              <Send className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold tracking-tight text-foreground">Suggest Changes</h2>
              <p className="text-[10px] text-muted-foreground">Designer will see this feedback while reworking.</p>
            </div>
          </div>
        </div>
        <div className="space-y-2 px-4 py-3">
          <section className="rounded-lg border border-border bg-card px-3 py-2 shadow-sm transition-colors hover:border-primary/30">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <PencilLine className="h-3 w-3" />
              </span>
              <h3 className="text-[13px] font-semibold tracking-tight text-foreground">Feedback <span className="text-destructive">*</span></h3>
            </div>
            <VoiceFeedback
              value={suggestFeedback}
              onChange={setSuggestFeedback}
              onAudioUrl={setSuggestAudioUrl}
              placeholder="What should the designer change?"
              disabled={busy === "suggest_changes"}
              rows={3}
            />
          </section>
          <div className="flex items-center justify-between gap-3 border-t border-border pt-2">
            <Button variant="ghost" onClick={() => setSuggestOpen(false)} disabled={busy === "suggest_changes"}>Cancel</Button>
            <LoadingButton loading={busy === "suggest_changes"} loadingText="Sending…" disabled={!suggestFeedback.trim()} onClick={handleSuggestChangesSubmit} className="gap-1.5 px-6 shadow-sm shadow-primary/20">
              <Send className="h-3.5 w-3.5" />
              Send Feedback
            </LoadingButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

// ============================================================================
// WorkStatusActionPanel — per-state action card for the post-approval
// lifecycle. Lives inside the drawer right under the pipeline progress bar.
// Designer-visible states: not_started, in_progress, on_hold,
//   changes_requested. Admin-visible state: in_revision.
// ============================================================================

function WorkStatusActionPanel({
  concept,
  isAdmin,
  isMine,
  busy,
  approvedCount,
  setApprovedCount,
  canStart,
  canHold,
  canResume,
  canMarkDone,
  canStartChanges,
  canReviewDesign,
  onStart,
  onOpenHold,
  onResume,
  onMarkDone,
  onStartChanges,
  onApproveDesign,
  onOpenSuggest,
}: {
  concept: ConceptWithRelations;
  isAdmin: boolean;
  isMine: boolean;
  busy: string | null;
  /** Controlled input for "how many of the submitted designs MD approved". */
  approvedCount: string;
  setApprovedCount: (v: string) => void;
  canStart: boolean;
  canHold: boolean;
  canResume: boolean;
  canMarkDone: boolean;
  canStartChanges: boolean;
  canReviewDesign: boolean;
  onStart: () => void;
  onOpenHold: () => void;
  onResume: () => void;
  onMarkDone: () => void;
  onStartChanges: () => void;
  onApproveDesign: () => void;
  onOpenSuggest: () => void;
}) {
  const ws = concept.work_status;
  const feedback = concept.md_feedback?.trim();
  const holdReason = concept.hold_reason?.trim();

  return (
    <div className="border-b border-border bg-secondary/30 px-6 py-4">
      {/* Feedback / hold-reason banners — always visible when present so the
          designer can reference them while in 'in_progress' too. */}
      {ws === "changes_requested" && feedback && (
        <div className="mb-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2">
          <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-warning">
            <AlertTriangle className="h-3 w-3" /> Changes requested by Ma'am
          </p>
          <p className="text-sm leading-snug text-foreground">{feedback}</p>
        </div>
      )}
      {ws === "on_hold" && holdReason && (
        <div className="mb-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2">
          <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-warning">
            <Hourglass className="h-3 w-3" /> On hold
          </p>
          <p className="text-sm leading-snug text-foreground">{holdReason}</p>
        </div>
      )}

      {/* Action row — branches by work_status + role */}
      {ws === "not_started" && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {isMine
              ? "Ready when you are — start to log your working time."
              : "Waiting for designer to start."}
          </p>
          {canStart && (
            <LoadingButton
              size="sm"
              loading={busy === "start"}
              loadingText="Starting…"
              onClick={onStart}
              className="gap-1.5"
            >
              <PlayCircle className="h-3.5 w-3.5" />
              Start working
            </LoadingButton>
          )}
        </div>
      )}

      {ws === "in_progress" && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {isMine
              ? "Working now. Mark done when the design is ready for review."
              : `In progress — ${concept.designer?.full_name ?? "designer"} is working.`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {canHold && (
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenHold}
                className="gap-1.5"
                disabled={busy !== null}
              >
                <Pause className="h-3.5 w-3.5" />
                Hold
              </Button>
            )}
            {canMarkDone && (
              <LoadingButton
                size="sm"
                loading={busy === "mark_done"}
                loadingText="Sending…"
                onClick={onMarkDone}
                className="gap-1.5"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Mark done
              </LoadingButton>
            )}
          </div>
        </div>
      )}

      {ws === "on_hold" && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {isMine ? "Resume when you're ready to continue." : "Currently on hold."}
          </p>
          {canResume && (
            <LoadingButton
              size="sm"
              loading={busy === "resume"}
              loadingText="Resuming…"
              onClick={onResume}
              className="gap-1.5"
            >
              <Play className="h-3.5 w-3.5" />
              Resume
            </LoadingButton>
          )}
        </div>
      )}

      {ws === "in_revision" && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">
              {isAdmin
                ? "Designer marked this done — your review decides the outcome."
                : "Waiting for Ma'am to review the design."}
            </p>
            {/* Show how many designs the designer submitted so MD can pick
                an approved count without guessing. */}
            {isAdmin && concept.designs_count != null && (
              <p className="mt-0.5 text-[11px] font-medium text-foreground">
                Designer submitted{" "}
                <span className="font-semibold">{concept.designs_count}</span>{" "}
                design{concept.designs_count === 1 ? "" : "s"}
              </p>
            )}
          </div>
          {canReviewDesign && (
            <div className="flex flex-wrap items-center gap-2">
              {/* Approved-count input — only the in-revision admin view needs
                  this. Pre-populated with `designs_count` so the common case
                  ("all approved") is a single tap. */}
              {concept.designs_count != null && (
                <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Approved
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={concept.designs_count ?? undefined}
                    value={approvedCount}
                    onChange={(e) => setApprovedCount(e.target.value)}
                    placeholder={String(concept.designs_count)}
                    className="h-6 w-14 rounded border-0 bg-transparent px-1 text-sm font-semibold tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <span className="text-xs text-muted-foreground">
                    / {concept.designs_count}
                  </span>
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={onOpenSuggest}
                disabled={busy !== null}
                className="gap-1.5 border-warning/40 text-warning hover:bg-warning/10"
              >
                <PencilLine className="h-3.5 w-3.5" />
                Suggest changes
              </Button>
              <LoadingButton
                size="sm"
                loading={busy === "approve_design"}
                loadingText="Approving…"
                onClick={onApproveDesign}
                className="gap-1.5 bg-success text-white hover:bg-success/90"
              >
                <ThumbsUp className="h-3.5 w-3.5" />
                Approve design
              </LoadingButton>
            </div>
          )}
        </div>
      )}

      {ws === "changes_requested" && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {isMine
              ? "Start when you're ready — feedback stays visible while you work."
              : "Designer needs to implement changes."}
          </p>
          {canStartChanges && (
            <LoadingButton
              size="sm"
              loading={busy === "start_changes"}
              loadingText="Starting…"
              onClick={onStartChanges}
              className="gap-1.5"
            >
              <PlayCircle className="h-3.5 w-3.5" />
              Start changes
            </LoadingButton>
          )}
        </div>
      )}

      {ws === "completed" && (
        <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2">
          <CheckCircle2 className="h-4 w-4 text-success" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-success">
              Design completed
            </p>
            {concept.work_completed_at && (
              <p className="text-[10px] text-muted-foreground">
                {format(parseISO(concept.work_completed_at), "dd MMM yyyy · HH:mm")}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Timeline — unified view that merges synthesised lifecycle events (concept
// created, first MD review) with persisted `completion_history`. The DB only
// starts writing history once work begins; the early lifecycle (submission +
// MD's initial review) lives on the concept row itself. We splice those in
// at render time so the activity log is the FULL story, not just the tail.
// ============================================================================

type TimelineEntryType =
  | CompletionHistoryEntry["type"]
  | "created"
  | "md_concept_approved"
  | "md_concept_revision"
  | "md_concept_rejected";

interface TimelineEntry {
  type: TimelineEntryType;
  date: string;
  by?: string;
  feedback?: string;
  delay_days?: number;
  /** Synthetic events are rendered the same way but tagged so they read as
   *  the source of truth (the concept row itself, not the history JSONB). */
  synthetic?: boolean;
}

type Tone = "primary" | "success" | "warning" | "destructive";

// Static class lookups — Tailwind can't compose dynamic color utilities.
const TONE_CLASSES: Record<
  Tone,
  { chip: string; ring: string; text: string; feedback: string; hover: string }
> = {
  primary: {
    chip: "bg-primary/10 text-primary",
    ring: "ring-primary/30",
    text: "text-primary",
    feedback: "bg-primary/[0.06] border-primary/40",
    hover: "hover:bg-primary/[0.04]",
  },
  success: {
    chip: "bg-success/10 text-success",
    ring: "ring-success/30",
    text: "text-success",
    feedback: "bg-success/[0.06] border-success/40",
    hover: "hover:bg-success/[0.04]",
  },
  warning: {
    chip: "bg-warning/10 text-warning",
    ring: "ring-warning/30",
    text: "text-warning",
    feedback: "bg-warning/[0.06] border-warning/40",
    hover: "hover:bg-warning/[0.04]",
  },
  destructive: {
    chip: "bg-destructive/10 text-destructive",
    ring: "ring-destructive/30",
    text: "text-destructive",
    feedback: "bg-destructive/[0.06] border-destructive/40",
    hover: "hover:bg-destructive/[0.04]",
  },
};

const HISTORY_CONFIG: Record<
  TimelineEntryType,
  { icon: typeof Check; label: string; tone: Tone }
> = {
  // ── Synthesised lifecycle (not in history JSONB; derived from concept row) ──
  created: { icon: Sparkles, label: "Concept Submitted", tone: "primary" },
  md_concept_approved: { icon: ShieldCheck, label: "MD Approved Concept", tone: "success" },
  md_concept_revision: { icon: PencilLine, label: "MD Requested Revision", tone: "warning" },
  md_concept_rejected: { icon: XCircle, label: "MD Rejected Concept", tone: "destructive" },

  // ── Legacy event types ──
  done: { icon: CheckCircle2, label: "Marked as Done", tone: "success" },
  revision: { icon: RotateCcw, label: "Revision Requested", tone: "warning" },
  resubmit: { icon: ArrowRight, label: "Re-submitted", tone: "primary" },
  approved: { icon: CheckCircle2, label: "Final Approval", tone: "success" },

  // ── Work-status lifecycle event types (added 0026) ──
  started: { icon: PlayCircle, label: "Started Working", tone: "primary" },
  held: { icon: Pause, label: "Put On Hold", tone: "warning" },
  resumed: { icon: Play, label: "Resumed", tone: "primary" },
  marked_done: { icon: Send, label: "Sent for Review", tone: "primary" },
  design_approved: { icon: ThumbsUp, label: "Design Approved", tone: "success" },
  changes_requested: { icon: PencilLine, label: "Changes Requested", tone: "warning" },
  start_changes: { icon: PlayCircle, label: "Started Changes", tone: "primary" },
};

// ----------------------------------------------------------------------------
// buildConceptTimeline — merges synthesised early-lifecycle events with the
// persisted completion_history, sorts chronologically. Always returns at
// least the "Concept Submitted" event so brand-new concepts still show a row.
// ----------------------------------------------------------------------------
function buildConceptTimeline(
  concept: {
    created_at: string;
    md_status: ConceptStatus;
    md_reviewed_at: string | null;
    md_notes: string | null;
    completion_history: CompletionHistoryEntry[] | null | undefined;
  },
  submitter: { full_name: string } | null,
  reviewer: { full_name: string } | null
): TimelineEntry[] {
  const items: TimelineEntry[] = [];

  // 1) Concept submitted — always synthesised from created_at.
  items.push({
    type: "created",
    date: concept.created_at,
    by: submitter?.full_name,
    synthetic: true,
  });

  // 2) First MD review of the *concept* (distinct from `design_approved`,
  //    which is MD signing off the *finished design* later in the lifecycle).
  if (concept.md_reviewed_at) {
    const type: TimelineEntryType =
      concept.md_status === "approved"
        ? "md_concept_approved"
        : concept.md_status === "rejected"
        ? "md_concept_rejected"
        : concept.md_status === "revision_requested"
        ? "md_concept_revision"
        : "md_concept_approved";
    items.push({
      type,
      date: concept.md_reviewed_at,
      by: reviewer?.full_name,
      feedback: concept.md_notes ?? undefined,
      synthetic: true,
    });
  }

  // 3) Everything actually written to history.
  const history = Array.isArray(concept.completion_history)
    ? (concept.completion_history as TimelineEntry[])
    : [];
  items.push(...history);

  // 4) Chronological. ISO date strings sort lexicographically.
  items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return items;
}

function HistoryEntry({
  entry,
  isLast,
}: {
  entry: TimelineEntry;
  isLast: boolean;
}) {
  const cfg = HISTORY_CONFIG[entry.type];
  // Defensive: an old / unknown event type slipped through. Render a neutral
  // row rather than crash the drawer.
  if (!cfg) return null;
  const Icon = cfg.icon;
  const tone = TONE_CLASSES[cfg.tone];
  return (
    <div
      className={cn(
        "group relative flex gap-3 rounded-lg px-2 py-2 transition-colors",
        tone.hover
      )}
    >
      {/* Vertical connector — sits behind the chip via z-0 so the chip's ring
          stays clean. */}
      {!isLast && (
        <div className="absolute left-[22px] top-10 bottom-0 z-0 w-px bg-border" />
      )}
      {/* Tone chip */}
      <div
        className={cn(
          "relative z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
          tone.chip,
          tone.ring
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </div>
      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={cn("text-xs font-semibold", tone.text)}>
            {cfg.label}
          </span>
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {fmtDate(entry.date)}
          </span>
        </div>
        {entry.by && (
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            by <span className="font-medium text-foreground/80">{entry.by}</span>
          </p>
        )}
        {entry.delay_days != null && entry.delay_days !== 0 && (
          <p
            className={cn(
              "mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
              entry.delay_days > 0
                ? "bg-destructive/10 text-destructive"
                : "bg-success/10 text-success"
            )}
          >
            {entry.delay_days > 0
              ? `+${entry.delay_days}d late`
              : `${Math.abs(entry.delay_days)}d early`}
          </p>
        )}
        {entry.delay_days === 0 && entry.type !== "revision" && (
          <p className="mt-1 inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
            On time
          </p>
        )}
        {entry.feedback != null && entry.feedback.length > 0 && (
          <div className={cn("mt-1.5 rounded-md border-l-2 px-2.5 py-1.5", tone.feedback)}>
            <FeedbackDisplay text={String(entry.feedback)} />
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Stage section wrapper — provides the colored left bar + header
// ============================================================================

function StageSection({
  stage,
  concept,
  last,
  children,
}: {
  stage: StageKey;
  concept: ConceptWithRelations;
  last?: boolean;
  children: React.ReactNode;
}) {
  const cfg = STAGES[stage];
  const status = getStageStatus(concept, stage);
  const isDone = status === "done";
  const isActive = status === "active";
  const isBlocked = status === "blocked";
  const isUpcoming = status === "upcoming";

  // Completed stages auto-collapse; active/blocked/upcoming start expanded.
  const [expanded, setExpanded] = useState(!isDone);
  // Re-sync when concept status changes (e.g. admin approves → stage flips to done).
  useEffect(() => { setExpanded(!isDone); }, [isDone]);

  const stageNum = stage === "creation" ? "1" : stage === "approval" ? "2" : stage === "completion" ? "3" : "4";

  return (
    <div className={cn("px-4 py-1.5", isUpcoming && "opacity-40")}>
      <div
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest("a, button, input, textarea, select, [role='button']")) return;
          setExpanded((prev) => !prev);
        }}
        className={cn(
          "cursor-pointer rounded-lg border bg-card shadow-sm transition-colors",
          isDone && "border-success/30",
          isActive && "border-primary/30",
          isBlocked && "border-destructive/30",
          isUpcoming && "border-border"
        )}
      >
        {/* Stage header */}
        <div
          className={cn(
            "flex w-full items-center gap-2 px-3 py-2 transition-colors",
            expanded ? "" : "rounded-lg",
            isDone && "hover:bg-success/5",
            isActive && "hover:bg-primary/5"
          )}
        >
          <div
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-md",
              isDone && `${cfg.bgColor} text-white`,
              isActive && `${cfg.bgColor}/15 ${cfg.color}`,
              isBlocked && "bg-destructive/15 text-destructive",
              isUpcoming && "bg-secondary text-muted-foreground"
            )}
          >
            {isDone ? (
              <Check className="h-3 w-3" />
            ) : isBlocked ? (
              <X className="h-3 w-3" />
            ) : (
              <span className="text-[9px] font-bold">{stageNum}</span>
            )}
          </div>
          <h3
            className={cn(
              "flex-1 text-[13px] font-semibold tracking-tight",
              isDone && cfg.color,
              isActive && cfg.color,
              isBlocked && "text-destructive",
              isUpcoming && "text-muted-foreground"
            )}
          >
            {cfg.label}
          </h3>
          {isDone && (
            <span className="rounded bg-success/10 px-1.5 py-0.5 text-[9px] font-semibold text-success">Complete</span>
          )}
          {isActive && (
            <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-semibold", `${cfg.bgColor}/10 ${cfg.color}`)}>
              In Progress
            </span>
          )}
          {isBlocked && (
            <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[9px] font-semibold text-destructive">Blocked</span>
          )}
          <ChevronDown className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
            expanded && "rotate-180"
          )} />
        </div>

        {/* Collapsible content */}
        <div className={cn(
          "grid overflow-hidden transition-all duration-200 ease-out",
          expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}>
          <div className="min-h-0">
            <div className="px-3 pb-2">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Detail item — label + value
// ============================================================================

function DetailItem({
  icon,
  label,
  children,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-0.5 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="text-sm text-foreground">{children}</div>
    </div>
  );
}

export type { ConceptStatus };
