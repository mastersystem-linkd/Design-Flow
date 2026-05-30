import { useEffect, useMemo, useState, useCallback } from "react";
import {
  ClipboardList,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Save,
  Link2,
  Plus,
} from "lucide-react";
import {
  Button,
  LoadingButton,
  toast,
} from "@/components/ui";
import { Combobox } from "@/components/ui/Combobox";
import { Input } from "@/components/ui/input";
import { useClients } from "@/hooks/useClients";
import { useAssignedByOptions } from "@/hooks/useAssignedByOptions";
import { useReceivedByOptions } from "@/hooks/useReceivedByOptions";
import { cn } from "@/lib/utils";

// ============================================================================
// Full Kitting Form — fields that mirror the physical paper form
// ============================================================================
//
// One canonical TS type, one stateful form body, one reusable chip primitive.
// No external form library — values live in a single `useState` so the page
// wrapper, modal, and drawer can all reuse `FullKittingForm` without rewiring.
// ============================================================================

export type KittingFormValues = {
  partyName: string;
  date: string;
  day: string;
  channel: "Online" | "Offline" | "";
  assignedBy: string;
  receivedBy: string;

  // Field 1
  fabricSource: "Party Fabric" | "If In House" | "";
  fabricName: string;

  // Field 2
  fabricWidths: string[];
  fabricWidthOther: string;

  // Field 3
  designCount: string;
  designCountOther: string;

  // Field 4
  designTypes: string[];
  designTypeOther: string;

  // Field 5
  colourThemes: string[];
  colourThemeOther: string;

  // Field 6
  backgroundColour: string;
  backgroundColourOther: string;

  // Field 7
  garmentApplications: string[];
  garmentApplicationOther: string;

  // Field 8
  motivePrintSize: "Big" | "Medium" | "Small" | "";

  // Field 9
  concept: string;
  conceptNotes: string;

  // Field 10
  apcCuttingReceived: "No" | "Yes" | "";
  apcReceivedBy: string;

  // Field 11
  additionalRequirement: "No" | "Yes" | "";
  additionalRequirementDetail: string;

  // Field 12
  priority: "Very Urgent" | "2 Days" | "3 Days" | "4 Days" | "5 Days" | "";
  priorityNotes: string;
};

/**
 * True if any field in the kitting form has been touched away from defaults.
 * Used to decide whether a brief-time submission should skip the DEO queue
 * (form was filled inline by the coordinator) or land as pending-DEO.
 */
export function hasKittingFormContent(v: KittingFormValues): boolean {
  return (
    !!v.partyName.trim() ||
    !!v.date ||
    !!v.assignedBy.trim() ||
    !!v.receivedBy.trim() ||
    !!v.channel ||
    !!v.fabricSource ||
    !!v.fabricName.trim() ||
    v.fabricWidths.length > 0 ||
    !!v.fabricWidthOther.trim() ||
    !!v.designCount ||
    !!v.designCountOther.trim() ||
    v.designTypes.length > 0 ||
    !!v.designTypeOther.trim() ||
    v.colourThemes.length > 0 ||
    !!v.colourThemeOther.trim() ||
    !!v.backgroundColour ||
    !!v.backgroundColourOther.trim() ||
    v.garmentApplications.length > 0 ||
    !!v.garmentApplicationOther.trim() ||
    !!v.motivePrintSize ||
    !!v.concept ||
    !!v.conceptNotes.trim() ||
    !!v.apcCuttingReceived ||
    !!v.apcReceivedBy.trim() ||
    !!v.additionalRequirement ||
    !!v.additionalRequirementDetail.trim() ||
    !!v.priority ||
    !!v.priorityNotes.trim()
  );
}

