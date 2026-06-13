import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Ban,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { toast, Combobox } from "@/components/ui";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { useSamplingDropdowns } from "@/hooks/useSamplingDropdowns";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { QcInput } from "@/hooks/useSamples";
import type { Sample } from "@/types/database";

// ============================================================================
// Reference values (mirror CRR_SAMPLE_DEV_WORKFLOW.md §3a / §6)
// ============================================================================

const QC_FAILURE_REASONS = [
  "Colour mismatch",
  "Print quality issue",
  "Fusing defect",
  "Wrong design",
  "Damage during production",
  "Other",
] as const;

type Verdict = "pass" | "fail" | null;
type Quality = "good" | "bad" | "";
type FailAction = "resample" | "discard" | "drop" | null;

interface QcRound {
  id: string;
  attempt_no: number;
  outcome: "pass" | "resample" | "discard" | "drop";
  print_quality: string | null;
  fusing_quality: string | null;
  failure_reasons: string[] | null;
  created_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sample: Sample;
  onRecordQc: (
    sampleId: string,
    input: QcInput
  ) => Promise<{ data: unknown; error: string | null }>;
  onSaved?: () => void;
}

// ============================================================================
// Helpers
// ============================================================================

function SectionHeader({
  icon: Icon,
  title,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      {title}
    </div>
  );
}

