import type ExcelJS from "exceljs";
import type { DesignerConceptStat } from "@/hooks/useAnalytics";
import type { DesignerTaskStat } from "@/hooks/useTaskAnalytics";

// exceljs is ~900 KB. Load it ONLY when an export actually runs (dynamic
// import), so it never ships in the dashboard / scorecard route chunks — those
// import this module for its export functions but shouldn't pay for ExcelJS
// upfront. The `import type` above keeps every `ExcelJS.*` type annotation.
let _excelPromise: Promise<typeof import("exceljs")> | null = null;
function getExcel() {
  if (!_excelPromise) {
    _excelPromise = import("exceljs").then((m) => {
      // exceljs is CJS (`export =`): the ESM interop puts the namespace on
      // `.default` at runtime, but TS types `import("exceljs")` as the export
      // itself (no `.default`). Read `.default` with a fallback to the module.
      const mod = m as unknown as { default?: typeof import("exceljs") };
      return mod.default ?? (m as unknown as typeof import("exceljs"));
    });
  }
  return _excelPromise;
}

interface KpiSummary {
  periodLabel: string;
  totalSubmitted: number;
  totalApproved: number;
  totalRejected: number;
  totalCompleted: number;
  approvalRate: number;
  completionRate: number;
  avgReviewHours: number;
  pipeline: { status: string; count: number; percentage: number }[];
  conversionRates: {
    submittedToReviewed: number;
    reviewedToApproved: number;
  };
  workStatus: {
    firstPassRate: number | null;
    avgRevisionRounds: number | null;
    avgDesignDays: number | null;
    inFlight: number;
  };
}

