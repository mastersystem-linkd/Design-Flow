import * as XLSX from "xlsx";
import type { DesignerConceptStat } from "@/hooks/useAnalytics";

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

export function exportConceptDashboardExcel(
  designers: DesignerConceptStat[],
  kpis: KpiSummary,
  fileName: string
) {
  const wb = XLSX.utils.book_new();

  // ── Sheet 1: Summary KPIs ──
  const summaryData = [
    ["CONCEPT DASHBOARD REPORT"],
    [`Period: ${kpis.periodLabel}`],
    [`Generated: ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}`],
    [],
    ["KEY METRICS"],
    ["Total Submitted", kpis.totalSubmitted],
    ["Total Approved", kpis.totalApproved],
    ["Total Rejected", kpis.totalRejected],
    ["Total Completed", kpis.totalCompleted],
    ["Approval Rate", `${kpis.approvalRate}%`],
    ["Completion Rate", `${kpis.completionRate}%`],
    ["Avg Review Time", kpis.avgReviewHours > 0 ? `${kpis.avgReviewHours}h` : "—"],
    [],
    ["PIPELINE STATUS"],
    ["Status", "Count", "Percentage"],
    ...kpis.pipeline.map((p) => [p.status, p.count, `${p.percentage}%`]),
    [],
    ["CONVERSION FUNNEL"],
    ["Submitted → Reviewed", `${kpis.conversionRates.submittedToReviewed}%`],
    ["Reviewed → Approved", `${kpis.conversionRates.reviewedToApproved}%`],
    ["Approved → Completed", `${kpis.completionRate}%`],
    [],
    ["QUALITY INDICATORS"],
    ["First-Pass Approval Rate", kpis.workStatus.firstPassRate !== null ? `${kpis.workStatus.firstPassRate}%` : "—"],
    ["Avg Revision Rounds", kpis.workStatus.avgRevisionRounds !== null ? kpis.workStatus.avgRevisionRounds.toFixed(1) : "—"],
    ["Avg Design Days", kpis.workStatus.avgDesignDays !== null ? `${kpis.workStatus.avgDesignDays}d` : "—"],
    ["Currently In Flight", kpis.workStatus.inFlight],
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary["!cols"] = [{ wch: 28 }, { wch: 16 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

  // ── Sheet 2: Designer Breakdown ──
  const designerHeaders = [
    "Designer",
    "Code",
    "Submitted",
    "Approved",
    "Rejected",
    "In Revision",
    "Revision Cycles",
    "Completed",
    "Approval Rate %",
    "Completion Rate %",
    "Avg Review Hours",
    "Monthly Target",
    "Score /100",
  ];

  const designerRows = designers.map((d) => {
    const approvalRate = d.submitted > 0
      ? Math.round((d.approved / Math.max(1, d.approved + d.rejected + d.revisions)) * 100)
      : 0;
    const completionPct = d.approved > 0
      ? Math.round((d.completed / d.approved) * 100)
      : 0;
    return [
      d.full_name,
      d.designerCode,
      d.submitted,
      d.approved,
      d.rejected,
      d.revisions,
      d.revisionCycles,
      d.completed,
      approvalRate,
      completionPct,
      d.avgApprovalHours > 0 ? Number(d.avgApprovalHours.toFixed(1)) : 0,
      d.target,
      d.score,
    ];
  });

  const wsDesigners = XLSX.utils.aoa_to_sheet([designerHeaders, ...designerRows]);
  wsDesigners["!cols"] = [
    { wch: 20 }, { wch: 6 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 12 },
    { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 10 },
  ];
  XLSX.utils.book_append_sheet(wb, wsDesigners, "Designer Breakdown");

  // ── Sheet 3: Pipeline Chart Data ──
  const pipelineHeaders = ["Status", "Count", "Percentage"];
  const pipelineRows = kpis.pipeline.map((p) => [p.status, p.count, p.percentage]);
  const wsPipeline = XLSX.utils.aoa_to_sheet([pipelineHeaders, ...pipelineRows]);
  wsPipeline["!cols"] = [{ wch: 20 }, { wch: 10 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsPipeline, "Pipeline");

  // ── Sheet 4: Score Ranking ──
  const rankHeaders = ["Rank", "Designer", "Score", "Submitted", "Approved", "Approval Rate %"];
  const sorted = [...designers].sort((a, b) => b.score - a.score);
  const rankRows = sorted.map((d, i) => {
    const approvalRate = d.submitted > 0
      ? Math.round((d.approved / Math.max(1, d.approved + d.rejected + d.revisions)) * 100)
      : 0;
    return [i + 1, d.full_name, d.score, d.submitted, d.approved, approvalRate];
  });
  const wsRank = XLSX.utils.aoa_to_sheet([rankHeaders, ...rankRows]);
  wsRank["!cols"] = [{ wch: 6 }, { wch: 20 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, wsRank, "Score Ranking");

  XLSX.writeFile(wb, `${fileName}.xlsx`);
}
