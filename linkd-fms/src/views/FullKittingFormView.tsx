import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  AlertTriangle,
  ImageOff,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";
import { Button, toast } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  FullKittingForm,
  KITTING_DEFAULT_VALUES,
  type KittingFormValues,
} from "@/components/tasks/FullKittingFormFields";
import { submitKittingForm } from "@/lib/kittingQueries";
import { priorityFromEnum } from "@/lib/kitting";
import { sendNotificationToRole } from "@/lib/notifications";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

// ============================================================================
// FullKittingFormView — page wrapper for /kitting/:recordId
// ============================================================================
//
// Two URL shapes are supported:
//   /kitting/:recordId — DEO edits a real full_kitting_details row. Loads
//                        existing payload (if any) so the DEO can resume.
//                        Submit persists via submitKittingForm; the 0021
//                        DB trigger flips status -> 'completed'.
//   /kitting/new       — bare preview form, no DB binding. Useful for
//                        showing the UI to stakeholders without leaving
//                        a row in the table.
//
// All persistence flows through `submitKittingForm`. Drafts are written to
// localStorage per-record so the DEO can leave the page and come back.
// ============================================================================

type LoadState =
  | { kind: "loading" }
  | { kind: "preview" }                  // /kitting/new
  | { kind: "ready"; row: KittingRow }
  | { kind: "error"; message: string }
  | { kind: "not-found" };

interface KittingRow {
  id: string;
  task_id: string | null;
  image_url: string | null;
  party_name: string | null;
  data_entry_status:
    | "pending_image"
    | "pending_deo"
    | "in_progress"
    | "completed";
  priority:
    | "very_urgent"
    | "2_days"
    | "3_days"
    | "4_days"
    | "5_days"
    | null;
  form_date: string | null;
  form_payload: Record<string, unknown> | null;
  // Joined from tasks → clients so the DEO never has to retype the
  // linked brief's UID or party name.
  task_code: string | null;
  client_party_name: string | null;
  designer_name: string | null;
  concept: string | null;
  description: string | null;
}

const STATUS_PILL_CLASS: Record<KittingRow["data_entry_status"], string> = {
  pending_image: "bg-muted/30 text-muted-foreground border-border",
  pending_deo: "bg-warning/10 text-warning border-warning/30",
  in_progress: "bg-primary/10 text-primary border-primary/30",
  completed: "bg-success/10 text-success border-success/30",
};

const STATUS_LABEL: Record<KittingRow["data_entry_status"], string> = {
  pending_image: "Awaiting image",
  pending_deo: "Pending DEO",
  in_progress: "In progress",
  completed: "Completed",
};

