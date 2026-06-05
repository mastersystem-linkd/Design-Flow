import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Archive,
  AlertTriangle,
  Check,
  Columns3,
  Download,
  ExternalLink,
  Eye,
  ImageOff,
  RotateCcw,
  Search,
} from "lucide-react";
import {
  Card,
  CardContent,
  Badge,
  SkeletonText,
  EmptyState,
  toast,
} from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { kittingDetailPath } from "@/lib/routes";
import { formatDate, cn } from "@/lib/utils";
import { priorityFromEnum } from "@/lib/kitting";
import { exportToCSV, type CsvColumn } from "@/lib/exportCSV";
import {
  TABLE_CONTAINER,
  TABLE_SCROLL,
  TABLE_HEAD,
  TABLE_TH,
  TABLE_TH_STICKY_RIGHT,
  TABLE_ROW_CLICKABLE,
  TABLE_TD,
  TABLE_TD_STICKY_RIGHT,
} from "@/lib/tableStyles";

const FK_BUCKET = "sample-files";

// ── Full Kitting column visibility ──────────────────────────────────────────
export type FkColKey =
  | "uid" | "party_name" | "designer" | "concept" | "description"
  | "image" | "form_date" | "completed_at" | "by"
  | "fabric" | "width" | "design_count" | "design_types" | "colour_theme"
  | "background" | "garment" | "motive_size" | "fk_concept" | "apc" | "additional" | "priority"
  | "status";

const FK_ALL_COLUMNS: readonly { key: FkColKey; label: string }[] = [
  { key: "uid", label: "UID" },
  { key: "party_name", label: "Party Name" },
  { key: "designer", label: "Designer" },
  { key: "concept", label: "Concept" },
  { key: "description", label: "Description" },
  { key: "image", label: "Image" },
  { key: "form_date", label: "Form Date" },
  { key: "completed_at", label: "Completed At" },
  { key: "by", label: "By" },
  { key: "fabric", label: "1. Fabric" },
  { key: "width", label: "2. Width" },
  { key: "design_count", label: "3. Design Count" },
  { key: "design_types", label: "4. Design Types" },
  { key: "colour_theme", label: "5. Colour Theme" },
  { key: "background", label: "6. Background" },
  { key: "garment", label: "7. Garment" },
  { key: "motive_size", label: "8. Motive Size" },
  { key: "fk_concept", label: "9. Concept" },
  { key: "apc", label: "10. APC Cutting" },
  { key: "additional", label: "11. Additional Req" },
  { key: "priority", label: "12. Priority" },
  { key: "status", label: "FK Status" },
];

const FK_DEFAULT_COLUMNS: FkColKey[] = [
  "uid", "party_name", "designer", "concept", "image", "form_date",
  "completed_at", "by", "fabric", "width", "design_count", "design_types",
  "colour_theme", "background", "garment", "motive_size", "fk_concept",
  "apc", "additional", "priority",
];

const FK_COL_STORAGE_KEY = "fk_visible_columns";

