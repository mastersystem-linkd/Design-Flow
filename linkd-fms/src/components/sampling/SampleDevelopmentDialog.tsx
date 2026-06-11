import { useEffect, useMemo, useState } from "react";
import { Loader2, Layers, Ruler, Scissors, Calculator, Package } from "lucide-react";
import { toast, Combobox } from "@/components/ui";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { useFabrics } from "@/hooks/useFabrics";
import { useAuth } from "@/hooks/useAuth";
import { getKittingBySample, initiateKitting } from "@/lib/kittingQueries";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { Sample } from "@/types/database";

// ============================================================================
// Constants — ERP-aligned sample development options
// ============================================================================

const FABRIC_WIDTHS = [
  '36"', '44"', '48"', '54"', '58"', '60"', '64"', '72"',
] as const;

const SAMPLE_TYPES = [
  '6×4"',
  '6×6"',
  '8×8"',
  '9×9"',
  '11×11"',
  '15×15"',
  '3-Fold Card (8×18")',
  'Booklet (12×18")',
  'Blanket (72×90")',
  'Master Folder (36×54")',
  'Yardage (36×100")',
  'Panel (18×24")',
] as const;

// ============================================================================
// Types
// ============================================================================

export interface SampleDevelopmentPayload {
  design_count: number;
  fabric_type: string;
  fabric_widths: string[];
  sample_types: string[];
  estimated_meters: number;
  actual_meters: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sample: Sample;
  onSaved?: () => void;
}

// ============================================================================
// Helpers
// ============================================================================

function SectionHeader({ icon: Icon, title }: { icon: React.ComponentType<{ className?: string }>; title: string }) {
  return (
    <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      {title}
    </div>
  );
}