export default function FullKittingFormView() {
  const { recordId } = useParams<{ recordId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  // Where to go on "Back" + after-submit. Callers can pass { from: url }
  // via react-router location state. Fallback heuristic: check the current
  // URL search params and document.referrer.
  const backTarget = useMemo(() => {
    const fromState = (location.state as { from?: string } | null)?.from;
    const hint = fromState || document.referrer || "";
    if (hint.includes("tab=kitting") || hint.includes("tab=full_kitting")) {
      return { path: `${ROUTES.dashboard}?tab=kitting`, label: "Back to Full Knitting" };
    }
    if (hint.includes(ROUTES.dashboard)) {
      return { path: ROUTES.dashboard, label: "Back to tasks" };
    }
    return { path: ROUTES.kitting, label: "Back to queue" };
  }, [location.state, location.pathname]);

  const [state, setState] = useState<LoadState>(() =>
    !recordId || recordId === "new" ? { kind: "preview" } : { kind: "loading" }
  );

  // Signed URL for the coordinator-uploaded form photo. Resolved fresh whenever
  // the bound record changes; null until loaded so the pane shows a skeleton.
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  // Mobile-only: when true the image is shown inline above the form. Hidden
  // by default so the form fields don't get pushed below the fold on phones.
  // (Desktop layout uses the sticky side pane, this state is ignored there.)
  const [mobileImageOpen, setMobileImageOpen] = useState(true);

  // Per-record draft key — multiple records can coexist in localStorage
  // without overwriting each other.
  const draftKey = useMemo(
    () => (recordId ? `kitting-form-draft:${recordId}` : "kitting-form-draft"),
    [recordId]
  );

  // ── Load the record ──────────────────────────────────────────────────
  useEffect(() => {
    if (!recordId || recordId === "new") return;
    let cancelled = false;
    setState({ kind: "loading" });

    void (async () => {
      // Two-step fetch (avoids PostgREST embed quirks under RLS).
      // 1. Pull the FK row.
      // 2. Pull the parent task OR sample — whichever the row links to —
      //    for UID + party-name pre-fill.
      const { data, error } = await supabase
        .from("full_kitting_details")
        .select(
          `id, task_id, sample_id, image_url, party_name, data_entry_status,
           priority, form_date, form_payload`
        )
        .eq("id", recordId)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        setState({ kind: "error", message: error.message });
        return;
      }
      if (!data) {
        setState({ kind: "not-found" });
        return;
      }

      let parentCode: string | null = null;
      let parentParty: string | null = null;
      let designerName: string | null = null;
      let concept: string | null = null;
      let description: string | null = null;
      const sampleId = (data as { sample_id?: string | null }).sample_id ?? null;
      if (data.task_id) {
        const { data: t } = await supabase
          .from("tasks")
          .select("task_code, brief_type, concept, description, clients:client_id ( party_name ), assignee:assigned_to ( full_name )")
          .eq("id", data.task_id)
          .maybeSingle();
        if (t) {
          parentCode = t.task_code;
          const c = (t as unknown as { clients?: { party_name?: string | null } | null }).clients;
          parentParty = c?.party_name ?? (t.brief_type === "ld" ? "LD Silk Mills" : null);
          const a = (t as unknown as { assignee?: { full_name?: string | null } | null }).assignee;
          designerName = a?.full_name ?? null;
          concept = t.concept ?? null;
          description = t.description ?? null;
        }
      } else if (sampleId) {
        const { data: s } = await supabase
          .from("samples")
          .select("uid, party_name")
          .eq("id", sampleId)
          .maybeSingle();
        if (s) {
          parentCode = s.uid;
          parentParty = s.party_name;
        }
      }

      const row: KittingRow = {
        id: data.id,
        task_id: data.task_id,
        image_url: data.image_url,
        party_name: data.party_name,
        data_entry_status: data.data_entry_status as KittingRow["data_entry_status"],
        priority: data.priority as KittingRow["priority"],
        form_date: data.form_date,
        form_payload: data.form_payload as Record<string, unknown> | null,
        task_code: parentCode,
        client_party_name: parentParty,
        designer_name: designerName,
        concept,
        description,
      };
      setState({ kind: "ready", row });
    })();

    return () => {
      cancelled = true;
    };
  }, [recordId]);

  // ── Resolve a signed URL for the form photo ─────────────────────────
  // Re-runs whenever the bound record's image_url changes. 1h TTL — DEO
  // sessions are typically short so we don't need to refresh it.
  useEffect(() => {
    if (state.kind !== "ready" || !state.row.image_url) {
      setImageUrl(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.storage
        .from("sample-files")
        .createSignedUrl(state.row.image_url!, 3600);
      if (cancelled) return;
      setImageUrl(data?.signedUrl ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [state]);

  // ── Build defaultValues for the form ────────────────────────────────
  const defaultValues = useMemo<Partial<KittingFormValues>>(() => {
    if (state.kind !== "ready") return tryLoadDraft(draftKey);

    // Precedence (later wins):
    //   1. linked-task fallbacks (party name from clients) — only fill when
    //      the user hasn't typed anything yet
    //   2. local draft (whatever the DEO was typing last)
    //   3. server payload / denormalised columns — the authoritative state
    const linkedFallback: Partial<KittingFormValues> = {};
    if (state.row.client_party_name) {
      linkedFallback.partyName = state.row.client_party_name;
    }

    const fromServer = mergePayloadIntoDefaults(state.row);
    const fromDraft = tryLoadDraft(draftKey);
    return { ...linkedFallback, ...fromDraft, ...fromServer };
  }, [state, draftKey]);

  // ── Submit handler ──────────────────────────────────────────────────
  async function handleSubmit(values: KittingFormValues) {
    if (state.kind === "preview") {
      // Preview mode: no DB row to update — just clear the draft so the
      // success toast reads accurately.
      window.localStorage.removeItem(draftKey);
      return;
    }
    if (state.kind !== "ready") {
      throw new Error("Form isn't bound to a record");
    }
    if (!user) {
      throw new Error("Not signed in");
    }

    const { error } = await submitKittingForm({
      recordId: state.row.id,
      completedBy: user.id,
      values,
    });
    if (error) throw new Error(error);

    window.localStorage.removeItem(draftKey);

    // Tell admin + coordinator the form is ready to review. Best-effort —
    // don't fail the submit if the notification call errors.
    if (state.kind === "ready") {
      void sendNotificationToRole(
        // Admins only — coordinators' feed is actionable-only (DEO-digitized is status).
        ["admin"],
        "Knitting form digitized",
        `${values.partyName || state.row.party_name || "A knitting form"} has been digitized by the DEO and is ready to review.`,
        "success",
        state.row.task_id ? ROUTES.dashboard : ROUTES.kitting
      );
    }

    // Reflect the new state locally so the page reads "Completed" if the
    // user lingers, AND navigate back to the queue so they can pick up the
    // next task without scrolling back to the top. The form's own success
    // toast already fired before we got here.
    setState((prev) =>
      prev.kind === "ready"
        ? {
            kind: "ready",
            row: { ...prev.row, data_entry_status: "completed" },
          }
        : prev
    );
    // Brief delay so the user sees the success toast before the page
    // changes. We return to wherever they came from (Full Kitting tab on
    // /dashboard, or DEO queue) so they pick up the next task in context.
    window.setTimeout(() => navigate(backTarget.path), 600);
  }

  async function handleDraftSave(values: KittingFormValues) {
    try {
      window.localStorage.setItem(draftKey, JSON.stringify(values));
    } catch {
      // Quota exceeded / Safari private mode — fall through silently.
    }
  }

  // ── Render ──────────────────────────────────────────────────────────
  const showImagePane =
    state.kind === "ready" && !!state.row.image_url;

  return (
    // No max-width cap so the image pane can use the full screen width when
    // available. The form column inside stays clamped via its own max-w-3xl
    // so it never stretches past comfortable reading width. Tight top/bottom
    // padding so more of the form + image fits above the fold.
    <div className="mx-auto w-full px-4 py-2">
      <div className="mb-2 flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(backTarget.path)}
          className="gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          {backTarget.label}
        </Button>

        {/* Status pill — visible whenever bound to a record. */}
        {state.kind === "ready" && (
          <Badge
            variant="outline"
            className={cn("border text-[11px]", STATUS_PILL_CLASS[state.row.data_entry_status])}
          >
            {STATUS_LABEL[state.row.data_entry_status]}
          </Badge>
        )}
        {state.kind === "preview" && (
          <Badge variant="secondary" className="text-[11px]">
            Preview · not saved
          </Badge>
        )}
      </div>

      {state.kind === "loading" && (
        <Card>
          <CardContent className="space-y-3 py-6">
            <Skeleton className="h-9 w-2/3" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      )}

      {state.kind === "not-found" && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertTriangle className="h-8 w-8 text-warning" />
            <p className="text-sm text-foreground">
              No knitting record found for this id.
            </p>
            <Button variant="outline" onClick={() => navigate(backTarget.path)}>
              {backTarget.label}
            </Button>
          </CardContent>
        </Card>
      )}

      {state.kind === "error" && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-destructive">{state.message}</p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {(state.kind === "ready" || state.kind === "preview") && (
        <div
          className={cn(
            "grid gap-4",
            // Side-by-side once we have an image AND viewport is wide. Form
            // takes the flexible column; image pane is fixed-width on the
            // right so it stays readable but doesn't dominate.
            // Image pane gets ~520-720px on desktop so the photo is readable
            // without zooming. The form column stays capped via max-w-3xl
            // inside so it doesn't stretch awkwardly when the image grows.
            showImagePane && "lg:grid-cols-[1fr_minmax(520px,720px)]"
          )}
        >
          {/* Mobile-only image accordion — sits ABOVE the form on phones/tablets. */}
          {showImagePane && (
            <div className="lg:hidden">
              <MobileImageAccordion
                open={mobileImageOpen}
                onToggle={() => setMobileImageOpen((v) => !v)}
                imageUrl={imageUrl}
                rawPath={state.kind === "ready" ? state.row.image_url : null}
              />
            </div>
          )}

          {/* The form itself — wraps in max-w so wide screens don't stretch it. */}
          <div className="min-w-0">
            <div className="mx-auto max-w-3xl">
              <FullKittingForm
                defaultValues={defaultValues}
                taskCode={
                  state.kind === "ready" ? state.row.task_code : null
                }
                designerName={
                  state.kind === "ready" ? state.row.designer_name : null
                }
                conceptName={
                  state.kind === "ready" ? state.row.concept : null
                }
                descriptionText={
                  state.kind === "ready" ? state.row.description : null
                }
                onSubmit={async (values) => {
                  try {
                    await handleSubmit(values);
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Submit failed");
                    throw err;
                  }
                }}
                onDraftSave={handleDraftSave}
              />
            </div>
          </div>

          {/* Desktop sticky image pane — stays visible as the form scrolls. */}
          {showImagePane && (
            <aside className="hidden lg:block">
              <DesktopImagePane imageUrl={imageUrl} rawPath={state.kind === "ready" ? state.row.image_url : null} />
            </aside>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Image panes — sticky on desktop, collapsible on mobile
// ============================================================================

function isPdfUrl(url: string | null): boolean {
  if (!url) return false;
  const lower = url.split("?")[0].toLowerCase();
  return lower.endsWith(".pdf");
}

function DesktopImagePane({ imageUrl, rawPath }: { imageUrl: string | null; rawPath: string | null }) {
  const pdf = isPdfUrl(rawPath);
  return (
    <div className="sticky top-2">
      <Card className="overflow-hidden">
        <CardContent className="space-y-2 p-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {pdf ? "Form document" : "Form photo"}
            </p>
            {imageUrl && (
              <a
                href={imageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
                title="Open full size in a new tab"
              >
                <ExternalLink className="h-3 w-3" />
                Open
              </a>
            )}
          </div>
          <div className="overflow-auto rounded-md border border-border bg-secondary/40 max-h-[calc(100vh-6rem)]">
            {imageUrl ? (
              pdf ? (
                <iframe
                  src={imageUrl}
                  title="Knitting form PDF"
                  className="h-[calc(100vh-8rem)] w-full"
                />
              ) : (
                <a
                  href={imageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                  title="Open full size"
                >
                  <img
                    src={imageUrl}
                    alt="Knitting form to digitize"
                    className="block w-full"
                  />
                </a>
              )
            ) : (
              <div className="flex h-64 items-center justify-center text-xs text-muted-foreground">
                <ImageOff className="mr-1.5 h-4 w-4" />
                Loading photo…
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MobileImageAccordion({
  open,
  onToggle,
  imageUrl,
  rawPath,
}: {
  open: boolean;
  onToggle: () => void;
  imageUrl: string | null;
  rawPath: string | null;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-secondary/40"
        >
          <span className="text-sm font-semibold text-foreground">
            Form photo
          </span>
          <div className="flex items-center gap-1">
            {imageUrl && (
              <a
                href={imageUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-0.5 text-[10px] font-medium text-primary hover:underline"
                title="Open full size"
              >
                <ExternalLink className="h-3 w-3" />
                Open
              </a>
            )}
            {open ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </button>
        <div
          className={cn(
            "grid overflow-hidden transition-all duration-200",
            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          )}
        >
          <div className="min-h-0">
            <div className="border-t border-border bg-secondary/40">
              {imageUrl ? (
                isPdfUrl(rawPath) ? (
                  <iframe
                    src={imageUrl}
                    title="Knitting form PDF"
                    className="h-[70vh] w-full"
                  />
                ) : (
                  <a
                    href={imageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                    title="Open full size"
                  >
                    <img
                      src={imageUrl}
                      alt="Knitting form to digitize"
                      className="block max-h-[70vh] w-full object-contain"
                    />
                  </a>
                )
              ) : (
                <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
                  Loading photo…
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Restore a draft from localStorage. Defensive — drops anything that doesn't
 * shape-match `KittingFormValues` so stale schemas don't poison the form.
 */
function tryLoadDraft(key: string): Partial<KittingFormValues> {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return shallowMatchDefaults(parsed);
  } catch {
    return {};
  }
}

/**
 * Merge a server-stored `form_payload` plus the denormalised columns back
 * into the KittingFormValues shape. The payload itself was originally that
 * shape (we stored it whole), but party_name / date / priority may have
 * been edited via the denormalised columns since then — server values win.
 */
function mergePayloadIntoDefaults(row: KittingRow): Partial<KittingFormValues> {
  const fromPayload =
    row.form_payload && typeof row.form_payload === "object"
      ? shallowMatchDefaults(row.form_payload as Record<string, unknown>)
      : {};

  const denorm: Partial<KittingFormValues> = {};
  if (row.party_name) denorm.partyName = row.party_name;
  if (row.form_date) denorm.date = row.form_date;
  if (row.priority) denorm.priority = priorityFromEnum(row.priority);

  return { ...fromPayload, ...denorm };
}

/**
 * Take an unknown object and keep only the keys that exist on the canonical
 * default values. Doesn't deep-validate — just stops stray keys from getting
 * passed into setState (which would still work but would store rubbish).
 */
function shallowMatchDefaults(
  obj: Record<string, unknown>
): Partial<KittingFormValues> {
  const out: Partial<KittingFormValues> = {};
  const allowed = Object.keys(KITTING_DEFAULT_VALUES) as Array<
    keyof KittingFormValues
  >;
  for (const key of allowed) {
    if (key in obj) {
      // Trust the runtime shape — strict typing in FullKittingForm catches
      // bad types when the user starts editing.
      (out as Record<string, unknown>)[key] = obj[key];
    }
  }
  return out;
}
