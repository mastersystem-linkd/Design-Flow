import { useState } from "react";
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
} from "lucide-react";
import { differenceInDays, format, parseISO } from "date-fns";
import { toast } from "@/components/ui";
import type { CompletionHistoryEntry } from "@/types/database";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import {
  CONCEPT_STATUS_LABELS,
  CONCEPT_STATUS_COLORS,
} from "@/lib/constants";
import { cn, formatDate } from "@/lib/utils";
import type { ConceptStatus, ConceptWithRelations, UserRole } from "@/types/database";
import type { ReviewInput } from "@/hooks/useConcepts";

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
}: Props) {
  const { profile } = useAuth();
  const [reviewNotes, setReviewNotes] = useState("");
  const [finalNotes, setFinalNotes] = useState("");
  const [approvedCount, setApprovedCount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  if (!concept) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:w-[36rem]" />
      </Sheet>
    );
  }

  const isAdmin = isAdminRole(profile?.role);
  const isMine =
    profile?.id === concept.submitted_by ||
    profile?.id === concept.designer_id;
  const canReview = isAdmin && concept.md_status === "pending";
  const canRequestRevisionReview =
    isAdmin && concept.md_status === "revision_requested";
  const canFinalize =
    isMine &&
    concept.md_status === "approved" &&
    !concept.designer_actual_date;
  const canFinalApprove =
    isAdmin &&
    !!concept.designer_actual_date &&
    !concept.final_approved_at;

  const submitter = concept.submitter ?? concept.designer;

  // Handlers
  async function handleReview(status: ReviewInput["status"]) {
    setBusy(status);
    const { error } = await onReview(concept!.id, {
      status,
      notes: reviewNotes || null,
    });
    setBusy(null);
    if (error) return void toast.error(error);
    toast.success(`Marked as ${CONCEPT_STATUS_LABELS[status]}`);
    setReviewNotes("");
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
    const { error } = await onFinalRevise(concept!.id, finalNotes || null);
    setBusy(null);
    if (error) return void toast.error(error);
    toast.success("Revision feedback sent");
    setFinalNotes("");
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto p-0 sm:w-[36rem]">
        {/* ── Header ── */}
        <div className="sticky top-0 z-10 border-b border-border bg-card px-6 pb-4 pt-6">
          <SheetHeader className="space-y-1.5 p-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] tracking-wider text-muted-foreground">
                {concept.concept_code}
              </span>
              <Badge
                className={cn(
                  "text-[10px]",
                  CONCEPT_STATUS_COLORS[concept.md_status]
                )}
              >
                {CONCEPT_STATUS_LABELS[concept.md_status]}
              </Badge>
              {concept.priority === "urgent" && (
                <Badge className="bg-destructive/15 text-destructive text-[10px] ring-1 ring-inset ring-destructive/30">
                  Urgent
                </Badge>
              )}
            </div>
            <SheetTitle className="text-lg leading-tight">
              {concept.title}
            </SheetTitle>
          </SheetHeader>

          {/* ── Pipeline progress bar ── */}
          <div className="mt-4 flex items-center gap-1">
            {(["creation", "approval", "completion", "final"] as StageKey[]).map(
              (stage, i) => {
                const status = getStageStatus(concept, stage);
                const cfg = STAGES[stage];
                return (
                  <div key={stage} className="flex flex-1 items-center gap-1">
                    <div
                      className={cn(
                        "h-1.5 flex-1 rounded-full transition-all",
                        status === "done" && cfg.bgColor,
                        status === "active" &&
                          `${cfg.bgColor} animate-pulse opacity-70`,
                        status === "blocked" && "bg-destructive",
                        status === "upcoming" && "bg-border"
                      )}
                    />
                    {i < 3 && (
                      <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground/30" />
                    )}
                  </div>
                );
              }
            )}
          </div>
          <div className="mt-1.5 flex text-[9px] uppercase tracking-wider text-muted-foreground">
            {(["creation", "approval", "completion", "final"] as StageKey[]).map(
              (stage) => (
                <span key={stage} className="flex-1 text-center">
                  {STAGES[stage].label.split(" ")[0]}
                </span>
              )
            )}
          </div>
        </div>

        {/* ── Body ── */}
        <div className="space-y-0 pb-8">
          {/* ═══════ STAGE 1: Concept Creation ═══════ */}
          <StageSection stage="creation" concept={concept}>
            {/* Details grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
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
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
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
              <div className="mt-2 rounded-lg border border-border bg-card p-3 text-sm italic text-muted-foreground">
                "{concept.md_notes}"
              </div>
            )}

            {/* ── Action: Review (pending concepts) ── */}
            {(canReview || canRequestRevisionReview) && (
              <div className="mt-3 space-y-3 rounded-lg border border-border bg-card p-4">
                <p className="text-xs font-medium text-foreground">
                  {canReview
                    ? "This concept is awaiting your review."
                    : "This concept was revised. Review again."}
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="review-notes" className="text-xs">
                    Feedback (optional)
                  </Label>
                  <textarea
                    id="review-notes"
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    rows={2}
                    placeholder="Reason or kudos…"
                    disabled={busy !== null}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleReview("approved")}
                    disabled={busy !== null}
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
                    disabled={busy !== null}
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
                    disabled={busy !== null}
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
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
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

            {concept.designer_actual_date ? (
              <>
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-success/10 p-3 text-sm font-medium text-success">
                  <CheckCircle2 className="h-4 w-4" />
                  Completed by designer
                </div>

                {/* Show revision feedback + re-submit for designer */}
                {concept.final_approval_notes && !concept.final_approved_at && (
                  <div className="mt-3 rounded-lg border border-warning/30 bg-warning/5 p-3">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-warning">
                          Revision requested by MD
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {concept.final_approval_notes}
                        </p>
                      </div>
                    </div>
                    {isMine && onResubmit && (
                      <Button
                        onClick={handleResubmit}
                        disabled={busy !== null}
                        size="sm"
                        className="mt-2 w-full gap-1.5"
                      >
                        {busy === "resubmit" ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                        Re-submit for Final Approval
                      </Button>
                    )}
                  </div>
                )}
              </>
            ) : concept.md_status === "approved" ? (
              <div className="mt-3 rounded-lg border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground">
                  {canFinalize
                    ? "Mark as completed once your design work is done."
                    : "Waiting for the designer to complete."}
                </p>
                {canFinalize && (
                  <Button
                    onClick={handleFinalize}
                    disabled={busy !== null}
                    size="sm"
                    className="mt-2 w-full gap-1.5 bg-success hover:bg-success/90"
                  >
                    {busy === "finalize" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    Mark as Completed
                  </Button>
                )}
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                {concept.md_status === "pending"
                  ? "Waiting for MD approval before this stage begins."
                  : concept.md_status === "rejected"
                    ? "This concept was rejected."
                    : "Needs approval before completion can begin."}
              </p>
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
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
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
                  <div className="mt-2 rounded-lg border border-border bg-card p-3 text-sm italic text-muted-foreground">
                    "{concept.final_approval_notes}"
                  </div>
                )}
              </>
            ) : concept.designer_actual_date ? (
              /* ── Active: Ready for MD to review ── */
              <>
                {/* Show previous revision feedback if any */}
                {concept.final_approval_notes && (
                  <div className="mb-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    <div>
                      <p className="text-xs font-semibold text-warning">
                        Previous feedback
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {concept.final_approval_notes}
                      </p>
                    </div>
                  </div>
                )}

                {canFinalApprove ? (
                  <div className="space-y-3">
                    {/* ── Option A: Approve ── */}
                    {onFinalApprove && (
                      <div className="rounded-lg border border-success/30 bg-success/5 p-4 space-y-3">
                        <p className="text-xs font-semibold text-success">
                          Approve this concept
                        </p>
                        <div className="space-y-1.5">
                          <Label htmlFor="fa-count" className="text-xs">
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
                            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                          />
                        </div>
                        <Button
                          onClick={handleFinalApprove}
                          disabled={busy !== null}
                          size="sm"
                          className="w-full gap-1.5 bg-success hover:bg-success/90"
                        >
                          {busy === "final_approve" ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          )}
                          Approve
                        </Button>
                      </div>
                    )}

                    {/* ── Divider ── */}
                    {onFinalApprove && onFinalRevise && (
                      <div className="flex items-center gap-3">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          or
                        </span>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                    )}

                    {/* ── Option B: Request Revision ── */}
                    {onFinalRevise && (
                      <div className="rounded-lg border border-warning/30 bg-warning/5 p-4 space-y-3">
                        <p className="text-xs font-semibold text-warning">
                          Request revision
                        </p>
                        <div className="space-y-1.5">
                          <Label htmlFor="fa-notes" className="text-xs">
                            What needs to be changed?{" "}
                            <span className="text-destructive">*</span>
                          </Label>
                          <textarea
                            id="fa-notes"
                            value={finalNotes}
                            onChange={(e) => setFinalNotes(e.target.value)}
                            rows={2}
                            placeholder="Describe what the designer needs to fix…"
                            disabled={busy !== null}
                            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                          />
                        </div>
                        <Button
                          onClick={handleFinalRevise}
                          disabled={busy !== null || !finalNotes.trim()}
                          variant="outline"
                          size="sm"
                          className={cn(
                            "w-full gap-1.5",
                            finalNotes.trim()
                              ? "border-warning text-warning hover:bg-warning/10"
                              : "border-border text-muted-foreground"
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
                    )}
                  </div>
                ) : (
                  /* Designer / non-admin view */
                  <p className="text-xs text-muted-foreground">
                    {concept.final_approval_notes
                      ? "Revision feedback was shared. Waiting for admin to review again."
                      : "Waiting for admin to grant final approval."}
                  </p>
                )}
              </>
            ) : (
              /* ── Upcoming: Not ready yet ── */
              <p className="text-xs text-muted-foreground">
                This stage begins after the designer completes the concept.
              </p>
            )}
          </StageSection>

          {/* ═══════ Activity Log ═══════ */}
          {concept.completion_history &&
            Array.isArray(concept.completion_history) &&
            concept.completion_history.length > 0 && (
            <div className="border-t border-border px-6 py-5">
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                Completion Activity Log
              </h3>
              <div className="space-y-0">
                {(concept.completion_history as CompletionHistoryEntry[]).map(
                  (entry, i) => (
                    <HistoryEntry key={i} entry={entry} isLast={i === (concept.completion_history as CompletionHistoryEntry[]).length - 1} />
                  )
                )}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// History entry
// ============================================================================

const HISTORY_CONFIG: Record<
  CompletionHistoryEntry["type"],
  { icon: typeof Check; label: string; color: string; bgColor: string }
> = {
  done: {
    icon: CheckCircle2,
    label: "Marked as Done",
    color: "text-success",
    bgColor: "bg-success",
  },
  revision: {
    icon: RotateCcw,
    label: "Revision Requested",
    color: "text-warning",
    bgColor: "bg-warning",
  },
  resubmit: {
    icon: ArrowRight,
    label: "Re-submitted",
    color: "text-primary",
    bgColor: "bg-primary",
  },
  approved: {
    icon: CheckCircle2,
    label: "Final Approval",
    color: "text-success",
    bgColor: "bg-success",
  },
};

function HistoryEntry({
  entry,
  isLast,
}: {
  entry: CompletionHistoryEntry;
  isLast: boolean;
}) {
  const cfg = HISTORY_CONFIG[entry.type];
  const Icon = cfg.icon;
  return (
    <div className="relative flex gap-3 pb-4">
      {/* Vertical line */}
      {!isLast && (
        <div className="absolute left-[9px] top-5 bottom-0 w-px bg-border" />
      )}
      {/* Dot */}
      <div
        className={cn(
          "mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full",
          cfg.bgColor
        )}
      >
        <Icon className="h-2.5 w-2.5 text-white" />
      </div>
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className={cn("text-xs font-semibold", cfg.color)}>
            {cfg.label}
          </span>
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {fmtDate(entry.date)}
          </span>
        </div>
        {entry.by && (
          <p className="text-[10px] text-muted-foreground">by {entry.by}</p>
        )}
        {entry.delay_days != null && entry.delay_days !== 0 && (
          <p className={cn(
            "text-[10px] font-medium",
            entry.delay_days > 0 ? "text-destructive" : "text-success"
          )}>
            {entry.delay_days > 0
              ? `+${entry.delay_days}d late`
              : `${Math.abs(entry.delay_days)}d early`}
          </p>
        )}
        {entry.delay_days === 0 && entry.type !== "revision" && (
          <p className="text-[10px] font-medium text-success">On time</p>
        )}
        {entry.feedback && (
          <p className="mt-1 rounded bg-warning/5 border border-warning/20 px-2 py-1 text-xs text-muted-foreground italic">
            "{entry.feedback}"
          </p>
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

  return (
    <div
      className={cn(
        "relative border-b border-border px-6 py-5",
        last && "border-b-0",
        isUpcoming && "opacity-50"
      )}
    >
      {/* Left accent bar */}
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 w-1",
          isDone && cfg.bgColor,
          isActive && `${cfg.bgColor} opacity-60`,
          isBlocked && "bg-destructive",
          isUpcoming && "bg-border"
        )}
      />

      {/* Stage header */}
      <div className="mb-3 flex items-center gap-2">
        <div
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded-full",
            isDone && `${cfg.bgColor} text-white`,
            isActive && `${cfg.bgColor}/15 ${cfg.color}`,
            isBlocked && "bg-destructive/15 text-destructive",
            isUpcoming && "bg-border text-muted-foreground"
          )}
        >
          {isDone ? (
            <Check className="h-3 w-3" />
          ) : isBlocked ? (
            <X className="h-3 w-3" />
          ) : (
            <span className="text-[9px] font-bold">
              {stage === "creation"
                ? "1"
                : stage === "approval"
                  ? "2"
                  : stage === "completion"
                    ? "3"
                    : "4"}
            </span>
          )}
        </div>
        <h3
          className={cn(
            "text-xs font-semibold uppercase tracking-wider",
            isDone && cfg.color,
            isActive && cfg.color,
            isBlocked && "text-destructive",
            isUpcoming && "text-muted-foreground"
          )}
        >
          {cfg.label}
        </h3>
        {isDone && (
          <span className="ml-auto text-[10px] font-medium text-success">
            Complete
          </span>
        )}
        {isActive && (
          <span
            className={cn("ml-auto text-[10px] font-medium", cfg.color)}
          >
            In Progress
          </span>
        )}
        {isBlocked && (
          <span className="ml-auto text-[10px] font-medium text-destructive">
            Blocked
          </span>
        )}
      </div>

      {children}
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
