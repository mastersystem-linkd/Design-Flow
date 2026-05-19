import { useMemo, useState } from "react";
import {
  Plus,
  RefreshCw,
  Lightbulb,
  CheckCircle2,
  Clock,
  XCircle,
  RotateCcw,
  Eye,
  Download,
} from "lucide-react";
import { useConcepts } from "@/hooks/useConcepts";
import { useAuth } from "@/hooks/useAuth";
import { useProfiles } from "@/hooks/useProfiles";
import {
  DesignerConceptDashboard,
  CoordinatorConceptDashboard,
  AdminConceptDashboard,
} from "@/components/concepts/ConceptDashboard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  getInitials,
  EmptyState,
  ExportDialog,
} from "@/components/ui";
import { type CsvColumn } from "@/lib/exportCSV";
import { isAdminOrCoordinator } from "@/lib/permissions";
import { SubmitConceptDialog } from "@/components/concepts/SubmitConceptDialog";
import { ConceptDetailDrawer } from "@/components/concepts/ConceptDetailDrawer";
import {
  CONCEPT_STATUS_LABELS,
  CONCEPT_STATUS_COLORS,
} from "@/lib/constants";
import { cn, formatDate } from "@/lib/utils";
import { CONCEPT_STATUSES } from "@/types/database";
import type {
  ConceptStatus,
  ConceptWithRelations,
} from "@/types/database";

type Tab = "all" | ConceptStatus;

// ============================================================================
// Main view
// ============================================================================

export function ConceptsView() {
  const { profile } = useAuth();
  const {
    concepts,
    isLoading,
    error,
    refetch,
    submitConcept,
    reviewConcept,
    finalizeConcept,
  } = useConcepts();
  const { profiles: designers } = useProfiles({ roles: ["designer"] });

  const role = profile?.role ?? "designer";
  const isAdmin = role === "admin" || role === "design_coordinator";
  const isCoordinator = role === "design_coordinator";
  const isDesigner = role === "designer";
  const userId = profile?.id;

  const [tab, setTab] = useState<Tab>("all");
  const [submitOpen, setSubmitOpen] = useState(false);
  const [selected, setSelected] = useState<ConceptWithRelations | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const canExport = isAdminOrCoordinator(role);

  const conceptExportColumns: CsvColumn<ConceptWithRelations>[] = [
    { key: "designer", label: "Designer", transform: (v) => (v as any)?.full_name ?? "" },
    { key: "title", label: "Title" },
    { key: "concept_code", label: "Code" },
    { key: "client", label: "Client", transform: (v) => (v as any)?.party_name ?? "" },
    { key: "md_status", label: "Status" },
    { key: "priority", label: "Priority" },
    { key: "created_at", label: "Submitted Date" },
    { key: "md_reviewed_at", label: "Reviewed Date" },
    { key: "assigned_by", label: "Assigned By" },
    { key: "md_notes", label: "Feedback" },
    { key: "remarks", label: "Remarks" },
    { key: "approved_designs_count", label: "Approved #", transform: (v) => v != null ? String(v) : "" },
  ];

  // ── Counts ────────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const map: Record<ConceptStatus, number> = {
      pending: 0,
      approved: 0,
      rejected: 0,
      revision_requested: 0,
    };
    for (const c of concepts) map[c.md_status]++;
    return map;
  }, [concepts]);

  const visible = useMemo(() => {
    if (tab === "all") return concepts;
    return concepts.filter((c) => c.md_status === tab);
  }, [concepts, tab]);

  // ── Quick stats (shown as icon badges in the header for admin) ────
  const pendingCount = counts.pending;

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Lightbulb className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Concepts</h1>
            <p className="text-xs text-muted-foreground">
              {concepts.length} total · {pendingCount} awaiting review
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isLoading}
            className="gap-1.5"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", isLoading && "animate-spin")}
            />
            Refresh
          </Button>
          {canExport && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExportOpen(true)}
              className="gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Export</span>
            </Button>
          )}
          <Button size="sm" className="gap-1.5" onClick={() => setSubmitOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Submit Concept
          </Button>
        </div>
      </div>

      {/* ── Role-specific dashboard ── */}
      {isDesigner && userId && (
        <DesignerConceptDashboard
          concepts={concepts}
          userId={userId}
          onSubmit={() => setSubmitOpen(true)}
          onConceptSelect={(c) => setSelected(c)}
        />
      )}
      {isCoordinator && (
        <CoordinatorConceptDashboard
          concepts={concepts}
          designers={designers}
          onDesignerFilter={() => {}}
        />
      )}
      {isAdmin && (
        <AdminConceptDashboard concepts={concepts} designers={designers} />
      )}

      {/* ── Status filter tabs ── */}
      <div className="flex flex-wrap gap-1.5">
        <FilterChip
          label="All"
          count={concepts.length}
          active={tab === "all"}
          onClick={() => setTab("all")}
        />
        {CONCEPT_STATUSES.map((s) => (
          <FilterChip
            key={s}
            label={CONCEPT_STATUS_LABELS[s]}
            count={counts[s]}
            active={tab === s}
            onClick={() => setTab(s)}
            dotColor={STATUS_DOT_COLOR[s]}
          />
        ))}
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ── Content ── */}
      {isLoading && concepts.length === 0 ? (
        <LoadingSkeleton />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Lightbulb className="h-10 w-10 text-primary/40" />}
          title={
            tab === "all"
              ? "No concepts yet"
              : `No ${CONCEPT_STATUS_LABELS[tab].toLowerCase()} concepts`
          }
          description={
            tab === "all"
              ? "Submit your first concept to get started."
              : "Try switching to a different filter."
          }
          action={
            tab === "all"
              ? { label: "Submit Concept", onClick: () => setSubmitOpen(true) }
              : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {visible.map((c) => (
            <ConceptCard
              key={c.id}
              concept={c}
              isAdmin={isAdmin}
              onClick={() => setSelected(c)}
            />
          ))}
        </div>
      )}

      {/* ── Dialogs / Drawers ── */}
      <SubmitConceptDialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        onSubmit={submitConcept}
      />
      <ConceptDetailDrawer
        concept={selected}
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        onReview={reviewConcept}
        onFinalize={finalizeConcept}
      />

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        data={concepts as unknown as Record<string, unknown>[]}
        columns={conceptExportColumns as unknown as CsvColumn<Record<string, unknown>>[]}
        defaultFilename="linkd-concepts"
        dateField="created_at"
      />
    </div>
  );
}