export const KITTING_DEFAULT_VALUES: KittingFormValues = {
  partyName: "",
  date: "",
  day: "",
  channel: "",
  assignedBy: "",
  receivedBy: "",
  fabricSource: "",
  fabricName: "",
  fabricWidths: [],
  fabricWidthOther: "",
  designCount: "",
  designCountOther: "",
  designTypes: [],
  designTypeOther: "",
  colourThemes: [],
  colourThemeOther: "",
  backgroundColour: "",
  backgroundColourOther: "",
  garmentApplications: [],
  garmentApplicationOther: "",
  motivePrintSize: "",
  concept: "",
  conceptNotes: "",
  apcCuttingReceived: "",
  apcReceivedBy: "",
  additionalRequirement: "",
  additionalRequirementDetail: "",
  priority: "",
  priorityNotes: "",
};

// ----------------------------------------------------------------------------
// KittingChip — reusable single/multi-select chip
// ----------------------------------------------------------------------------

export interface KittingChipProps {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  /** Optional tone override for selected state (defaults to primary). */
  tone?: "primary" | "success" | "warning" | "destructive";
  disabled?: boolean;
  className?: string;
}

const CHIP_TONE_CLASSES: Record<NonNullable<KittingChipProps["tone"]>, string> = {
  primary: "bg-primary text-white border-transparent shadow-sm",
  success: "bg-success text-white border-transparent shadow-sm",
  warning: "bg-warning text-white border-transparent shadow-sm",
  destructive: "bg-destructive text-white border-transparent shadow-sm",
};

export function KittingChip({
  selected,
  onClick,
  children,
  tone = "primary",
  disabled,
  className,
}: KittingChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        // Resting chips are borderless (just a soft fill) so a dense group of
        // options reads calm, not boxed-in. Selected chips fill with tone.
        "inline-flex items-center rounded-full border border-transparent px-2.5 py-1 text-[11px] font-medium transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        selected
          ? CHIP_TONE_CLASSES[tone]
          : "bg-secondary/70 text-muted-foreground hover:bg-primary/10 hover:text-primary",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
    >
      {children}
    </button>
  );
}

// ----------------------------------------------------------------------------
// Reveal — animated max-height + opacity reveal for conditional fields
// ----------------------------------------------------------------------------

function Reveal({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid overflow-hidden transition-all duration-200",
        open
          ? "mt-1.5 grid-rows-[1fr] opacity-100"
          : "grid-rows-[0fr] opacity-0"
      )}
    >
      <div className="min-h-0">{children}</div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// SectionCard — wraps each numbered field block
// ----------------------------------------------------------------------------

function SectionCard({
  index,
  title,
  required,
  error,
  children,
}: {
  index: number;
  title: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        // mb-2 + break-inside-avoid make these pack cleanly inside the masonry
        // (CSS columns) container. Flat (no shadow) + soft border keeps a dense
        // 12-section form calm rather than boxed-in and noisy.
        "mb-2 break-inside-avoid rounded-lg border border-border/60 bg-card px-3 py-2 transition-colors hover:border-primary/30"
      )}
    >
      <header className="mb-1.5 flex items-center gap-1.5">
        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-primary/10 text-[9px] font-semibold tabular-nums text-primary">
          {index}
        </span>
        <h3 className="text-xs font-semibold text-foreground">
          {title}
          {required && <span className="ml-0.5 text-destructive">*</span>}
        </h3>
      </header>
      <div>{children}</div>
      {error && (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="h-3 w-3 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </section>
  );
}

// "＋ Other" reveal toggle — appended to a chip row to expose the free-text
// custom-value input only when the user opts in (keeps the form compact).
function OtherToggle({
  active,
  onClick,
}: {
  active: boolean;
  onClick: () => void;
}) {
  return (
    <KittingChip selected={active} onClick={onClick} className="gap-0.5">
      <Plus className="h-3 w-3" aria-hidden />
      Other
    </KittingChip>
  );
}

// ----------------------------------------------------------------------------
// FieldLabel + FormInput — header info row primitives
// ----------------------------------------------------------------------------

function FieldLabel({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
      {required && <span className="ml-0.5 text-destructive">*</span>}
    </span>
  );
}

// ----------------------------------------------------------------------------
// Static option lists from the physical form
// ----------------------------------------------------------------------------