export function loadFkColumns(): FkColKey[] {
  try {
    const raw = localStorage.getItem(FK_COL_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as FkColKey[];
  } catch { /* ignore */ }
  return [...FK_DEFAULT_COLUMNS];
}

// ============================================================================
// CompletedKittingPanel — read-only archive of submitted kitting forms.
// Drop into any view (DEO queue, All Tasks dashboard) — self-contained:
// fetches its own data + provides search + CSV export + open-form link.
// ============================================================================

type KittingStatus =
  | "pending_image"
  | "pending_deo"
  | "in_progress"
  | "completed";

interface CompletedRow {
  id: string;
  task_id: string | null;
  sample_id: string | null;
  party_name: string | null;
  priority:
    | "very_urgent"
    | "2_days"
    | "3_days"
    | "4_days"
    | "5_days"
    | null;
  form_date: string | null;
  completed_at: string | null;
  completed_by: string | null;
  task_code: string | null;
  completer_name: string | null;
  form_payload: Record<string, unknown> | null;
  designer_name: string | null;
  concept: string | null;
  description: string | null;
  /** Only populated when `includeIncomplete` is on. */
  image_url: string | null;
  data_entry_status: KittingStatus;
}

const STATUS_PILL: Record<KittingStatus, string> = {
  pending_image: "bg-destructive/10 text-destructive border-destructive/30",
  pending_deo: "bg-destructive/10 text-destructive border-destructive/30",
  in_progress: "bg-warning/10 text-warning border-warning/30",
  completed: "bg-success/10 text-success border-success/30",
};

const STATUS_LABEL: Record<KittingStatus, string> = {
  pending_image: "Pending",
  pending_deo: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
};

const PRIORITY_PILL: Record<
  NonNullable<CompletedRow["priority"]>,
  string
> = {
  very_urgent: "bg-destructive/10 text-destructive border-destructive/30",
  "2_days": "bg-warning/10 text-warning border-warning/30",
  "3_days": "bg-warning/10 text-warning border-warning/30",
  "4_days": "bg-primary/10 text-primary border-primary/30",
  "5_days": "bg-success/10 text-success border-success/30",
};

interface CompletedKittingPanelProps {
  /** Optional callback fired whenever the row count changes (after a fetch
   *  finishes). Useful for parents that want to show the count in a tab
   *  badge without duplicating the data fetch. */
  onCountChange?: (count: number) => void;
  /** When true, render all FK rows (pending_deo + in_progress + completed)
   *  with extra Status + Image columns. When false (default) the panel
   *  behaves as the legacy "Completed" archive. */
  includeIncomplete?: boolean;
  /** Which source the FK rows came from. "task" (default) shows rows
   *  initiated from a brief; "sample" shows rows initiated from the
   *  Sampling screen; "all" shows both (used by the DEO completed archive
   *  so they see every form they finished regardless of source). Drives
   *  the WHERE filter on the query and which parent tables get batched. */
  linkType?: "task" | "sample" | "all";
  /** When provided, the panel hides its own search bar and uses this value
   *  for filtering instead (parent owns the search input). */
  externalSearch?: string;
  /** Expose the panel's export handler so the parent can place the button
   *  elsewhere (e.g. in a shared top bar). */
  onExportRef?: React.MutableRefObject<(() => void) | null>;
  /** Increment to force a data reload (e.g. from a parent refresh button). */
  refreshKey?: number;
  /** When provided, column visibility is controlled by the parent (the menu
   *  lives in the parent's toolbar). When omitted, the panel renders its own. */
  visibleColumns?: FkColKey[];
}

export function CompletedKittingPanel({
  onCountChange,
  includeIncomplete = false,
  linkType = "task",
  externalSearch,
  onExportRef,
  refreshKey = 0,
  visibleColumns: externalCols,
}: CompletedKittingPanelProps = {}) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<CompletedRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [internalSearch, setInternalSearch] = useState("");
  const [ownCols, setOwnCols] = useState<FkColKey[]>(loadFkColumns);
  const fkCols = externalCols ?? ownCols;
  const showFkCol = useCallback((k: FkColKey) => fkCols.includes(k), [fkCols]);
  function handleOwnColsChange(next: FkColKey[]) {
    setOwnCols(next);
    saveFkCols(next);
  }
  const hasExternalSearch = externalSearch !== undefined;
  const search = hasExternalSearch ? externalSearch : internalSearch;

  async function load() {
    // Two-step fetch instead of an embed:
    //   1. Pull full_kitting_details rows (no joins).
    //   2. Batch-fetch the task_codes and completer names separately.
    // PostgREST embeds with 1-to-1 relationships can silently filter rows
    // under RLS — fetching parent rows first guarantees every FK row shows
    // up regardless of join behaviour.
    //
    // includeIncomplete=true drops the status filter so pending rows show.
    // linkType="sample" reads rows initiated from a sample; default "task"
    // reads rows initiated from a brief.
    // sample_id column may not exist yet (migration pending). Try with it
    // first; if the DB returns a column-not-found error, retry without it
    // so the panel never crashes on older schemas.
    const BASE_COLS = "id, task_id, party_name, priority, form_date, completed_at, completed_by, form_payload, image_url, data_entry_status" as const;

    async function runQuery(select: string) {
      let q = supabase
        .from("full_kitting_details")
        .select(select)
        .limit(500);
      if (linkType === "sample") {
        q = q.not("sample_id", "is", null);
      } else if (linkType === "task") {
        q = q.not("task_id", "is", null);
      }
      return includeIncomplete
        ? q.order("created_at", { ascending: false })
        : q.eq("data_entry_status", "completed").order("completed_at", { ascending: false });
    }

    const wantsSampleCol = linkType === "sample" || linkType === "all";
    let result = await runQuery(wantsSampleCol ? `${BASE_COLS}, sample_id` : BASE_COLS);

    if (result.error && result.error.message.includes("sample_id")) {
      result = await runQuery(BASE_COLS);
    }

    if (result.error) {
      setError(result.error.message);
      return;
    }
    setError(null);

    const data = (result.data ?? []) as unknown as Record<string, unknown>[];

    // Batch-fetch parent rows: tasks for task-linked, samples for
    // sample-linked. For linkType="all" we run both queries since a single
    // result set can contain rows from either source. We populate one
    // shared `codeByParentId` map keyed on the parent id so the row
    // mapping below is source-agnostic.
    // Helper to safely read a string field from the untyped row.
    const str = (r: Record<string, unknown>, k: string): string | null =>
      typeof r[k] === "string" ? (r[k] as string) : null;

    const codeByParentId = new Map<string, string | null>();
    const partyByParentId = new Map<string, string | null>();
    const taskInfoById = new Map<string, { brief_type: string | null; concept: string | null; description: string | null; assigned_to: string | null; client_id: string | null }>();
    const designerNameById = new Map<string, string>();
    const clientNameById = new Map<string, string>();

    if (linkType === "sample" || linkType === "all") {
      const sampleIds = Array.from(
        new Set(data.map((r) => str(r, "sample_id")).filter((v): v is string => !!v))
      );
      if (sampleIds.length > 0) {
        const { data: samples } = await supabase
          .from("samples")
          .select("id, uid, party_name")
          .in("id", sampleIds);
        for (const s of samples ?? []) {
          codeByParentId.set(s.id, s.uid);
          partyByParentId.set(s.id, s.party_name);
        }
      }
    }
    if (linkType === "task" || linkType === "all") {
      const taskIds = Array.from(
        new Set(data.map((r) => str(r, "task_id")).filter((v): v is string => !!v))
      );
      if (taskIds.length > 0) {
        const { data: tasks } = await supabase
          .from("tasks")
          .select("id, task_code, brief_type, concept, description, assigned_to, client_id")
          .in("id", taskIds);
        for (const t of tasks ?? []) {
          codeByParentId.set(t.id, t.task_code);
          taskInfoById.set(t.id, {
            brief_type: t.brief_type,
            concept: t.concept,
            description: t.description,
            assigned_to: t.assigned_to,
            client_id: t.client_id,
          });
        }
        // Fetch designer names for all assigned tasks
        const designerIds = Array.from(
          new Set([...taskInfoById.values()].map((ti) => ti.assigned_to).filter((v): v is string => !!v))
        );
        if (designerIds.length > 0) {
          const { data: designers } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", designerIds);
          for (const d of designers ?? []) {
            designerNameById.set(d.id, d.full_name);
          }
        }
        // Fetch client party names
        const clientIds = Array.from(
          new Set([...taskInfoById.values()].map((ti) => ti.client_id).filter((v): v is string => !!v))
        );
        if (clientIds.length > 0) {
          const { data: clients } = await supabase
            .from("clients")
            .select("id, party_name")
            .in("id", clientIds);
          for (const c of clients ?? []) {
            clientNameById.set(c.id, c.party_name);
          }
        }
      }
    }

    const completerIds = Array.from(
      new Set(data.map((r) => str(r, "completed_by")).filter((v): v is string => !!v))
    );
    const nameById = new Map<string, string>();
    if (completerIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", completerIds);
      for (const p of profiles ?? []) {
        nameById.set(p.id, p.full_name);
      }
    }

    const flat: CompletedRow[] = data.map((r) => {
      const taskId = str(r, "task_id");
      const sampleId = str(r, "sample_id");
      const parentId =
        linkType === "sample" ? sampleId
        : linkType === "all" ? (taskId ?? sampleId)
        : taskId;
      const completedBy = str(r, "completed_by");
      const ti = taskId ? taskInfoById.get(taskId) : null;
      const resolvedParty =
        str(r, "party_name") ??
        (parentId ? partyByParentId.get(parentId) ?? null : null) ??
        (ti?.client_id ? clientNameById.get(ti.client_id) ?? null : null) ??
        (ti?.brief_type === "ld" ? "LD Silk Mills" : null);
      return {
        id: r.id as string,
        task_id: taskId,
        sample_id: sampleId,
        party_name: resolvedParty,
        priority: (r.priority ?? null) as CompletedRow["priority"],
        form_date: str(r, "form_date"),
        completed_at: str(r, "completed_at"),
        completed_by: completedBy,
        task_code: parentId ? codeByParentId.get(parentId) ?? null : null,
        completer_name: completedBy ? nameById.get(completedBy) ?? null : null,
        form_payload: (r.form_payload as Record<string, unknown> | null) ?? null,
        designer_name: ti?.assigned_to ? designerNameById.get(ti.assigned_to) ?? null : null,
        concept: ti?.concept ?? null,
        description: ti?.description ?? null,
        image_url: str(r, "image_url"),
        data_entry_status: (str(r, "data_entry_status") ?? "completed") as KittingStatus,
      };
    });
    setRows(flat);
    onCountChange?.(flat.length);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeIncomplete, linkType, refreshKey]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.task_code ?? "").toLowerCase().includes(q) ||
        (r.party_name ?? "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  useEffect(() => {
    if (onExportRef) {
      onExportRef.current = handleExport;
    }
    return () => {
      if (onExportRef) onExportRef.current = null;
    };
  });

  function handleExport() {
    if (!filtered.length) {
      toast.info("Nothing to export");
      return;
    }
    // ── Field formatters ───────────────────────────────────────────────
    // The CSV mirrors the table — exactly 12 form fields + metadata. Sub-
    // answers (fabric name, APC Received By, Additional Detail) fold inline
    // into their parent section so we don't have separate "Other" columns
    // that mostly read as empty.
    const fpStr = (row: CompletedRow, key: string): string => {
      const v = row.form_payload?.[key];
      if (Array.isArray(v)) return v.join(" | ");
      if (v == null) return "";
      return String(v);
    };
    const formatFabric = (r: CompletedRow): string => {
      const src = fpStr(r, "fabricSource");
      const name = fpStr(r, "fabricName");
      return src === "If In House" && name ? `If In House: ${name}` : src;
    };
    const formatApc = (r: CompletedRow): string => {
      const choice = fpStr(r, "apcCuttingReceived");
      const by = fpStr(r, "apcReceivedBy");
      return choice === "Yes" && by ? `Yes — ${by}` : choice;
    };
    const formatAdditional = (r: CompletedRow): string => {
      const choice = fpStr(r, "additionalRequirement");
      const detail = fpStr(r, "additionalRequirementDetail");
      return choice === "Yes" && detail ? `Yes — ${detail}` : choice;
    };

    const columns: CsvColumn<CompletedRow>[] = [
      // ── Record metadata ─────────────────────────────────────────────
      { key: "task_code", label: "UID" },
      { key: "party_name", label: "Party Name" },
      { key: "form_date", label: "Form Date" },
      {
        key: "completed_at",
        label: "Completed At",
        transform: (v) => (v ? new Date(v as string).toLocaleString() : ""),
      },
      { key: "completer_name", label: "Completed By" },

      // ── 12 form sections (one column each) ──────────────────────────
      { key: "form_payload", label: "1. Fabric",          transform: (_, r) => formatFabric(r) },
      { key: "form_payload", label: "2. Fabric Width",    transform: (_, r) => fpStr(r, "fabricWidths") },
      { key: "form_payload", label: "3. Design Count",    transform: (_, r) => fpStr(r, "designCount") },
      { key: "form_payload", label: "4. Design Types",    transform: (_, r) => fpStr(r, "designTypes") },
      { key: "form_payload", label: "5. Colour Theme",    transform: (_, r) => fpStr(r, "colourThemes") },
      { key: "form_payload", label: "6. Background",      transform: (_, r) => fpStr(r, "backgroundColour") },
      { key: "form_payload", label: "7. Garment",         transform: (_, r) => fpStr(r, "garmentApplications") },
      { key: "form_payload", label: "8. Motive Size",     transform: (_, r) => fpStr(r, "motivePrintSize") },
      { key: "form_payload", label: "9. Concept",         transform: (_, r) => fpStr(r, "concept") },
      { key: "form_payload", label: "10. APC Cutting",    transform: (_, r) => formatApc(r) },
      { key: "form_payload", label: "11. Additional Req", transform: (_, r) => formatAdditional(r) },
      {
        key: "priority",
        label: "12. Priority",
        transform: (v) => (v ? priorityFromEnum(v as CompletedRow["priority"]) : ""),
      },
    ];
    exportToCSV(
      filtered as unknown as Record<string, unknown>[],
      `knitting-completed-${new Date().toISOString().slice(0, 10)}`,
      columns as unknown as CsvColumn<Record<string, unknown>>[]
    );
    toast.success(
      `Exported ${filtered.length} record${filtered.length === 1 ? "" : "s"}`
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" onClick={() => void load()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (rows === null) {
    return (
      <Card>
        <CardContent className="py-6">
          <SkeletonText lines={6} />
        </CardContent>
      </Card>
    );
  }
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-10">
          <EmptyState
            icon={<Archive className="h-10 w-10 text-muted-foreground" />}
            title={
              includeIncomplete
                ? "No knitting forms yet"
                : "No completed forms yet"
            }
            description={
              includeIncomplete
                ? "Briefs with a Full Knitting image will appear here as soon as they're created."
                : "Once the DEO submits a knitting form it will appear here."
            }
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
        {/* Toolbar — search + export hidden when parent provides externalSearch;
            Columns button always visible. */}
        {/* Toolbar — search + export when standalone; column menu when not controlled externally */}
        {(!hasExternalSearch || !externalCols) && (
          <div className="flex flex-wrap items-center gap-2">
            {!hasExternalSearch && (
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={internalSearch}
                  onChange={(e) => setInternalSearch(e.target.value)}
                  placeholder="Search UID or party…"
                  className="pl-8 h-9 text-sm"
                />
              </div>
            )}
            {!externalCols && (
              <>
                <div className="flex-1" />
                <FkColumnMenu
                  visible={fkCols}
                  onChange={handleOwnColsChange}
                  includeIncomplete={includeIncomplete}
                />
              </>
            )}
            {!hasExternalSearch && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={filtered.length === 0}
                className="gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </Button>
            )}
          </div>
        )}

        {/* Clean 12-field table: record metadata + one column per form
            section. "Other" inputs and Notes textareas are dropped because
            they were mostly empty; the Yes-branch sub-answers (Fabric Name,
            APC Received By, Additional Detail) fold inline into their
            parent column so no signal is lost. */}
        <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-secondary/60 text-left text-[11px] font-bold uppercase tracking-wider text-foreground whitespace-nowrap">
              <tr className="[&>th]:border-r [&>th]:border-border/30 [&>th:last-child]:border-r-0">
                {showFkCol("uid") && <th className="px-3 py-2 text-left font-bold">UID</th>}
                {showFkCol("party_name") && <th className="px-3 py-2 text-left font-bold">Party Name</th>}
                {showFkCol("designer") && <th className="px-3 py-2 text-left font-bold">Designer</th>}
                {showFkCol("concept") && <th className="px-3 py-2 text-left font-bold">Concept</th>}
                {showFkCol("description") && <th className="px-3 py-2 text-left font-bold">Description</th>}
                {includeIncomplete && showFkCol("image") && <th className="px-3 py-2 text-left font-bold">Image</th>}
                {showFkCol("form_date") && <th className="px-3 py-2 text-left font-bold">Form Date</th>}
                {showFkCol("completed_at") && <th className="px-3 py-2 text-left font-bold">Completed At</th>}
                {showFkCol("by") && <th className="px-3 py-2 text-left font-bold">By</th>}
                {showFkCol("fabric") && <th className="px-3 py-2 text-left font-bold">1. Fabric</th>}
                {showFkCol("width") && <th className="px-3 py-2 text-left font-bold">2. Width</th>}
                {showFkCol("design_count") && <th className="px-3 py-2 text-left font-bold">3. Design Count</th>}
                {showFkCol("design_types") && <th className="px-3 py-2 text-left font-bold">4. Design Types</th>}
                {showFkCol("colour_theme") && <th className="px-3 py-2 text-left font-bold">5. Colour Theme</th>}
                {showFkCol("background") && <th className="px-3 py-2 text-left font-bold">6. Background</th>}
                {showFkCol("garment") && <th className="px-3 py-2 text-left font-bold">7. Garment</th>}
                {showFkCol("motive_size") && <th className="px-3 py-2 text-left font-bold">8. Motive Size</th>}
                {showFkCol("fk_concept") && <th className="px-3 py-2 text-left font-bold">9. Concept</th>}
                {showFkCol("apc") && <th className="px-3 py-2 text-left font-bold">10. APC Cutting</th>}
                {showFkCol("additional") && <th className="px-3 py-2 text-left font-bold">11. Additional Req</th>}
                {showFkCol("priority") && <th className="px-3 py-2 text-left font-bold">12. Priority</th>}
                {includeIncomplete && showFkCol("status") && <th className="px-3 py-2 text-left font-bold">FK Status</th>}
                <th className="sticky right-0 z-10 bg-secondary/60 px-3 py-2 text-right font-bold shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]">Open</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const fp = (key: string): string => {
                  const v = r.form_payload?.[key];
                  if (Array.isArray(v)) return v.join(", ");
                  if (v == null || v === "") return "—";
                  return String(v);
                };
                // Fold sub-answers inline so the "Yes"/"If In House" branch
                // carries its detail in the same cell.
                const fabricCell = (() => {
                  const src = fp("fabricSource");
                  const name = fp("fabricName");
                  return src === "If In House" && name !== "—"
                    ? `If In House: ${name}`
                    : src;
                })();
                const apcCell = (() => {
                  const choice = fp("apcCuttingReceived");
                  const by = fp("apcReceivedBy");
                  return choice === "Yes" && by !== "—" ? `Yes — ${by}` : choice;
                })();
                const addlCell = (() => {
                  const choice = fp("additionalRequirement");
                  const detail = fp("additionalRequirementDetail");
                  return choice === "Yes" && detail !== "—"
                    ? `Yes — ${detail}`
                    : choice;
                })();
                return (
                  <tr
                    key={r.id}
                    className={TABLE_ROW_CLICKABLE}
                    onClick={() => navigate(kittingDetailPath(r.id), { state: { from: window.location.href } })}
                  >
                    {showFkCol("uid") && <td className={cn("px-3 py-1.5 text-sm", "whitespace-nowrap font-mono text-[11px] text-primary")}>{r.task_code ?? "—"}</td>}
                    {showFkCol("party_name") && <td className={cn("px-3 py-1.5 text-sm", "whitespace-nowrap font-medium text-foreground")}>{r.party_name ?? "—"}</td>}
                    {showFkCol("designer") && <td className={cn("px-3 py-1.5 text-sm", "whitespace-nowrap text-foreground")}>{r.designer_name ?? "—"}</td>}
                    {showFkCol("concept") && <td className={cn("px-3 py-1.5 text-sm", "whitespace-nowrap text-foreground")}>{r.concept ?? "—"}</td>}
                    {showFkCol("description") && <td className={cn("px-3 py-1.5 text-sm", "max-w-[200px] truncate text-foreground")} title={r.description ?? ""}>{r.description ?? "—"}</td>}
                    {includeIncomplete && showFkCol("image") && <td className={cn("px-3 py-1.5 text-sm", "align-middle")}><FkThumb path={r.image_url} /></td>}
                    {showFkCol("form_date") && <td className={cn("px-3 py-1.5 text-sm", "whitespace-nowrap text-muted-foreground")}>{r.form_date ? formatDate(r.form_date) : "—"}</td>}
                    {showFkCol("completed_at") && <td className={cn("px-3 py-1.5 text-sm", "whitespace-nowrap text-muted-foreground")}>{r.completed_at ? new Date(r.completed_at).toLocaleString() : "—"}</td>}
                    {showFkCol("by") && <td className={cn("px-3 py-1.5 text-sm", "whitespace-nowrap text-muted-foreground")}>{r.completer_name ?? "—"}</td>}
                    {showFkCol("fabric") && <td className={cn("px-3 py-1.5 text-sm", "max-w-[220px] truncate")} title={fabricCell}>{fabricCell}</td>}
                    {showFkCol("width") && <td className={cn("px-3 py-1.5 text-sm", "max-w-[200px] truncate")} title={fp("fabricWidths")}>{fp("fabricWidths")}</td>}
                    {showFkCol("design_count") && <td className={cn("px-3 py-1.5 text-sm", "whitespace-nowrap")}>{fp("designCount")}</td>}
                    {showFkCol("design_types") && <td className={cn("px-3 py-1.5 text-sm", "max-w-[260px] truncate")} title={fp("designTypes")}>{fp("designTypes")}</td>}
                    {showFkCol("colour_theme") && <td className={cn("px-3 py-1.5 text-sm", "max-w-[220px] truncate")} title={fp("colourThemes")}>{fp("colourThemes")}</td>}
                    {showFkCol("background") && <td className={cn("px-3 py-1.5 text-sm", "whitespace-nowrap")}>{fp("backgroundColour")}</td>}
                    {showFkCol("garment") && <td className={cn("px-3 py-1.5 text-sm", "max-w-[200px] truncate")} title={fp("garmentApplications")}>{fp("garmentApplications")}</td>}
                    {showFkCol("motive_size") && <td className={cn("px-3 py-1.5 text-sm", "whitespace-nowrap")}>{fp("motivePrintSize")}</td>}
                    {showFkCol("fk_concept") && <td className={cn("px-3 py-1.5 text-sm", "whitespace-nowrap")}>{fp("concept")}</td>}
                    {showFkCol("apc") && <td className={cn("px-3 py-1.5 text-sm", "max-w-[180px] truncate")} title={apcCell}>{apcCell}</td>}
                    {showFkCol("additional") && <td className={cn("px-3 py-1.5 text-sm", "max-w-[240px] truncate")} title={addlCell}>{addlCell}</td>}
                    {showFkCol("priority") && (
                      <td className="px-3 py-1.5 text-sm">
                        {r.priority ? (
                          <Badge variant="outline" className={cn("border text-[10px]", PRIORITY_PILL[r.priority])}>
                            {priorityFromEnum(r.priority)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    )}
                    {includeIncomplete && showFkCol("status") && (
                      <td className={cn("px-3 py-1.5 text-sm", "whitespace-nowrap align-middle")}>
                        <Badge variant="outline" className={cn("border text-[10px]", STATUS_PILL[r.data_entry_status])}>
                          {STATUS_LABEL[r.data_entry_status]}
                        </Badge>
                      </td>
                    )}
                    {/* Sticky right — View */}
                    <td className="sticky right-0 z-10 bg-card px-3 py-1.5 text-right shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(kittingDetailPath(r.id), { state: { from: window.location.href } });
                        }}
                        className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary transition-colors hover:bg-primary/20"
                      >
                        <ExternalLink className="h-3 w-3" />
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </div>
    </div>
  );
}