// ============================================================================
// Concept card — clean, readable, one per row
// ============================================================================

function ConceptCard({
  concept,
  isAdmin,
  onClick,
}: {
  concept: ConceptWithRelations;
  isAdmin: boolean;
  onClick: () => void;
}) {
  const submitter = concept.submitter ?? concept.designer;
  const statusIcon = STATUS_ICON[concept.md_status];
  const Icon = statusIcon.icon;

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="cursor-pointer transition-all hover:border-primary/30 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <CardContent className="flex items-start gap-4 py-4">
        {/* Status icon */}
        <div
          className={cn(
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            statusIcon.bgClass
          )}
        >
          <Icon className={cn("h-4 w-4", statusIcon.textClass)} />
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground leading-snug">
                {concept.title}
              </h3>
              {concept.description && (
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                  {concept.description}
                </p>
              )}
            </div>
            <Badge
              className={cn(
                "shrink-0 px-2 py-0.5 text-[10px]",
                CONCEPT_STATUS_COLORS[concept.md_status]
              )}
            >
              {CONCEPT_STATUS_LABELS[concept.md_status]}
            </Badge>
          </div>

          {/* Meta row */}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {submitter && (
              <div className="flex items-center gap-1.5">
                <Avatar className="h-4 w-4">
                  {submitter.avatar_url ? (
                    <AvatarImage src={submitter.avatar_url} />
                  ) : null}
                  <AvatarFallback className="text-[7px]">
                    {getInitials(submitter.full_name)}
                  </AvatarFallback>
                </Avatar>
                <span>{submitter.full_name}</span>
              </div>
            )}
            {concept.client?.party_name && (
              <>
                <span className="text-border">·</span>
                <span>{concept.client.party_name}</span>
              </>
            )}
            <span className="text-border">·</span>
            <span>{formatDate(concept.created_at)}</span>
            {concept.concept_code && (
              <>
                <span className="text-border">·</span>
                <span className="font-mono text-[10px] text-primary">
                  {concept.concept_code}
                </span>
              </>
            )}
          </div>
        </div>

        {/* View hint */}
        <Eye className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/40" />
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Filter chip
// ============================================================================

function FilterChip({
  label,
  count,
  active,
  onClick,
  dotColor,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  dotColor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-white"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      )}
    >
      {dotColor && !active && (
        <span className={cn("h-2 w-2 rounded-full", dotColor)} />
      )}
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 py-0.5 text-[10px] tabular-nums",
          active ? "bg-white/20 text-white" : "bg-secondary text-foreground"
        )}
      >
        {count}
      </span>
    </button>
  );
}

// ============================================================================
// Status visual config
// ============================================================================

const STATUS_DOT_COLOR: Record<ConceptStatus, string> = {
  pending: "bg-warning",
  approved: "bg-success",
  rejected: "bg-destructive",
  revision_requested: "bg-primary",
};

const STATUS_ICON: Record<
  ConceptStatus,
  {
    icon: typeof Clock;
    bgClass: string;
    textClass: string;
  }
> = {
  pending: {
    icon: Clock,
    bgClass: "bg-warning/10",
    textClass: "text-warning",
  },
  approved: {
    icon: CheckCircle2,
    bgClass: "bg-success/10",
    textClass: "text-success",
  },
  rejected: {
    icon: XCircle,
    bgClass: "bg-destructive/10",
    textClass: "text-destructive",
  },
  revision_requested: {
    icon: RotateCcw,
    bgClass: "bg-primary/10",
    textClass: "text-primary",
  },
};

// ============================================================================
// Loading skeleton
// ============================================================================

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="flex items-center gap-4 py-4">
            <div className="h-9 w-9 animate-pulse rounded-lg bg-secondary" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-48 animate-pulse rounded bg-secondary" />
              <div className="h-3 w-32 animate-pulse rounded bg-secondary" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