const BRAND = "4338CA";
const BRAND_LIGHT = "EEF0FF";
const SUCCESS = "059669";
const SUCCESS_LIGHT = "ECFDF5";
const WARNING = "D97706";
const WARNING_LIGHT = "FFFBEB";
const DANGER = "DC2626";
const DANGER_LIGHT = "FEF2F2";
const HEADER_FILL: ExcelJS.FillPattern = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${BRAND}` } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
const SECTION_FONT: Partial<ExcelJS.Font> = { bold: true, size: 12, color: { argb: `FF${BRAND}` } };
const BORDER_THIN: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFE2E8F0" } };
const ALL_BORDERS: Partial<ExcelJS.Borders> = { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN };

function scoreColor(score: number): string {
  if (score >= 80) return SUCCESS;
  if (score >= 60) return BRAND;
  if (score >= 40) return WARNING;
  return DANGER;
}

function scoreBg(score: number): string {
  if (score >= 80) return SUCCESS_LIGHT;
  if (score >= 60) return BRAND_LIGHT;
  if (score >= 40) return WARNING_LIGHT;
  return DANGER_LIGHT;
}

export async function exportConceptDashboardExcel(
  designers: DesignerConceptStat[],
  kpis: KpiSummary,
  fileName: string
) {
  const wb: ExcelJS.Workbook = new (await getExcel()).Workbook();
  wb.creator = "LinkD Design Flow";
  wb.created = new Date();

  // ══════════════════════════════════════════════════════════════════
  // Sheet 1: Summary
  // ══════════════════════════════════════════════════════════════════
  const ws1 = wb.addWorksheet("Summary", { properties: { tabColor: { argb: `FF${BRAND}` } } });
  ws1.columns = [{ width: 28 }, { width: 18 }, { width: 14 }];

  // Title
  ws1.mergeCells("A1:C1");
  const title = ws1.getCell("A1");
  title.value = "CONCEPT DASHBOARD REPORT";
  title.font = { bold: true, size: 16, color: { argb: `FF${BRAND}` } };
  title.alignment = { vertical: "middle" };

  ws1.mergeCells("A2:C2");
  ws1.getCell("A2").value = kpis.periodLabel;
  ws1.getCell("A2").font = { size: 11, color: { argb: "FF64748B" } };

  ws1.mergeCells("A3:C3");
  ws1.getCell("A3").value = `Generated: ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}`;
  ws1.getCell("A3").font = { size: 10, color: { argb: "FF94A3B8" }, italic: true };

  // KPI Section
  let row = 5;
  ws1.getCell(`A${row}`).value = "KEY METRICS";
  ws1.getCell(`A${row}`).font = SECTION_FONT;
  row++;

  const kpiData: [string, string | number][] = [
    ["Total Submitted", kpis.totalSubmitted],
    ["Total Approved", kpis.totalApproved],
    ["Total Rejected", kpis.totalRejected],
    ["Total Completed", kpis.totalCompleted],
    ["Approval Rate", `${kpis.approvalRate}%`],
    ["Completion Rate", `${kpis.completionRate}%`],
    ["Avg Review Time", kpis.avgReviewHours > 0 ? `${kpis.avgReviewHours}h` : "—"],
  ];

  for (const [label, val] of kpiData) {
    const r = ws1.getRow(row);
    r.getCell(1).value = label;
    r.getCell(1).font = { bold: true, size: 10 };
    r.getCell(2).value = val;
    r.getCell(2).font = { size: 11, bold: true };
    r.getCell(2).alignment = { horizontal: "right" };
    r.eachCell((c) => { c.border = ALL_BORDERS; });
    if (row % 2 === 0) r.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } }; });
    row++;
  }

  // Pipeline Section
  row += 1;
  ws1.getCell(`A${row}`).value = "PIPELINE STATUS";
  ws1.getCell(`A${row}`).font = SECTION_FONT;
  row++;

  const pHead = ws1.getRow(row);
  ["Status", "Count", "Percentage"].forEach((h, i) => {
    const c = pHead.getCell(i + 1);
    c.value = h;
    c.font = HEADER_FONT;
    c.fill = HEADER_FILL;
    c.alignment = { horizontal: i === 0 ? "left" : "center" };
    c.border = ALL_BORDERS;
  });
  row++;

  for (const p of kpis.pipeline) {
    const r = ws1.getRow(row);
    r.getCell(1).value = p.status;
    r.getCell(1).font = { size: 10 };
    r.getCell(2).value = p.count;
    r.getCell(2).alignment = { horizontal: "center" };
    r.getCell(3).value = `${p.percentage}%`;
    r.getCell(3).alignment = { horizontal: "center" };
    r.eachCell((c) => { c.border = ALL_BORDERS; });
    row++;
  }

  // Conversion Funnel
  row += 1;
  ws1.getCell(`A${row}`).value = "CONVERSION FUNNEL";
  ws1.getCell(`A${row}`).font = SECTION_FONT;
  row++;

  const funnelData: [string, string][] = [
    ["Submitted → Reviewed", `${kpis.conversionRates.submittedToReviewed}%`],
    ["Reviewed → Approved", `${kpis.conversionRates.reviewedToApproved}%`],
    ["Approved → Completed", `${kpis.completionRate}%`],
  ];

  for (const [label, val] of funnelData) {
    const r = ws1.getRow(row);
    r.getCell(1).value = label;
    r.getCell(1).font = { bold: true, size: 10 };
    r.getCell(2).value = val;
    r.getCell(2).font = { size: 11, bold: true, color: { argb: `FF${BRAND}` } };
    r.eachCell((c) => { c.border = ALL_BORDERS; });
    row++;
  }

  // Quality Indicators
  row += 1;
  ws1.getCell(`A${row}`).value = "QUALITY INDICATORS";
  ws1.getCell(`A${row}`).font = SECTION_FONT;
  row++;

  const qualData: [string, string | number][] = [
    ["First-Pass Approval", kpis.workStatus.firstPassRate !== null ? `${kpis.workStatus.firstPassRate}%` : "—"],
    ["Avg Revision Rounds", kpis.workStatus.avgRevisionRounds !== null ? kpis.workStatus.avgRevisionRounds.toFixed(1) : "—"],
    ["Avg Design Days", kpis.workStatus.avgDesignDays !== null ? `${kpis.workStatus.avgDesignDays}d` : "—"],
    ["Currently In Flight", kpis.workStatus.inFlight],
  ];

  for (const [label, val] of qualData) {
    const r = ws1.getRow(row);
    r.getCell(1).value = label;
    r.getCell(1).font = { bold: true, size: 10 };
    r.getCell(2).value = val;
    r.eachCell((c) => { c.border = ALL_BORDERS; });
    row++;
  }

  // ══════════════════════════════════════════════════════════════════
  // Sheet 2: Designer Breakdown
  // ══════════════════════════════════════════════════════════════════
  const ws2 = wb.addWorksheet("Designer Breakdown", { properties: { tabColor: { argb: `FF${SUCCESS}` } } });

  const headers = [
    "Designer", "Code", "Submitted", "Approved", "Rejected",
    "In Revision", "Rev Cycles", "Completed",
    "Approval %", "Completion %", "Avg Review Hrs",
    "Target", "Score",
  ];
  const widths = [22, 8, 12, 12, 10, 12, 12, 12, 12, 14, 14, 10, 10];
  ws2.columns = widths.map((w) => ({ width: w }));

  // Header row
  const hRow = ws2.getRow(1);
  headers.forEach((h, i) => {
    const c = hRow.getCell(i + 1);
    c.value = h;
    c.font = HEADER_FONT;
    c.fill = HEADER_FILL;
    c.alignment = { horizontal: i <= 1 ? "left" : "center", vertical: "middle" };
    c.border = ALL_BORDERS;
  });
  hRow.height = 24;
  ws2.views = [{ state: "frozen", ySplit: 1 }];

  // Data rows
  designers.forEach((d, i) => {
    const approvalRate = d.submitted > 0
      ? Math.round((d.approved / Math.max(1, d.approved + d.rejected + d.revisions)) * 100)
      : 0;
    const completionPct = d.approved > 0 ? Math.round((d.completed / d.approved) * 100) : 0;
    const avgHrs = d.avgApprovalHours > 0 ? Number(d.avgApprovalHours.toFixed(1)) : 0;

    const r = ws2.getRow(i + 2);
    const vals = [
      d.full_name, d.designerCode, d.submitted, d.approved, d.rejected,
      d.revisions, d.revisionCycles, d.completed,
      approvalRate, completionPct, avgHrs, d.target, d.score,
    ];

    vals.forEach((v, j) => {
      const c = r.getCell(j + 1);
      c.value = v;
      c.alignment = { horizontal: j <= 1 ? "left" : "center", vertical: "middle" };
      c.border = ALL_BORDERS;
      c.font = { size: 10 };
    });

    // Zebra striping
    if (i % 2 === 1) {
      r.eachCell((c) => {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      });
    }

    // Color the score cell
    const scoreCell = r.getCell(13);
    scoreCell.font = { bold: true, size: 11, color: { argb: `FF${scoreColor(d.score)}` } };
    scoreCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${scoreBg(d.score)}` } };

    // Color approval rate
    const arCell = r.getCell(9);
    if (approvalRate >= 80) arCell.font = { size: 10, bold: true, color: { argb: `FF${SUCCESS}` } };
    else if (approvalRate < 50 && d.submitted > 0) arCell.font = { size: 10, bold: true, color: { argb: `FF${DANGER}` } };
  });

  // ══════════════════════════════════════════════════════════════════
  // Sheet 3: Score Ranking
  // ══════════════════════════════════════════════════════════════════
  const ws3 = wb.addWorksheet("Score Ranking", { properties: { tabColor: { argb: `FF${WARNING}` } } });
  ws3.columns = [{ width: 8 }, { width: 22 }, { width: 10 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 14 }];

  const rankHeaders = ["Rank", "Designer", "Score", "Submitted", "Approved", "Approval %", "Verdict"];
  const rh = ws3.getRow(1);
  rankHeaders.forEach((h, i) => {
    const c = rh.getCell(i + 1);
    c.value = h;
    c.font = HEADER_FONT;
    c.fill = HEADER_FILL;
    c.alignment = { horizontal: i <= 1 ? "left" : "center" };
    c.border = ALL_BORDERS;
  });
  rh.height = 24;
  ws3.views = [{ state: "frozen", ySplit: 1 }];

  const sorted = [...designers].sort((a, b) => b.score - a.score);
  sorted.forEach((d, i) => {
    const approvalRate = d.submitted > 0
      ? Math.round((d.approved / Math.max(1, d.approved + d.rejected + d.revisions)) * 100)
      : 0;
    const verdict = d.score >= 80 ? "Top Performer" : d.score >= 60 ? "Solid" : d.score >= 40 ? "Developing" : d.submitted === 0 ? "No Activity" : "Needs Support";

    const r = ws3.getRow(i + 2);
    [i + 1, d.full_name, d.score, d.submitted, d.approved, approvalRate, verdict].forEach((v, j) => {
      const c = r.getCell(j + 1);
      c.value = v;
      c.alignment = { horizontal: j <= 1 ? "left" : "center" };
      c.border = ALL_BORDERS;
      c.font = { size: 10 };
    });

    // Medal for top 3
    if (i === 0) r.getCell(1).value = "🥇 1";
    if (i === 1) r.getCell(1).value = "🥈 2";
    if (i === 2) r.getCell(1).value = "🥉 3";

    // Score color
    const sc = r.getCell(3);
    sc.font = { bold: true, size: 12, color: { argb: `FF${scoreColor(d.score)}` } };
    sc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${scoreBg(d.score)}` } };

    // Verdict color
    const vc = r.getCell(7);
    const vColor = d.score >= 80 ? SUCCESS : d.score >= 60 ? BRAND : d.score >= 40 ? WARNING : DANGER;
    vc.font = { bold: true, size: 10, color: { argb: `FF${vColor}` } };

    if (i % 2 === 1) r.eachCell((c) => { c.fill = c.fill && (c.fill as ExcelJS.FillPattern).fgColor ? c.fill : { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } }; });
  });

  // ══════════════════════════════════════════════════════════════════
  // Sheet 4: Pipeline Data
  // ══════════════════════════════════════════════════════════════════
  const ws4 = wb.addWorksheet("Pipeline", { properties: { tabColor: { argb: "FFFBBF24" } } });
  ws4.columns = [{ width: 24 }, { width: 12 }, { width: 14 }];

  const ph = ws4.getRow(1);
  ["Status", "Count", "Percentage"].forEach((h, i) => {
    const c = ph.getCell(i + 1);
    c.value = h;
    c.font = HEADER_FONT;
    c.fill = HEADER_FILL;
    c.alignment = { horizontal: i === 0 ? "left" : "center" };
    c.border = ALL_BORDERS;
  });

  const statusColors: Record<string, string> = {
    Pending: WARNING,
    Approved: SUCCESS,
    Rejected: DANGER,
    "Revision requested": BRAND,
  };

  kpis.pipeline.forEach((p, i) => {
    const r = ws4.getRow(i + 2);
    r.getCell(1).value = p.status;
    r.getCell(1).font = { bold: true, size: 10, color: { argb: `FF${statusColors[p.status] ?? "333333"}` } };
    r.getCell(2).value = p.count;
    r.getCell(2).alignment = { horizontal: "center" };
    r.getCell(3).value = `${p.percentage}%`;
    r.getCell(3).alignment = { horizontal: "center" };
    r.eachCell((c) => { c.border = ALL_BORDERS; });
  });

  await downloadWorkbook(wb, fileName);
}

// ============================================================================
// Shared helpers
// ============================================================================

async function downloadWorkbook(wb: ExcelJS.Workbook, fileName: string) {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileName}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

function reportTitle(ws: ExcelJS.Worksheet, title: string, periodLabel: string) {
  ws.mergeCells("A1:C1");
  const t = ws.getCell("A1");
  t.value = title;
  t.font = { bold: true, size: 16, color: { argb: `FF${BRAND}` } };
  t.alignment = { vertical: "middle" };

  ws.mergeCells("A2:C2");
  ws.getCell("A2").value = periodLabel;
  ws.getCell("A2").font = { size: 11, color: { argb: "FF64748B" } };

  ws.mergeCells("A3:C3");
  ws.getCell("A3").value = `Generated: ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}`;
  ws.getCell("A3").font = { size: 10, color: { argb: "FF94A3B8" }, italic: true };
}

function sectionTitle(ws: ExcelJS.Worksheet, row: number, text: string) {
  ws.getCell(`A${row}`).value = text;
  ws.getCell(`A${row}`).font = SECTION_FONT;
}

function tableHeader(ws: ExcelJS.Worksheet, row: number, headers: string[], leftCols = 1) {
  const r = ws.getRow(row);
  headers.forEach((h, i) => {
    const c = r.getCell(i + 1);
    c.value = h;
    c.font = HEADER_FONT;
    c.fill = HEADER_FILL;
    c.alignment = { horizontal: i < leftCols ? "left" : "center", vertical: "middle" };
    c.border = ALL_BORDERS;
  });
  r.height = 22;
}

/** Two-column "label / value" KPI rows with zebra striping + borders. */
function kpiRows(ws: ExcelJS.Worksheet, startRow: number, data: [string, string | number][]): number {
  let row = startRow;
  for (const [label, val] of data) {
    const r = ws.getRow(row);
    r.getCell(1).value = label;
    r.getCell(1).font = { bold: true, size: 10 };
    r.getCell(2).value = val;
    r.getCell(2).font = { size: 11, bold: true };
    r.getCell(2).alignment = { horizontal: "right" };
    r.eachCell((c) => { c.border = ALL_BORDERS; });
    if (row % 2 === 0) r.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } }; });
    row++;
  }
  return row;
}

// ============================================================================
// Task Dashboard export
// ============================================================================

export interface TaskKpiSummary {
  periodLabel: string;
  totalCompleted: number;
  totalCreated: number;
  onTimeRate: number;       // percent
  avgCycleDays: number;
  avgDelayDays: number;
  lateCompletions: number;
  activePipeline: number;
  urgentCount: number;
  overdueCount: number;
  pipeline: { status: string; count: number; percentage: number }[];
  priorityMix: { urgent: number; high: number; normal: number; low: number };
  kittingMix: { withKitting: number; withoutKitting: number; pct: number };
  volume: { label: string; created: number; completed: number }[];
}

export async function exportTaskDashboardExcel(
  designers: DesignerTaskStat[],
  kpis: TaskKpiSummary,
  fileName: string
) {
  const wb: ExcelJS.Workbook = new (await getExcel()).Workbook();
  wb.creator = "LinkD Design Flow";
  wb.created = new Date();

  // ── Sheet 1: Summary ──
  const ws1 = wb.addWorksheet("Summary", { properties: { tabColor: { argb: `FF${BRAND}` } } });
  ws1.columns = [{ width: 28 }, { width: 18 }, { width: 14 }];
  reportTitle(ws1, "TASK DASHBOARD REPORT", kpis.periodLabel);

  let row = 5;
  sectionTitle(ws1, row, "KEY METRICS");
  row++;
  row = kpiRows(ws1, row, [
    ["Tasks Completed", kpis.totalCompleted],
    ["Tasks Created", kpis.totalCreated],
    ["On-Time Rate", `${kpis.onTimeRate}%`],
    ["Avg Cycle Time", kpis.avgCycleDays > 0 ? `${kpis.avgCycleDays}d` : "—"],
    ["Avg Delay", kpis.avgDelayDays > 0 ? `${kpis.avgDelayDays}d` : "—"],
    ["Late Completions", kpis.lateCompletions],
    ["Active Pipeline", kpis.activePipeline],
    ["Urgent", kpis.urgentCount],
    ["Overdue", kpis.overdueCount],
  ]);

  // Pipeline
  row += 1;
  sectionTitle(ws1, row, "PIPELINE STATUS");
  row++;
  tableHeader(ws1, row, ["Status", "Count", "Percentage"]);
  row++;
  for (const p of kpis.pipeline) {
    const r = ws1.getRow(row);
    r.getCell(1).value = p.status;
    r.getCell(1).font = { size: 10 };
    r.getCell(2).value = p.count;
    r.getCell(2).alignment = { horizontal: "center" };
    r.getCell(3).value = `${p.percentage}%`;
    r.getCell(3).alignment = { horizontal: "center" };
    r.eachCell((c) => { c.border = ALL_BORDERS; });
    row++;
  }

  // Priority mix
  row += 1;
  sectionTitle(ws1, row, "PRIORITY MIX (active pipeline)");
  row++;
  row = kpiRows(ws1, row, [
    ["Urgent", kpis.priorityMix.urgent],
    ["High", kpis.priorityMix.high],
    ["Normal", kpis.priorityMix.normal],
    ["Low", kpis.priorityMix.low],
  ]);

  // Kitting mix
  row += 1;
  sectionTitle(ws1, row, "FULL-KITTING MIX");
  row++;
  kpiRows(ws1, row, [
    ["Needs Kitting", kpis.kittingMix.withKitting],
    ["No Kitting", kpis.kittingMix.withoutKitting],
    ["% Requiring Kitting", `${kpis.kittingMix.pct}%`],
  ]);

  // ── Sheet 2: Designers ──
  const ws2 = wb.addWorksheet("Designers", { properties: { tabColor: { argb: `FF${SUCCESS}` } } });
  const headers = ["Designer", "Code", "Assigned", "Completed", "On-Time", "On-Time %", "In Progress", "Avg Cycle (d)", "Avg Delay (d)", "Score"];
  ws2.columns = [22, 8, 12, 12, 10, 12, 12, 14, 14, 10].map((w) => ({ width: w }));
  tableHeader(ws2, 1, headers, 2);
  ws2.getRow(1).height = 24;
  ws2.views = [{ state: "frozen", ySplit: 1 }];

  const sortedDesigners = [...designers].sort((a, b) => b.score - a.score);
  sortedDesigners.forEach((d, i) => {
    const otPct = d.completed > 0 ? Math.round((d.onTime / d.completed) * 100) : 0;
    const r = ws2.getRow(i + 2);
    const vals: (string | number)[] = [
      d.full_name, d.designerCode, d.assigned, d.completed, d.onTime,
      `${otPct}%`, d.inProgress,
      d.avgCycleDays > 0 ? Number(d.avgCycleDays.toFixed(1)) : 0,
      d.avgDays > 0 ? Number(d.avgDays.toFixed(1)) : 0,
      d.score,
    ];
    vals.forEach((v, j) => {
      const c = r.getCell(j + 1);
      c.value = v;
      c.alignment = { horizontal: j <= 1 ? "left" : "center", vertical: "middle" };
      c.border = ALL_BORDERS;
      c.font = { size: 10 };
    });
    if (i % 2 === 1) r.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } }; });

    const scoreCell = r.getCell(10);
    scoreCell.font = { bold: true, size: 11, color: { argb: `FF${scoreColor(d.score)}` } };
    scoreCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${scoreBg(d.score)}` } };

    const otCell = r.getCell(6);
    if (d.completed > 0) {
      if (otPct >= 85) otCell.font = { size: 10, bold: true, color: { argb: `FF${SUCCESS}` } };
      else if (otPct < 60) otCell.font = { size: 10, bold: true, color: { argb: `FF${DANGER}` } };
    }
  });

  // ── Sheet 3: Throughput ──
  const ws3 = wb.addWorksheet("Throughput", { properties: { tabColor: { argb: "FFFBBF24" } } });
  ws3.columns = [{ width: 18 }, { width: 14 }, { width: 14 }];
  tableHeader(ws3, 1, ["Period", "Created", "Completed"]);
  kpis.volume.forEach((v, i) => {
    const r = ws3.getRow(i + 2);
    r.getCell(1).value = v.label;
    r.getCell(1).font = { size: 10, bold: true };
    r.getCell(2).value = v.created;
    r.getCell(2).alignment = { horizontal: "center" };
    r.getCell(3).value = v.completed;
    r.getCell(3).alignment = { horizontal: "center" };
    r.eachCell((c) => { c.border = ALL_BORDERS; });
  });

  await downloadWorkbook(wb, fileName);
}

