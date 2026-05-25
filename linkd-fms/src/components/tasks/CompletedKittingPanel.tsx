import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Archive,
  AlertTriangle,
  Download,
  ExternalLink,
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

// ============================================================================
// CompletedKittingPanel — read-only archive of submitted kitting forms.
// Drop into any view (DEO queue, All Tasks dashboard) — self-contained:
// fetches its own data + provides search + CSV export + open-form link.
// ============================================================================

interface CompletedRow {
  id: string;
  task_id: string | null;
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
}

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
}

export function CompletedKittingPanel({
  onCountChange,
}: CompletedKittingPanelProps = {}) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<CompletedRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  async function load() {
    // Embed `tasks:task_id` works because there's a real FK from
    // full_kitting_details.task_id → tasks.id. We DON'T embed the completer
    // join because the completed_by FK targets auth.users (not profiles),
    // and PostgREST can't traverse to profiles.full_name from there.
    // Instead we collect the completed_by ids and batch-fetch their names
    // in a separate query — one extra round-trip but no schema changes.
    const { data, error: err } = await supabase
      .from("full_kitting_details")
      .select(
        `id, task_id, party_name, priority, form_date, completed_at,
         completed_by, form_payload,
         tasks:task_id ( task_code )`
      )
      .eq("data_entry_status", "completed")
      .order("completed_at", { ascending: false })
      .limit(500);
    if (err) {
      setError(err.message);
      return;
    }
    setError(null);

    // Batch-fetch completer profile names. dedupe so we don't fetch the same
    // user twice when the DEO has completed many forms.
    const completerIds = Array.from(
      new Set(
        (data ?? [])
          .map((r) => r.completed_by)
          .filter((v): v is string => !!v)
      )
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

    const flat: CompletedRow[] = (data ?? []).map((r) => {
      const linkedTask =
        (r as unknown as { tasks?: { task_code?: string | null } | null }).tasks ?? null;
      return {
        id: r.id,
        task_id: r.task_id,
        party_name: r.party_name,
        priority: r.priority as CompletedRow["priority"],
        form_date: r.form_date,
        completed_at: r.completed_at,
        completed_by: r.completed_by,
        task_code: linkedTask?.task_code ?? null,
        completer_name: r.completed_by
          ? nameById.get(r.completed_by) ?? null
          : null,
        form_payload: r.form_payload as Record<string, unknown> | null,
      };
    });
    setRows(flat);
    onCountChange?.(flat.length);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            title="No completed forms yet"
            description="Once the DEO submits a knitting form it will appear here."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search UID or party…"
              className="pl-8 h-9 text-sm"
            />
          </div>
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
        </div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {filtered.length} of {rows.length} records
        </p>

        {/* Clean 12-field table: record metadata + one column per form
            section. "Other" inputs and Notes textareas are dropped because
            they were mostly empty; the Yes-branch sub-answers (Fabric Name,
            APC Received By, Additional Detail) fold inline into their
            parent column so no signal is lost. */}
        <div className="overflow-x-auto">
          <table className="min-w-[1700px] text-sm">
            <thead className="border-y border-border bg-secondary/60 text-left text-[11px] font-bold uppercase tracking-wider text-foreground whitespace-nowrap">
              <tr>
                {/* Metadata */}
                <th className="px-3 py-2 font-medium">UID</th>
                <th className="px-3 py-2 font-medium">Party Name</th>
                <th className="px-3 py-2 font-medium">Form Date</th>
                <th className="px-3 py-2 font-medium">Completed At</th>
                <th className="px-3 py-2 font-medium">By</th>
                {/* 12 form sections */}
                <th className="px-3 py-2 font-medium">1. Fabric</th>
                <th className="px-3 py-2 font-medium">2. Width</th>
                <th className="px-3 py-2 font-medium">3. Design Count</th>
                <th className="px-3 py-2 font-medium">4. Design Types</th>
                <th className="px-3 py-2 font-medium">5. Colour Theme</th>
                <th className="px-3 py-2 font-medium">6. Background</th>
                <th className="px-3 py-2 font-medium">7. Garment</th>
                <th className="px-3 py-2 font-medium">8. Motive Size</th>
                <th className="px-3 py-2 font-medium">9. Concept</th>
                <th className="px-3 py-2 font-medium">10. APC Cutting</th>
                <th className="px-3 py-2 font-medium">11. Additional Req</th>
                <th className="px-3 py-2 font-medium">12. Priority</th>
                {/* Sticky right — always-reachable View button */}
                <th className="sticky right-0 z-10 bg-secondary/80 px-3 py-2 text-right font-bold shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]">
                  Open
                </th>
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
                    className="cursor-pointer border-b border-border/40 transition-colors hover:bg-secondary/30"
                    onClick={() => navigate(kittingDetailPath(r.id))}
                  >
                    {/* Metadata */}
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-primary">
                      {r.task_code ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-foreground">
                      {r.party_name ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {r.form_date ? formatDate(r.form_date) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-[11px] text-muted-foreground">
                      {r.completed_at
                        ? new Date(r.completed_at).toLocaleString()
                        : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {r.completer_name ?? "—"}
                    </td>
                    {/* 12 sections */}
                    <td className="px-3 py-2 text-[12px] text-foreground max-w-[220px] truncate" title={fabricCell}>{fabricCell}</td>
                    <td className="px-3 py-2 text-[12px] text-foreground max-w-[200px] truncate" title={fp("fabricWidths")}>{fp("fabricWidths")}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-[12px] text-foreground">{fp("designCount")}</td>
                    <td className="px-3 py-2 text-[12px] text-foreground max-w-[260px] truncate" title={fp("designTypes")}>{fp("designTypes")}</td>
                    <td className="px-3 py-2 text-[12px] text-foreground max-w-[220px] truncate" title={fp("colourThemes")}>{fp("colourThemes")}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-[12px] text-foreground">{fp("backgroundColour")}</td>
                    <td className="px-3 py-2 text-[12px] text-foreground max-w-[200px] truncate" title={fp("garmentApplications")}>{fp("garmentApplications")}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-[12px] text-foreground">{fp("motivePrintSize")}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-[12px] text-foreground">{fp("concept")}</td>
                    <td className="px-3 py-2 text-[12px] text-foreground max-w-[180px] truncate" title={apcCell}>{apcCell}</td>
                    <td className="px-3 py-2 text-[12px] text-foreground max-w-[240px] truncate" title={addlCell}>{addlCell}</td>
                    <td className="px-3 py-2 text-[12px]">
                      {r.priority ? (
                        <Badge
                          variant="outline"
                          className={cn("border text-[10px]", PRIORITY_PILL[r.priority])}
                        >
                          {priorityFromEnum(r.priority)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    {/* Sticky right — View */}
                    <td className="sticky right-0 z-10 bg-card px-3 py-2 text-right shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)]">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(kittingDetailPath(r.id));
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
      </CardContent>
    </Card>
  );
}