const FABRIC_WIDTHS = ["36", "44", "48", "54", "58", "60", "64", "72"] as const;
const DESIGN_COUNTS = ["10", "20", "30", "40", "50", "100"] as const;
const DESIGN_TYPES_ROW_1 = [
  "Abstract",
  "Geometric",
  "Checks",
  "Stripes",
  "Ethnic",
  "Sober",
  "Kids",
  "Floral",
  "Open",
  "Polka Dots",
  "Panel",
] as const;
const DESIGN_TYPES_ROW_2 = [
  "Placements",
  "Tribal",
  "Brand Taste",
  "Indian",
  "All Over",
  "Counter Taste",
  "Garment Taste",
] as const;
const COLOUR_THEMES = [
  "Dusty",
  "Dark–Light",
  "Bright",
  "Pastel",
  "Negative / Positive",
  "Tonal",
  "Multicolour",
] as const;
const BACKGROUND_COLOURS = [
  "White",
  "Dark",
  "Dusty",
  "Bright",
  "Pastel",
  "Beige",
] as const;
const GARMENT_APPS = ["Kids", "Mens", "Ladies", "Curtains"] as const;
const MOTIVE_SIZES = ["Big", "Medium", "Small"] as const;
const CONCEPTS = ["Same", "APC", "Similar", "Different", "New Concept"] as const;
const PRIORITIES = [
  "Very Urgent",
  "2 Days",
  "3 Days",
  "4 Days",
  "5 Days",
] as const;

const PRIORITY_TONE: Record<
  (typeof PRIORITIES)[number],
  NonNullable<KittingChipProps["tone"]>
> = {
  "Very Urgent": "destructive",
  "2 Days": "warning",
  "3 Days": "warning",
  "4 Days": "primary",
  "5 Days": "success",
};

// ----------------------------------------------------------------------------
// Validation + completion progress
// ----------------------------------------------------------------------------

interface FormErrors {
  partyName?: string;
  date?: string;
  assignedBy?: string;
  fabricSource?: string;
  priority?: string;
}

function validate(v: KittingFormValues): FormErrors {
  const e: FormErrors = {};
  if (!v.partyName.trim()) e.partyName = "Party name is required.";
  if (!v.date) e.date = "Pick a date.";
  if (!v.assignedBy.trim()) e.assignedBy = "Assigned by is required.";
  if (!v.fabricSource) e.fabricSource = "Pick fabric source.";
  if (!v.priority) e.priority = "Pick a priority.";
  return e;
}

/**
 * Crude completion meter — counts header + 12 numbered sections, each as a
 * single "filled" unit. Multi-selects count when at least one chip is picked
 * or the free-text "other" line is non-empty. Conditional reveals don't
 * inflate the denominator — they're folded into their parent field.
 */
function computeCompletion(v: KittingFormValues): { filled: number; total: number } {
  const checks: boolean[] = [
    // Header — 6 fields collapse to one "info filled" bucket so 12 sections
    // dominate the bar and the meter reflects the real form, not the metadata.
    !!(v.partyName && v.date && v.assignedBy),
    !!v.fabricSource,
    v.fabricWidths.length > 0 || v.fabricWidthOther.trim().length > 0,
    !!v.designCount || v.designCountOther.trim().length > 0,
    v.designTypes.length > 0 || v.designTypeOther.trim().length > 0,
    v.colourThemes.length > 0 || v.colourThemeOther.trim().length > 0,
    !!v.backgroundColour || v.backgroundColourOther.trim().length > 0,
    v.garmentApplications.length > 0 || v.garmentApplicationOther.trim().length > 0,
    !!v.motivePrintSize,
    !!v.concept || v.conceptNotes.trim().length > 0,
    !!v.apcCuttingReceived,
    !!v.additionalRequirement,
    !!v.priority,
  ];
  return { filled: checks.filter(Boolean).length, total: checks.length };
}

// ----------------------------------------------------------------------------
// FullKittingForm — the form body (header + 12 sections + footer)
// ----------------------------------------------------------------------------