// ============================================================================
// FkThumb — 40px square preview that lazily resolves a signed URL for the
// stored FK reference image. Falls back to an icon placeholder when the
// row has no image or the signed-URL fetch fails.
// ============================================================================
function FkThumb({ path }: { path: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.storage
        .from(FK_BUCKET)
        .createSignedUrl(path, 3600);
      if (cancelled) return;
      if (error || !data?.signedUrl) {
        setFailed(true);
        return;
      }
      setUrl(data.signedUrl);
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!path || failed) {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-md border border-dashed border-border bg-secondary/40 text-muted-foreground">
        <ImageOff className="h-4 w-4" />
      </div>
    );
  }
  return (
    <a
      href={url ?? "#"}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => {
        e.stopPropagation();
        if (!url) e.preventDefault();
      }}
      className="block h-10 w-10 overflow-hidden rounded-md border border-border bg-secondary/40"
      title="Open reference image"
    >
      {url ? (
        <img
          src={url}
          alt="FK reference"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="h-full w-full animate-pulse bg-secondary" />
      )}
    </a>
  );
}

export function saveFkCols(next: FkColKey[]) {
  localStorage.setItem(FK_COL_STORAGE_KEY, JSON.stringify(next));
}

// ── Column visibility menu for the Full Kitting table ────────────────────
export function FkColumnMenu({
  visible,
  onChange,
  includeIncomplete,
}: {
  visible: FkColKey[];
  onChange: (next: FkColKey[]) => void;
  includeIncomplete: boolean;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // `pointerdown` covers mouse + touch; the panel stops propagation so taps
    // inside it never reach this handler and close the menu.
    function handler(e: Event) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [open]);

  const cols = FK_ALL_COLUMNS.filter(
    (c) => includeIncomplete || (c.key !== "image" && c.key !== "status")
  );
  const isVis = (k: FkColKey) => visible.includes(k);

  function toggle(k: FkColKey) {
    onChange(isVis(k) ? visible.filter((v) => v !== k) : [...visible, k]);
  }

  return (
    <div className="relative" ref={menuRef}>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen((o) => !o)} className="gap-1.5">
        <Columns3 className="h-4 w-4" />
        <span className="hidden sm:inline">Columns</span>
        <span className="rounded-full bg-secondary px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
          {cols.filter((c) => isVis(c.key)).length}
        </span>
      </Button>
      {open && (
        <div
          className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-border bg-card shadow-lg"
          role="menu"
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Visible Columns</span>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {cols.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="menuitemcheckbox"
                aria-checked={isVis(key)}
                onClick={() => toggle(key)}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors hover:bg-secondary/60"
              >
                <span className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                  isVis(key) ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"
                )}>
                  {isVis(key) && <Check className="h-3 w-3" />}
                </span>
                <span className="truncate text-foreground">{label}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 border-t border-border px-2 py-2">
            <button type="button" onClick={() => onChange(cols.map((c) => c.key))} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary">
              <Eye className="h-3.5 w-3.5" /> Show All
            </button>
            <button type="button" onClick={() => onChange([...FK_DEFAULT_COLUMNS])} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary">
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
