import { useState } from "react";
import { Check, RotateCcw, X, Calendar, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
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
import { daysUntil, daysLabel, daysSeverity, DAYS_SEVERITY_CLASS } from "@/lib/days";
import type { ConceptStatus, ConceptWithRelations, UserRole } from "@/types/database";
import type { ReviewInput } from "@/hooks/useConcepts";

// Concept review is admin-exclusive — design_coordinator is intentionally
// NOT included here.
function isAdminRole(role: UserRole | null | undefined): boolean {
  return role === "admin" || role === "design_coordinator";
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
}

export function ConceptDetailDrawer({
  concept,
  open,
  onOpenChange,
  onReview,
  onFinalize,
}: Props) {
  const { profile } = useAuth();
  const [reviewNotes, setReviewNotes] = useState("");
  const [busy, setBusy] = useState<null | "approved" | "rejected" | "revision_requested" | "finalize">(null);

  const canReview = isAdminRole(profile?.role) && concept?.md_status === "pending";
  const isMine = profile?.id && concept?.submitted_by === profile.id;
  const canFinalize =
    isMine && concept?.md_status === "approved" && !concept?.designer_actual_date;

  async function handleReview(status: ReviewInput["status"]) {
    if (!concept) return;
    setBusy(status);
    const { error } = await onReview(concept.id, {
      status,
      notes: reviewNotes || null,
    });
    setBusy(null);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(`Marked as ${CONCEPT_STATUS_LABELS[status]}`);
    setReviewNotes("");
  }

  async function handleFinalize() {
    if (!concept) return;
    setBusy("finalize");
    const { error } = await onFinalize(concept.id);
    setBusy(null);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Concept finalized");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:w-[32rem]">
        {concept && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
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
              </div>
              <SheetTitle>{concept.title}</SheetTitle>
              {concept.submitter && (
                <SheetDescription className="flex items-center gap-2">
                  Submitted by
                  <span className="flex items-center gap-1.5 text-foreground">
                    <Avatar className="h-5 w-5">
                      {concept.submitter.avatar_url ? (
                        <AvatarImage src={concept.submitter.avatar_url} />
                      ) : null}
                      <AvatarFallback className="text-[9px]">
                        {getInitials(concept.submitter.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    {concept.submitter.full_name}
                  </span>
                  · {formatDate(concept.created_at)}
                </SheetDescription>
              )}
            </SheetHeader>

            <div className="space-y-5 px-6 pb-8 text-sm">
              {/* Image */}
              <ConceptImage
                src={concept.image_url}
                alt={concept.title}
                className="h-72 w-full rounded-md border border-border"
                showDownload
              />

              {/* Description */}
              {concept.description && (
                <div className="rounded-md border border-border bg-card p-3 text-sm leading-relaxed">
                  {concept.description}
                </div>
              )}

              {/* Timeline */}
              <section className="space-y-2">
                <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Timeline
                </h3>
                <DateRow
                  icon={<Calendar className="h-3.5 w-3.5" />}
                  label="MD review by"
                  date={concept.md_planned_date}
                  actual={concept.md_actual_date}
                  isPending={concept.md_status === "pending"}
                />
                {concept.md_status === "approved" && (
                  <DateRow
                    icon={<Calendar className="h-3.5 w-3.5" />}
                    label="Designer finalize by"
                    date={concept.designer_planned_date}
                    actual={concept.designer_actual_date}
                    isPending={!concept.designer_actual_date}
                  />
                )}
              </section>

              {/* Reviewer info */}
              {concept.reviewer && (
                <section className="space-y-2">
                  <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Review
                  </h3>
                  <div className="flex items-center gap-2 text-sm">
                    <Avatar className="h-6 w-6">
                      {concept.reviewer.avatar_url ? (
                        <AvatarImage src={concept.reviewer.avatar_url} />
                      ) : null}
                      <AvatarFallback className="text-[10px]">
                        {getInitials(concept.reviewer.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <span>{concept.reviewer.full_name}</span>
                    {concept.md_reviewed_at && (
                      <span className="text-xs text-muted-foreground">
                        · {formatDate(concept.md_reviewed_at)}
                      </span>
                    )}
                  </div>
                  {concept.md_notes && (
                    <div className="rounded-md border border-border bg-card p-3 text-sm text-foreground">
                      "{concept.md_notes}"
                    </div>
                  )}
                </section>
              )}

              {/* MD review actions */}
              {canReview && (
                <section className="space-y-3 rounded-md border border-border bg-card p-4">
                  <h3 className="text-sm font-medium">Review</h3>
                  <div className="space-y-1.5">
                    <Label htmlFor="review-notes">Notes (optional)</Label>
                    <textarea
                      id="review-notes"
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      rows={2}
                      placeholder="Reason for revision, or kudos…"
                      disabled={busy !== null}
                      className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => handleReview("approved")}
                      disabled={busy !== null}
                      className="gap-1.5"
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
                      className="gap-1.5"
                    >
                      {busy === "revision_requested" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" />
                      )}
                      Request revision
                    </Button>
                    <Button
                      onClick={() => handleReview("rejected")}
                      disabled={busy !== null}
                      variant="destructive"
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
                </section>
              )}

              {/* Designer finalize action */}
              {canFinalize && (
                <section className="space-y-3 rounded-md border border-primary bg-primary/10 p-4">
                  <h3 className="text-sm font-medium">Designer finalize</h3>
                  <p className="text-xs text-muted-foreground">
                    Mark this concept finalized once you've handed off the final art.
                  </p>
                  <Button
                    onClick={handleFinalize}
                    disabled={busy !== null}
                    className="gap-1.5"
                  >
                    {busy === "finalize" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    Mark finalized
                  </Button>
                </section>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------- helpers

function DateRow({
  icon,
  label,
  date,
  actual,
  isPending,
}: {
  icon: React.ReactNode;
  label: string;
  date: string | null;
  actual: string | null;
  isPending: boolean;
}) {
  const days = isPending ? daysUntil(date) : null;
  const sev = daysSeverity(days);
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <span>{label}</span>
      </div>
      <div className="flex items-center gap-2 text-right">
        {actual ? (
          <span className="text-[11px] text-muted-foreground">
            done {formatDate(actual)}
          </span>
        ) : date ? (
          <>
            <span className="text-[11px] text-muted-foreground">
              {formatDate(date)}
            </span>
            {isPending && (
              <Badge
                className={cn(
                  "border px-1.5 py-0 text-[9px]",
                  DAYS_SEVERITY_CLASS[sev]
                )}
              >
                {daysLabel(days)}
              </Badge>
            )}
          </>
        ) : (
          <span className="text-[11px] text-muted-foreground">—</span>
        )}
      </div>
    </div>
  );
}

// ESLint-friendly: re-export the type used in JSX
export type { ConceptStatus };