/** A 2-or-3 option segmented selector. */
function Segmented<T extends string>({
  value,
  onChange,
  options,
  disabled,
}: {
  value: T | "" | null;
  onChange: (v: T) => void;
  options: { value: T; label: string; tone?: "default" | "success" | "danger" }[];
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
              active && opt.tone === "success" && "border-success bg-success/10 text-success shadow-sm",
              active && opt.tone === "danger" && "border-destructive bg-destructive/10 text-destructive shadow-sm",
              active && (!opt.tone || opt.tone === "default") && "border-primary bg-primary/10 text-primary shadow-sm",
              !active && "border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-primary/5",
              disabled && "pointer-events-none opacity-50"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function ReasonGrid({
  selected,
  onChange,
  disabled,
}: {
  selected: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {QC_FAILURE_REASONS.map((opt) => {
        const active = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            disabled={disabled}
            onClick={() =>
              onChange(active ? selected.filter((s) => s !== opt) : [...selected, opt])
            }
            className={cn(
              "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all",
              active
                ? "border-warning bg-warning/10 text-warning shadow-sm"
                : "border-border bg-card text-muted-foreground hover:border-warning/40 hover:bg-warning/5",
              disabled && "pointer-events-none opacity-50"
            )}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// SampleQcDialog
// ============================================================================

export function SampleQcDialog({ open, onOpenChange, sample, onRecordQc, onSaved }: Props) {
  const { names: samplingNames } = useSamplingDropdowns();
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [verdict, setVerdict] = useState<Verdict>(null);
  const [printQuality, setPrintQuality] = useState<Quality>("");
  const [fusingQuality, setFusingQuality] = useState<Quality>("");
  const [doneDate, setDoneDate] = useState("");
  const [printingOperator, setPrintingOperator] = useState("");
  const [fusingOperator, setFusingOperator] = useState("");

  const [failAction, setFailAction] = useState<FailAction>(null);
  const [failureReasons, setFailureReasons] = useState<string[]>([]);
  const [reinspectDate, setReinspectDate] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [rounds, setRounds] = useState<QcRound[]>([]);
  const [loadingRounds, setLoadingRounds] = useState(false);

  // Reset + load prior rounds whenever the dialog opens for a sample.
  useEffect(() => {
    if (!open) return;
    setVerdict(null);
    setPrintQuality("");
    setFusingQuality("");
    setDoneDate("");
    setPrintingOperator("");
    setFusingOperator("");
    setFailAction(null);
    setFailureReasons([]);
    setReinspectDate("");
    setReason("");
    setNotes("");

    let cancelled = false;
    setLoadingRounds(true);
    void supabase
      .from("sample_qc_rounds")
      .select("id, attempt_no, outcome, print_quality, fusing_quality, failure_reasons, created_at")
      .eq("sample_id", sample.id)
      .order("attempt_no", { ascending: true })
      .then(({ data }) => {
        if (cancelled) return;
        setRounds((data as QcRound[]) ?? []);
        setLoadingRounds(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, sample.id]);

  const attemptNo = rounds.length + 1;
  const badReading = printQuality === "bad" || fusingQuality === "bad";

  // What blocks submit (mirrors the server interlock + required fields).
  const blockReason: string | null = (() => {
    if (verdict === null) return "Choose a verdict.";
    if (verdict === "pass") {
      if (!printQuality || !fusingQuality) return "Set print + fusing quality.";
      if (badReading)
        return "Cannot pass with a Bad reading — fix it or switch to Fail.";
      if (!printingOperator || !fusingOperator) return "Select both operators.";
      if (!doneDate) return "Enter the done date.";
      return null;
    }
    // fail
    if (!failAction) return "Pick Resample, Discard, or Drop.";
    if (failAction === "resample" && failureReasons.length === 0)
      return "Select at least one failure reason.";
    if ((failAction === "discard" || failAction === "drop") && !reason.trim() && !notes.trim())
      return "Add a reason or note.";
    return null;
  })();

  async function handleSubmit() {
    if (blockReason) {
      toast.error(blockReason);
      return;
    }
    setSaving(true);

    const input: QcInput =
      verdict === "pass"
        ? {
            outcome: "pass",
            printQuality: printQuality as "good" | "bad",
            fusingQuality: fusingQuality as "good" | "bad",
            doneDate: doneDate || null,
            printingOperator: printingOperator.trim() || null,
            fusingOperator: fusingOperator.trim() || null,
          }
        : failAction === "resample"
          ? {
              outcome: "resample",
              printQuality: printQuality || null,
              fusingQuality: fusingQuality || null,
              failureReasons,
              reinspectDate: reinspectDate || null,
              notes: notes.trim() || null,
            }
          : {
              outcome: failAction as "discard" | "drop",
              reason: reason.trim() || null,
              notes: notes.trim() || null,
              failureReasons,
            };

    const { error } = await onRecordQc(sample.id, input);
    setSaving(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(
      verdict === "pass"
        ? "QC passed — sample completed."
        : failAction === "resample"
          ? "Marked for resampling."
          : `Sample ${failAction === "discard" ? "discarded" : "dropped"}.`
    );
    onSaved?.();
    onOpenChange(false);
  }

  const primaryLabel =
    verdict === "pass"
      ? "Pass & Complete"
      : verdict === "fail" && failAction === "resample"
        ? "Save & Resample"
        : verdict === "fail" && failAction === "discard"
          ? "Discard Sample"
          : verdict === "fail" && failAction === "drop"
            ? "Drop Sample"
            : "Submit QC";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onOpenChange(false); }}>
      <DialogContent
        className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[600px]"
        srTitle="Quality Control"
      >
        {/* Header */}
        <div className="shrink-0 relative overflow-hidden border-b border-primary/15 bg-gradient-to-br from-primary/10 via-primary/[0.04] to-card px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-white shadow-sm shadow-primary/20">
              <ShieldCheck className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold tracking-tight text-foreground sm:text-base">
                Quality Control
              </h2>
              <p className="text-[10px] text-muted-foreground">
                {sample.party_name} {sample.uid ? `· ${sample.uid}` : ""} · Attempt {attemptNo}
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 sm:px-5">
          {/* Previous attempts */}
          {(loadingRounds || rounds.length > 0) && (
            <section className="rounded-lg border border-border bg-secondary/30 px-3 py-2">
              <SectionHeader icon={RotateCcw} title="Previous Attempts" />
              {loadingRounds ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading…
                </div>
              ) : (
                <div className="space-y-1">
                  {rounds.map((r) => (
                    <div key={r.id} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="font-semibold text-foreground">#{r.attempt_no}</span>
                      <Badge
                        className={cn(
                          "text-[9px]",
                          r.outcome === "pass"
                            ? "bg-success/10 text-success"
                            : r.outcome === "resample"
                              ? "bg-warning/10 text-warning"
                              : "bg-destructive/10 text-destructive"
                        )}
                      >
                        {r.outcome}
                      </Badge>
                      {r.failure_reasons && r.failure_reasons.length > 0 && (
                        <span className="truncate">{r.failure_reasons.join(", ")}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Verdict */}
          <section className="rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm">
            <SectionHeader icon={ShieldCheck} title="Pass inspection?" />
            <Segmented<Exclude<Verdict, null>>
              value={verdict}
              onChange={setVerdict}
              disabled={saving}
              options={[
                { value: "pass", label: "Yes — Pass", tone: "success" },
                { value: "fail", label: "No — Fail", tone: "danger" },
              ]}
            />
          </section>

          {/* PASS branch */}
          {verdict === "pass" && (
            <section className="space-y-3 rounded-lg border border-success/30 bg-success/[0.03] px-3 py-2.5">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div>
                  <Label className="mb-1 block text-xs text-muted-foreground">
                    Print quality <span className="text-destructive">*</span>
                  </Label>
                  <Segmented<Exclude<Quality, "">>
                    value={printQuality}
                    onChange={setPrintQuality}
                    disabled={saving}
                    options={[
                      { value: "good", label: "Good", tone: "success" },
                      { value: "bad", label: "Bad", tone: "danger" },
                    ]}
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-xs text-muted-foreground">
                    Fusing quality <span className="text-destructive">*</span>
                  </Label>
                  <Segmented<Exclude<Quality, "">>
                    value={fusingQuality}
                    onChange={setFusingQuality}
                    disabled={saving}
                    options={[
                      { value: "good", label: "Good", tone: "success" },
                      { value: "bad", label: "Bad", tone: "danger" },
                    ]}
                  />
                </div>
              </div>

              {badReading && (
                <p className="flex items-center gap-1.5 rounded-md border border-destructive/20 bg-destructive/5 px-2 py-1.5 text-[11px] text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  A Bad reading can't pass — fix the reading or switch the verdict to Fail.
                </p>
              )}

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div>
                  <Label className="mb-1 block text-xs text-muted-foreground">
                    Printing operator <span className="text-destructive">*</span>
                  </Label>
                  <Combobox
                    value={printingOperator}
                    onChange={setPrintingOperator}
                    options={samplingNames.sampling_done_by.map((n) => ({ value: n, label: n }))}
                    placeholder="Select"
                    disabled={saving}
                    clearable
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-xs text-muted-foreground">
                    Fusing operator <span className="text-destructive">*</span>
                  </Label>
                  <Combobox
                    value={fusingOperator}
                    onChange={setFusingOperator}
                    options={samplingNames.fusing_operator.map((n) => ({ value: n, label: n }))}
                    placeholder="Select"
                    disabled={saving}
                    clearable
                  />
                </div>
              </div>

              <div>
                <Label className="mb-1 block text-xs text-muted-foreground">
                  Done date <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="date"
                  max={today}
                  value={doneDate}
                  onChange={(e) => setDoneDate(e.target.value)}
                  disabled={saving}
                />
              </div>
            </section>
          )}

          {/* FAIL branch */}
          {verdict === "fail" && (
            <section className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/[0.03] px-3 py-2.5">
              <div>
                <SectionHeader icon={XCircle} title="What next?" />
                <Segmented<Exclude<FailAction, null>>
                  value={failAction}
                  onChange={setFailAction}
                  disabled={saving}
                  options={[
                    { value: "resample", label: "Resample" },
                    { value: "discard", label: "Discard" },
                    { value: "drop", label: "Drop" },
                  ]}
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Resample loops back to production (same request). Discard / Drop abandon the
                  sample and notify the ERP.
                </p>
              </div>

              {failAction === "resample" && (
                <>
                  <div>
                    <Label className="mb-1 block text-xs text-muted-foreground">
                      Failure reasons <span className="text-destructive">*</span>
                    </Label>
                    <ReasonGrid selected={failureReasons} onChange={setFailureReasons} disabled={saving} />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs text-muted-foreground">Re-inspect date</Label>
                    <Input
                      type="date"
                      value={reinspectDate}
                      onChange={(e) => setReinspectDate(e.target.value)}
                      disabled={saving}
                    />
                  </div>
                </>
              )}

              {(failAction === "discard" || failAction === "drop") && (
                <div>
                  <Label className="mb-1 block text-xs text-muted-foreground">
                    Reason <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    placeholder={failAction === "discard" ? "e.g. quality unrecoverable" : "e.g. customer no longer needs it"}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    disabled={saving}
                  />
                </div>
              )}

              {failAction && (
                <div>
                  <Label className="mb-1 block text-xs text-muted-foreground">Notes</Label>
                  <textarea
                    rows={2}
                    className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                    placeholder="Optional details"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={saving}
                  />
                </div>
              )}
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-between gap-2 border-t border-border bg-card/80 px-4 py-2.5">
          <span className="text-[10px] text-muted-foreground">
            {blockReason ?? "Ready"}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <LoadingButton
              size="sm"
              loading={saving}
              disabled={!!blockReason}
              onClick={handleSubmit}
              className={cn(
                verdict === "fail" && (failAction === "discard" || failAction === "drop")
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : verdict === "pass"
                    ? "bg-success text-white hover:bg-success/90"
                    : undefined
              )}
            >
              {verdict === "pass" ? (
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              ) : verdict === "fail" && failAction === "resample" ? (
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              ) : verdict === "fail" && failAction === "discard" ? (
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              ) : verdict === "fail" && failAction === "drop" ? (
                <Ban className="mr-1.5 h-3.5 w-3.5" />
              ) : null}
              {primaryLabel}
            </LoadingButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