export interface FullKittingFormProps {
  defaultValues?: Partial<KittingFormValues>;
  onSubmit: (values: KittingFormValues) => Promise<void> | void;
  onDraftSave?: (values: KittingFormValues) => Promise<void> | void;
  /** Optional cancel/back action — renders a Clear button by default. */
  submitLabel?: string;
  /** Linked task code (e.g. "DF 17-P0526-ARAB-10M") for the read-only UID
   *  display in Brief Details. Null/undefined when the form isn't bound to
   *  a task (preview / new). */
  taskCode?: string | null;
  /** Pre-filled from the linked task for read-only display in Brief Details. */
  designerName?: string | null;
  conceptName?: string | null;
  descriptionText?: string | null;
  /**
   * When true, the form renders without its sticky header/footer and as a
   * plain `<div>` (so it can be embedded inside another `<form>` like the
   * New Brief flow). The "required" markers are also dropped because the
   * outer form decides whether anything is mandatory.
   */
  embedded?: boolean;
  /**
   * Fires on every value change. Used when the form is embedded inside a
   * larger flow so the parent can read the current values at submit time.
   */
  onValuesChange?: (values: KittingFormValues) => void;
}

export function FullKittingForm({
  defaultValues,
  onSubmit,
  onDraftSave,
  submitLabel = "Submit Knitting Form",
  taskCode,
  designerName,
  conceptName,
  descriptionText,
  embedded = false,
  onValuesChange,
}: FullKittingFormProps) {
  const [values, setValues] = useState<KittingFormValues>({
    ...KITTING_DEFAULT_VALUES,
    ...defaultValues,
  });
  const [submitting, setSubmitting] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  // Per-section "Other / custom" reveal. Open when the user taps the chip OR a
  // value already exists (e.g. resuming a draft) so nothing is ever hidden.
  const [othersOpen, setOthersOpen] = useState<Record<string, boolean>>({});
  const isOtherOpen = (key: string, val: string) =>
    !!othersOpen[key] || val.trim().length > 0;
  const toggleOther = (key: string) =>
    setOthersOpen((p) => ({ ...p, [key]: !p[key] }));

  // Embedded mode: propagate every change to the parent so it can read the
  // current values at outer-form submit time.
  useEffect(() => {
    if (embedded && onValuesChange) onValuesChange(values);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, embedded]);

  // In embedded mode the outer form decides what's required — drop the
  // local asterisks so the user doesn't think these fields are mandatory.
  const reqd = !embedded;

  // Client roster powers the Party Name search-as-you-type. Free-typed values
  // outside this list are also accepted (the Combobox falls back to the raw
  // text via the `creatable` mode below).
  const { clients } = useClients();
  const partyOptions = useMemo(
    () =>
      clients.map((c) => ({
        value: c.party_name,
        label: c.party_name,
      })),
    [clients]
  );

  // Named coordinators / stakeholders — admin-managed from Settings →
  // Assigned By (Full Knitting context).
  const { names: assignedByNames } = useAssignedByOptions("full_kitting");
  const assignedByOptions = useMemo(
    () =>
      assignedByNames.map((name) => ({
        value: name,
        label: name,
      })),
    [assignedByNames]
  );

  // "Received By" — admin-managed from Settings → Received By.
  const { names: receivedByNames } = useReceivedByOptions();
  const receivedByOptions = useMemo(
    () =>
      receivedByNames.map((name) => ({
        value: name,
        label: name,
      })),
    [receivedByNames]
  );

  // Day auto-derives from Date (locale "en-IN" returns "Monday", "Tuesday", …).
  useEffect(() => {
    if (!values.date) {
      if (values.day) setValues((v) => ({ ...v, day: "" }));
      return;
    }
    const parsed = new Date(values.date);
    if (Number.isNaN(parsed.getTime())) return;
    const day = parsed.toLocaleDateString("en-IN", { weekday: "long" });
    if (day !== values.day) setValues((v) => ({ ...v, day }));
  }, [values.date, values.day]);

  const errors = useMemo(() => validate(values), [values]);
  const hasErrors = Object.keys(errors).length > 0;
  const completion = useMemo(() => computeCompletion(values), [values]);
  const completionPct = Math.round((completion.filled / completion.total) * 100);

  // Typed setter helper — narrows the key + value pair so callers can't drift
  // off the canonical shape.
  const setField = useCallback(
    <K extends keyof KittingFormValues>(key: K, value: KittingFormValues[K]) => {
      setValues((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  // Toggle helper for multi-select chip arrays.
  const toggleInArray = useCallback(
    (
      key:
        | "fabricWidths"
        | "designTypes"
        | "colourThemes"
        | "garmentApplications",
      option: string
    ) => {
      setValues((prev) => {
        const list = prev[key];
        const next = list.includes(option)
          ? list.filter((o) => o !== option)
          : [...list, option];
        return { ...prev, [key]: next };
      });
    },
    []
  );

  function handleClear() {
    setValues({ ...KITTING_DEFAULT_VALUES });
    setShowErrors(false);
    toast.info("Form cleared");
  }

  async function handleDraft() {
    if (!onDraftSave) return;
    setDraftSaving(true);
    try {
      await onDraftSave(values);
      toast.success("Draft saved");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't save draft"
      );
    } finally {
      setDraftSaving(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (hasErrors) {
      setShowErrors(true);
      toast.error("Fill in the required fields before submitting.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(values);
      toast.success("Full knitting form submitted!");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Submit failed"
      );
    } finally {
      setSubmitting(false);
    }
  }

  const formContent = (
    <>
      {!embedded && (
      <div className="sticky top-0 z-10 -mx-1 rounded-lg border border-primary/15 bg-gradient-to-br from-primary/10 via-primary/[0.04] to-card px-3 py-1.5 shadow-sm backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary text-white shadow-sm shadow-primary/20">
            <ClipboardList className="h-3.5 w-3.5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold leading-tight tracking-tight text-foreground">
              Full Knitting Form
            </h2>
            <p className="text-[10px] leading-tight text-muted-foreground">
              Linkd Prints — Design Brief
            </p>
          </div>
          <div className="hidden text-right sm:block">
            <p className="flex items-center justify-end gap-1.5 text-[11px] font-medium text-muted-foreground">
              {completion.filled === completion.total && (
                <CheckCircle2 className="h-3 w-3 text-success" aria-hidden />
              )}
              {completion.filled} of {completion.total} fields filled
            </p>
            <div className="mt-1 h-1 w-36 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                style={{ width: `${completionPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>
      )}

      {/* ── Header info section ── */}
      <section className="rounded-lg border border-border/60 bg-card px-3 py-2 transition-colors hover:border-primary/30">
        <h3 className="mb-1 text-xs font-semibold text-foreground">
          Brief details
        </h3>

        {/* UID — read-only, sourced from the linked task. Lets the DEO
            confirm they're filling the right form without scrolling back
            to the page header. Hidden when not bound to a task. */}
        {taskCode && (
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/30 px-2 py-1 text-[11px]">
              <Link2 className="h-3 w-3 text-muted-foreground" aria-hidden />
              <span className="font-semibold uppercase tracking-wider text-muted-foreground">UID</span>
              <span className="font-mono text-primary">{taskCode}</span>
            </div>
            {designerName && (
              <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/30 px-2 py-1 text-[11px]">
                <span className="font-semibold uppercase tracking-wider text-muted-foreground">Designer</span>
                <span className="font-medium text-foreground">{designerName}</span>
              </div>
            )}
            {conceptName && (
              <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/30 px-2 py-1 text-[11px]">
                <span className="font-semibold uppercase tracking-wider text-muted-foreground">Concept</span>
                <span className="font-medium text-foreground">{conceptName}</span>
              </div>
            )}
            {descriptionText && (
              <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/30 px-2 py-1 text-[11px]">
                <span className="font-semibold uppercase tracking-wider text-muted-foreground">Desc</span>
                <span className="max-w-[250px] truncate font-medium text-foreground" title={descriptionText}>{descriptionText}</span>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-x-2 gap-y-1.5 sm:grid-cols-3">
          <div>
            <FieldLabel required={reqd}>Party Name</FieldLabel>
            <Combobox
              value={values.partyName}
              onChange={(v) => setField("partyName", v)}
              options={partyOptions}
              placeholder="Search party…"
              searchPlaceholder="Type to filter clients…"
              emptyMessage="No party matches — ask admin to add it"
              clearable
            />
            {showErrors && errors.partyName && (
              <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-3 w-3" aria-hidden />
                {errors.partyName}
              </p>
            )}
          </div>

          <label>
            <FieldLabel required={reqd}>Date</FieldLabel>
            <Input
              type="date"
              className="h-8"
              value={values.date}
              onChange={(e) => setField("date", e.target.value)}
            />
            {showErrors && errors.date && (
              <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-3 w-3" aria-hidden />
                {errors.date}
              </p>
            )}
          </label>

          <label>
            <FieldLabel>Day</FieldLabel>
            <Input
              value={values.day}
              readOnly
              placeholder="Auto-fills from date"
              className="h-8 bg-secondary/40 text-muted-foreground"
            />
          </label>

          <div>
            <FieldLabel>Online / Offline</FieldLabel>
            <div className="inline-flex rounded-lg bg-secondary p-0.5">
              {(["Online", "Offline"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() =>
                    setField(
                      "channel",
                      values.channel === opt ? "" : opt
                    )
                  }
                  className={cn(
                    "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                    values.channel === opt
                      ? "bg-primary text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  aria-pressed={values.channel === opt}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div>
            <FieldLabel required={reqd}>Assigned By</FieldLabel>
            <Combobox
              value={values.assignedBy}
              onChange={(v) => setField("assignedBy", v)}
              options={assignedByOptions}
              placeholder="Pick a coordinator…"
              searchPlaceholder="Search…"
              emptyMessage="No match"
              clearable
            />
            {showErrors && errors.assignedBy && (
              <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-3 w-3" aria-hidden />
                {errors.assignedBy}
              </p>
            )}
          </div>

          <div>
            <FieldLabel>Received By</FieldLabel>
            <Combobox
              value={values.receivedBy}
              onChange={(v) => setField("receivedBy", v)}
              options={receivedByOptions}
              placeholder="Who received it…"
              searchPlaceholder="Search…"
              emptyMessage="No match"
              clearable
            />
          </div>
        </div>
      </section>

      {/* ── Numbered field sections — masonry (CSS columns) so cards pack
           tightly top-to-bottom with NO ragged gaps below short sections.
           "Other" inputs stay hidden behind a chip to keep it compact. ── */}
      <div className="columns-1 gap-4 sm:columns-2">
        <SectionCard index={1} title="Fabric" required={reqd} error={showErrors ? errors.fabricSource : undefined}>
          <div className="flex flex-wrap gap-1.5">
            {(["Party Fabric", "If In House"] as const).map((opt) => (
              <KittingChip key={opt} selected={values.fabricSource === opt} onClick={() => setField("fabricSource", values.fabricSource === opt ? "" : opt)}>{opt}</KittingChip>
            ))}
          </div>
          <Reveal open={values.fabricSource === "If In House"}>
            <Input className="h-8" value={values.fabricName} onChange={(e) => setField("fabricName", e.target.value)} placeholder="Fabric name (in-house stock)" />
          </Reveal>
        </SectionCard>

        <SectionCard index={2} title="Fabric Width (Inches)">
          <div className="flex flex-wrap gap-1.5">
            {FABRIC_WIDTHS.map((opt) => (
              <KittingChip key={opt} selected={values.fabricWidths.includes(opt)} onClick={() => toggleInArray("fabricWidths", opt)}>{opt}″</KittingChip>
            ))}
            <OtherToggle active={isOtherOpen("fabricWidth", values.fabricWidthOther)} onClick={() => toggleOther("fabricWidth")} />
          </div>
          <Reveal open={isOtherOpen("fabricWidth", values.fabricWidthOther)}>
            <Input className="h-8" value={values.fabricWidthOther} onChange={(e) => setField("fabricWidthOther", e.target.value)} placeholder="Other width…" />
          </Reveal>
        </SectionCard>

        <SectionCard index={3} title="Design Count">
          <div className="flex flex-wrap gap-1.5">
            {DESIGN_COUNTS.map((opt) => (
              <KittingChip key={opt} selected={values.designCount === opt} onClick={() => setField("designCount", values.designCount === opt ? "" : opt)}>{opt}</KittingChip>
            ))}
            <OtherToggle active={isOtherOpen("designCount", values.designCountOther)} onClick={() => toggleOther("designCount")} />
          </div>
          <Reveal open={isOtherOpen("designCount", values.designCountOther)}>
            <Input className="h-8" value={values.designCountOther} onChange={(e) => setField("designCountOther", e.target.value)} placeholder="Custom count…" inputMode="numeric" />
          </Reveal>
        </SectionCard>

        <SectionCard index={4} title="Type of Designs">
          <div className="flex flex-wrap gap-1.5">
            {[...DESIGN_TYPES_ROW_1, ...DESIGN_TYPES_ROW_2].map((opt) => (
              <KittingChip key={opt} selected={values.designTypes.includes(opt)} onClick={() => toggleInArray("designTypes", opt)}>{opt}</KittingChip>
            ))}
            <OtherToggle active={isOtherOpen("designType", values.designTypeOther)} onClick={() => toggleOther("designType")} />
          </div>
          <Reveal open={isOtherOpen("designType", values.designTypeOther)}>
            <Input className="h-8" value={values.designTypeOther} onChange={(e) => setField("designTypeOther", e.target.value)} placeholder="Other type…" />
          </Reveal>
        </SectionCard>

        <SectionCard index={5} title="Colour Theme">
          <div className="flex flex-wrap gap-1.5">
            {COLOUR_THEMES.map((opt) => (
              <KittingChip key={opt} selected={values.colourThemes.includes(opt)} onClick={() => toggleInArray("colourThemes", opt)}>{opt}</KittingChip>
            ))}
            <OtherToggle active={isOtherOpen("colourTheme", values.colourThemeOther)} onClick={() => toggleOther("colourTheme")} />
          </div>
          <Reveal open={isOtherOpen("colourTheme", values.colourThemeOther)}>
            <Input className="h-8" value={values.colourThemeOther} onChange={(e) => setField("colourThemeOther", e.target.value)} placeholder="Other theme…" />
          </Reveal>
        </SectionCard>

        <SectionCard index={6} title="Background Colour">
          <div className="flex flex-wrap gap-1.5">
            {BACKGROUND_COLOURS.map((opt) => (
              <KittingChip key={opt} selected={values.backgroundColour === opt} onClick={() => setField("backgroundColour", values.backgroundColour === opt ? "" : opt)}>{opt}</KittingChip>
            ))}
            <OtherToggle active={isOtherOpen("backgroundColour", values.backgroundColourOther)} onClick={() => toggleOther("backgroundColour")} />
          </div>
          <Reveal open={isOtherOpen("backgroundColour", values.backgroundColourOther)}>
            <Input className="h-8" value={values.backgroundColourOther} onChange={(e) => setField("backgroundColourOther", e.target.value)} placeholder="Other colour…" />
          </Reveal>
        </SectionCard>

        <SectionCard index={7} title="Garment / Application">
          <div className="flex flex-wrap gap-1.5">
            {GARMENT_APPS.map((opt) => (
              <KittingChip key={opt} selected={values.garmentApplications.includes(opt)} onClick={() => toggleInArray("garmentApplications", opt)}>{opt}</KittingChip>
            ))}
            <OtherToggle active={isOtherOpen("garmentApplication", values.garmentApplicationOther)} onClick={() => toggleOther("garmentApplication")} />
          </div>
          <Reveal open={isOtherOpen("garmentApplication", values.garmentApplicationOther)}>
            <Input className="h-8" value={values.garmentApplicationOther} onChange={(e) => setField("garmentApplicationOther", e.target.value)} placeholder="Other…" />
          </Reveal>
        </SectionCard>

        <SectionCard index={8} title="Motive Print Size">
          <div className="flex flex-wrap gap-1.5">
            {MOTIVE_SIZES.map((opt) => (
              <KittingChip key={opt} selected={values.motivePrintSize === opt} onClick={() => setField("motivePrintSize", values.motivePrintSize === opt ? "" : opt)}>{opt}</KittingChip>
            ))}
          </div>
        </SectionCard>

        <SectionCard index={9} title="Concept">
          <div className="flex flex-wrap gap-1.5">
            {CONCEPTS.map((opt) => (
              <KittingChip key={opt} selected={values.concept === opt} onClick={() => setField("concept", values.concept === opt ? "" : opt)}>{opt}</KittingChip>
            ))}
          </div>
          <div className="mt-1.5">
            <Input className="h-8" value={values.conceptNotes} onChange={(e) => setField("conceptNotes", e.target.value)} placeholder="Concept notes (optional)…" />
          </div>
        </SectionCard>

        <SectionCard index={10} title="APC Cutting Received">
          <div className="flex flex-wrap gap-1.5">
            {(["No", "Yes"] as const).map((opt) => (
              <KittingChip key={opt} selected={values.apcCuttingReceived === opt} onClick={() => setField("apcCuttingReceived", values.apcCuttingReceived === opt ? "" : opt)} tone={opt === "Yes" ? "success" : "primary"}>{opt}</KittingChip>
            ))}
          </div>
          <Reveal open={values.apcCuttingReceived === "Yes"}>
            <Input className="h-8" value={values.apcReceivedBy} onChange={(e) => setField("apcReceivedBy", e.target.value)} placeholder="Who received it…" />
          </Reveal>
        </SectionCard>

        <SectionCard index={11} title="Additional Requirement">
          <div className="flex flex-wrap gap-1.5">
            {(["No", "Yes"] as const).map((opt) => (
              <KittingChip key={opt} selected={values.additionalRequirement === opt} onClick={() => setField("additionalRequirement", values.additionalRequirement === opt ? "" : opt)} tone={opt === "Yes" ? "warning" : "primary"}>{opt}</KittingChip>
            ))}
          </div>
          <Reveal open={values.additionalRequirement === "Yes"}>
            <textarea value={values.additionalRequirementDetail} onChange={(e) => setField("additionalRequirementDetail", e.target.value)} placeholder="If yes, describe…" rows={2} className="block w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </Reveal>
        </SectionCard>

        <SectionCard index={12} title="Priority" required={reqd} error={showErrors ? errors.priority : undefined}>
          <div className="flex flex-wrap gap-1.5">
            {PRIORITIES.map((opt) => (
              <KittingChip key={opt} selected={values.priority === opt} onClick={() => setField("priority", values.priority === opt ? "" : opt)} tone={PRIORITY_TONE[opt]}>{opt}</KittingChip>
            ))}
          </div>
          <div className="mt-1.5">
            <Input className="h-8" value={values.priorityNotes} onChange={(e) => setField("priorityNotes", e.target.value)} placeholder="Priority notes (optional)…" />
          </div>
        </SectionCard>
      </div>

      {!embedded && (
      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/95 px-3 py-1.5 shadow-lg backdrop-blur">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleClear}
          className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          Clear Form
        </Button>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {onDraftSave && (
            <LoadingButton
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDraft}
              loading={draftSaving}
              loadingText="Saving…"
              className="gap-1.5"
            >
              <Save className="h-3.5 w-3.5" aria-hidden />
              Save Draft
            </LoadingButton>
          )}
          <LoadingButton
            type="submit"
            size="sm"
            loading={submitting}
            loadingText="Submitting…"
            disabled={hasErrors}
            className="gap-1.5"
          >
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            {submitLabel}
          </LoadingButton>
        </div>
      </div>
      )}
    </>
  );

  return embedded ? (
    <div className="space-y-1.5">{formContent}</div>
  ) : (
    <form onSubmit={handleSubmit} className="space-y-1.5">
      {formContent}
    </form>
  );
}