// ============================================================================
// Scorecards export
// ============================================================================

export interface ScorecardSummary {
  total: number;
  avgScore: number;
  onTrack: number;
  needsSupport: number;
  topPerformerName: string | null;
  topPerformerScore: number;
}

export interface ScorecardExportRow {
  name: string;
  designerCode: string;
  compositeScore: number;
  conceptScore: number;
  taskScore: number;
  submitted: number;
  approved: number;
  onTimePct: number | null;
  approvalRate: number;
  verdict: string;
  hasActivity: boolean;
}

export async function exportScorecardsExcel(
  rows: ScorecardExportRow[],
  summary: ScorecardSummary,
  periodLabel: string,
  fileName: string
) {
  const wb: ExcelJS.Workbook = new (await getExcel()).Workbook();
  wb.creator = "LinkD Design Flow";
  wb.created = new Date();

  // ── Sheet 1: Summary ──
  const ws1 = wb.addWorksheet("Summary", { properties: { tabColor: { argb: `FF${WARNING}` } } });
  ws1.columns = [{ width: 28 }, { width: 20 }, { width: 14 }];
  reportTitle(ws1, "DESIGNER SCORECARDS", periodLabel);

  let row = 5;
  sectionTitle(ws1, row, "TEAM SUMMARY");
  row++;
  kpiRows(ws1, row, [
    ["Designers Scored", summary.total],
    ["Avg Composite Score", `${summary.avgScore}/100`],
    ["On Track (≥60)", summary.onTrack],
    ["Needs Support (<40)", summary.needsSupport],
    ["Top Performer", summary.topPerformerName ? `${summary.topPerformerName} (${summary.topPerformerScore})` : "—"],
  ]);

  // ── Sheet 2: Scorecards ──
  const ws2 = wb.addWorksheet("Scorecards", { properties: { tabColor: { argb: `FF${BRAND}` } } });
  const headers = ["Rank", "Designer", "Code", "Composite", "Concept Score", "Task Score", "Submitted", "Approved", "Approval %", "On-Time %", "Verdict"];
  ws2.columns = [8, 22, 8, 12, 14, 12, 11, 11, 12, 12, 16].map((w) => ({ width: w }));
  tableHeader(ws2, 1, headers, 2);
  ws2.getRow(1).height = 24;
  ws2.views = [{ state: "frozen", ySplit: 1 }];

  rows.forEach((d, i) => {
    const r = ws2.getRow(i + 2);
    const vals: (string | number)[] = [
      i + 1, d.name, d.designerCode, d.compositeScore, d.conceptScore, d.taskScore,
      d.submitted, d.approved, `${d.approvalRate}%`,
      d.onTimePct !== null ? `${d.onTimePct}%` : "—", d.verdict,
    ];
    vals.forEach((v, j) => {
      const c = r.getCell(j + 1);
      c.value = v;
      c.alignment = { horizontal: j === 1 || j === 10 ? "left" : "center", vertical: "middle" };
      c.border = ALL_BORDERS;
      c.font = { size: 10 };
    });
    if (i === 0 && d.hasActivity) r.getCell(1).value = "🥇 1";
    else if (i === 1 && d.hasActivity) r.getCell(1).value = "🥈 2";
    else if (i === 2 && d.hasActivity) r.getCell(1).value = "🥉 3";
    if (i % 2 === 1) r.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } }; });

    const scoreCell = r.getCell(4);
    scoreCell.font = { bold: true, size: 12, color: { argb: `FF${scoreColor(d.compositeScore)}` } };
    scoreCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${scoreBg(d.compositeScore)}` } };

    const vc = r.getCell(11);
    const vColor = !d.hasActivity ? "94A3B8" : d.compositeScore >= 80 ? SUCCESS : d.compositeScore >= 60 ? BRAND : d.compositeScore >= 40 ? WARNING : DANGER;
    vc.font = { bold: true, size: 10, color: { argb: `FF${vColor}` } };
  });

  await downloadWorkbook(wb, fileName);
}