function CheckboxGrid({
  options,
  selected,
  onChange,
  disabled,
}: {
  options: readonly string[];
  selected: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
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
                ? "border-primary bg-primary/10 text-primary shadow-sm"
                : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-primary/5",
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
// SampleDevelopmentDialog
// ============================================================================

export function SampleDevelopmentDialog({ open, onOpenChange, sample, onSaved }: Props) {
  const { user } = useAuth();
  const { fabrics } = useFabrics();

  const [designCount, setDesignCount] = useState("");
  const [fabricType, setFabricType] = useState("");
  const [fabricWidths, setFabricWidths] = useState<string[]>([]);
  const [sampleTypes, setSampleTypes] = useState<string[]>([]);
  const [actualMeters, setActualMeters] = useState("");

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [existingFkId, setExistingFkId] = useState<string | null>(null);

  const estimate = useMemo(() => {
    const d = Number(designCount) || 0;
    const w = fabricWidths.length || 1;
    const t = sampleTypes.length || 1;
    return d * w * t;
  }, [designCount, fabricWidths, sampleTypes]);

  // Load existing FK row or pre-fill from external_brief
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const { data: fk } = await getKittingBySample(sample.id);
        if (cancelled) return;

        if (fk?.form_payload) {
          const p = fk.form_payload as unknown as SampleDevelopmentPayload;
          setDesignCount(p.design_count ? String(p.design_count) : "");
          setFabricType(p.fabric_type || "");
          setFabricWidths(p.fabric_widths || []);
          setSampleTypes(p.sample_types || []);
          setActualMeters(p.actual_meters != null ? String(p.actual_meters) : "");
          setExistingFkId(fk.id);
        } else if (fk) {
          setExistingFkId(fk.id);
          prefillFromBrief();
        } else {
          setExistingFkId(null);
          prefillFromBrief();
        }
      } catch {
        prefillFromBrief();
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    function prefillFromBrief() {
      const eb = sample.external_brief as Record<string, unknown> | null;
      setDesignCount(eb?.design_count ? String(eb.design_count) : "");
      setFabricType((eb?.fabric_source as string) || sample.quality || "");
      setFabricWidths(Array.isArray(eb?.widths) ? (eb.widths as string[]) : []);
      setSampleTypes(Array.isArray(eb?.sample_types) ? (eb.sample_types as string[]) : []);
      setActualMeters(
        eb?.actual_meters ? String(eb.actual_meters) : sample.printed_mtr ? String(sample.printed_mtr) : ""
      );
    }

    load();
    return () => { cancelled = true; };
  }, [open, sample.id, sample.external_brief, sample.quality, sample.printed_mtr]);

  async function handleSave() {
    if (!user) return;
    const dc = Number(designCount) || 0;
    if (dc < 1) {
      toast.error("Number of designs is required (≥ 1).");
      return;
    }
    if (!fabricType.trim()) {
      toast.error("Fabric type is required.");
      return;
    }
    if (fabricWidths.length === 0) {
      toast.error("Select at least one fabric width.");
      return;
    }
    if (sampleTypes.length === 0) {
      toast.error("Select at least one sample type.");
      return;
    }

    setSaving(true);

    const payload: SampleDevelopmentPayload = {
      design_count: dc,
      fabric_type: fabricType.trim(),
      fabric_widths: fabricWidths,
      sample_types: sampleTypes,
      estimated_meters: estimate,
      actual_meters: actualMeters ? Number(actualMeters) : null,
    };

    try {
      if (existingFkId) {
        // Update existing FK row
        const { error } = await supabase
          .from("full_kitting_details")
          .update({
            form_payload: payload as unknown as Record<string, unknown>,
            data_entry_status: "completed",
            party_name: sample.party_name || null,
            form_date: new Date().toISOString().slice(0, 10),
          })
          .eq("id", existingFkId);

        if (error) {
          toast.error(`Failed to update: ${error.message}`);
          setSaving(false);
          return;
        }
      } else {
        // Create new FK row linked to sample
        const { error, data } = await initiateKitting({
          sampleId: sample.id,
          submittedBy: user.id,
          imageUrl: sample.full_kitting_image_url || "development-form-only",
          partyName: sample.party_name || null,
          formDate: new Date().toISOString().slice(0, 10),
        });

        if (error) {
          toast.error(`Failed to save: ${error}`);
          setSaving(false);
          return;
        }

        // Now update the FK row with form_payload
        if (data?.id) {
          await supabase
            .from("full_kitting_details")
            .update({
              form_payload: payload as unknown as Record<string, unknown>,
              data_entry_status: "completed",
            })
            .eq("id", data.id);
          setExistingFkId(data.id);
        }
      }

      // Update sample with development details
      await supabase
        .from("samples")
        .update({
          requires_full_kitting: true,
          quality: fabricType.trim() || sample.quality,
          printed_mtr: actualMeters ? Number(actualMeters) : sample.printed_mtr,
        })
        .eq("id", sample.id);

      toast.success("Sample development details saved");
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(`Unexpected error: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  const isErp = sample.source === "sales_erp";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onOpenChange(false); }}>
      <DialogContent
        className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[600px]"
        srTitle="Start Sample Development"
      >
        {/* Header */}
        <div className="shrink-0 relative overflow-hidden border-b border-primary/15 bg-gradient-to-br from-primary/10 via-primary/[0.04] to-card px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-white shadow-sm shadow-primary/20">
              <Layers className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold tracking-tight text-foreground sm:text-base">
                Start Sample Development
              </h2>
              <p className="text-[10px] text-muted-foreground">
                {sample.party_name} {sample.uid ? `· ${sample.uid}` : ""}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              {isErp && (
                <Badge className="border border-blue-500/20 bg-blue-500/10 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                  Sales ERP
                </Badge>
              )}
              {existingFkId && (
                <Badge className="border border-success/20 bg-success/10 text-[10px] font-medium text-success">
                  Saved
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 sm:px-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Loading development details…</span>
            </div>
          ) : (
            <>
              {/* Design Count + Fabric Type */}
              <section className="rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm transition-colors hover:border-primary/30">
                <SectionHeader icon={Package} title="Design Details" />
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <div>
                    <Label className="mb-1 block text-xs text-muted-foreground">
                      Number of Designs <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      placeholder="e.g. 10"
                      value={designCount}
                      onChange={(e) => setDesignCount(e.target.value)}
                      disabled={saving}
                    />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs text-muted-foreground">
                      Fabric Type <span className="text-destructive">*</span>
                    </Label>
                    <Combobox
                      value={fabricType}
                      onChange={setFabricType}
                      options={fabrics.map((f) => ({ value: f.name, label: f.name }))}
                      placeholder="Select fabric"
                      disabled={saving}
                      clearable
                    />
                  </div>
                </div>
              </section>

              {/* Fabric Widths */}
              <section className="rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm transition-colors hover:border-primary/30">
                <SectionHeader icon={Ruler} title="Fabric Width" />
                <p className="mb-2 text-[10px] text-muted-foreground">
                  Select all widths required <span className="text-destructive">*</span>
                </p>
                <CheckboxGrid
                  options={FABRIC_WIDTHS}
                  selected={fabricWidths}
                  onChange={setFabricWidths}
                  disabled={saving}
                />
              </section>

              {/* Sample Types */}
              <section className="rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm transition-colors hover:border-primary/30">
                <SectionHeader icon={Scissors} title="Sample Type" />
                <p className="mb-2 text-[10px] text-muted-foreground">
                  Select all sample formats required <span className="text-destructive">*</span>
                </p>
                <CheckboxGrid
                  options={SAMPLE_TYPES}
                  selected={sampleTypes}
                  onChange={setSampleTypes}
                  disabled={saving}
                />
              </section>

              {/* Estimate + Actual */}
              <section className="rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm transition-colors hover:border-primary/30">
                <SectionHeader icon={Calculator} title="Quantity" />
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <div>
                    <Label className="mb-1 block text-xs text-muted-foreground">
                      Estimate (computed)
                    </Label>
                    <div className="flex h-9 items-center rounded-md border border-border bg-secondary/50 px-3 font-mono text-sm tabular-nums text-foreground">
                      {estimate}
                    </div>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {Number(designCount) || 0} designs × {fabricWidths.length || 1} widths × {sampleTypes.length || 1} types
                    </p>
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs text-muted-foreground">
                      Actual Sampling Qty (mtr)
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.5}
                      placeholder="Enter actual meters"
                      value={actualMeters}
                      onChange={(e) => setActualMeters(e.target.value)}
                      disabled={saving}
                    />
                  </div>
                </div>
              </section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-end gap-2 border-t border-border bg-card/80 px-4 py-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <LoadingButton
            size="sm"
            loading={saving}
            disabled={loading}
            onClick={handleSave}
          >
            {existingFkId ? "Update Development" : "Save Development"}
          </LoadingButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
