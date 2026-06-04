import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { queryKeys } from "@/lib/queryKeys";
import { sendNotification, sendNotificationToRole } from "@/lib/notifications";
import { differenceInDays, parseISO } from "date-fns";
import type {
  Concept,
  ConceptStatus,
  ConceptWorkStatus,
  ConceptWithRelations,
  CompletionHistoryEntry,
  TaskPriority,
} from "@/types/database";

/**
 * Full select used after migration 0012 is applied — joins the new
 * designer_id + client_id relationships.
 */
const FULL_SELECT = `
  *,
  submitter:profiles!concepts_submitted_by_fkey(id, full_name, role, avatar_url),
  reviewer:profiles!concepts_md_reviewed_by_fkey(id, full_name, role, avatar_url),
  designer:profiles!concepts_designer_id_fkey(id, full_name, role, avatar_url),
  client:clients!concepts_client_id_fkey(id, party_name)
`;

/**
 * Legacy select for the pre-0012 schema (no designer_id / client_id columns
 * or FKs). PostgREST otherwise errors with "Could not find a relationship
 * between 'concepts' and 'profiles' in the schema cache".
 */
const LEGACY_SELECT = `
  *,
  submitter:profiles!concepts_submitted_by_fkey(id, full_name, role, avatar_url),
  reviewer:profiles!concepts_md_reviewed_by_fkey(id, full_name, role, avatar_url)
`;

function isMissingRelationshipError(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("could not find a relationship") ||
    m.includes("schema cache") ||
    m.includes("concepts_designer_id_fkey") ||
    m.includes("concepts_client_id_fkey")
  );
}

export interface ConceptFilters {
  status?: ConceptStatus | ConceptStatus[];
  workStatus?: ConceptWorkStatus | ConceptWorkStatus[];
  submittedBy?: string;
  mySubmissionsOnly?: boolean;
}

export type MutationResult<T> = { data: T | null; error: string | null };

export interface SubmitConceptInput {
  title: string;
  description?: string | null;
  /**
   * Storage path of the *primary* supporting file (image, PSD, MP4) inside
   * the `sample-files` bucket. Always equals `files[0]` for new submissions;
   * kept as a top-level column for the detail-drawer's hero preview.
   */
  image_url: string;
  /** New 0012 fields. */
  start_date?: string | null;
  designer_id?: string | null;
  client_id?: string | null;
  assigned_by?: string | null;
  priority?: TaskPriority;
  /** Optional alternate file path (kept in sync with image_url for now). */
  file_url?: string | null;
  /**
   * Storage paths for every uploaded attachment (added in 0018). The first
   * entry mirrors `image_url`; subsequent entries are additional references.
   * If the 0018 migration hasn't been applied yet, the insert falls back to
   * a payload without this column.
   */
  files?: string[];
  /** Number of designs in the concept (denominator for final approval). 0028. */
  designs_count?: number | null;
  /** Fabric the concept is designed for (managed Fabrics lookup). 0058. */
  fabric?: string | null;
}

export interface ReviewInput {
  status: Extract<ConceptStatus, "approved" | "rejected" | "revision_requested">;
  notes?: string | null;
}

export interface FinalApproveInput {
  notes?: string | null;
  approved_designs_count?: number | null;
}

export interface UseConcepts {
  concepts: ConceptWithRelations[];
  totalCount: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => unknown;
  submitConcept: (input: SubmitConceptInput) => Promise<MutationResult<Concept>>;
  editConcept: (conceptId: string, input: Partial<SubmitConceptInput>) => Promise<MutationResult<Concept>>;
  reviewConcept: (
    conceptId: string,
    input: ReviewInput
  ) => Promise<MutationResult<Concept>>;
  finalizeConcept: (conceptId: string) => Promise<MutationResult<Concept>>;
  finalApproveConcept: (
    conceptId: string,
    input?: FinalApproveInput
  ) => Promise<MutationResult<Concept>>;
  /** Send concept back from final approval stage to designer for revision. */
  finalReviseConcept: (
    conceptId: string,
    notes?: string | null
  ) => Promise<MutationResult<Concept>>;
  /** Designer re-submits after addressing FINAL-approval revision feedback — clears final_approval_notes. */
  resubmitConcept: (conceptId: string) => Promise<MutationResult<Concept>>;
  /**
   * Designer re-submits after MD asked for changes on the *initial* concept
   * submission (md_status='revision_requested'). Flips md_status back to
   * 'pending' so MD sees it in the review queue again. Clears md_notes
   * (the original feedback) — they're preserved in completion_history.
   *
   * Accepts the revised files (`newFiles`) — they're APPENDED to the
   * existing `files` array so the audit trail of every revision survives,
   * and `image_url` updates to the first new file so the hero preview
   * shows the latest version. Optional `notes` describe what changed and
   * land in the completion_history entry.
   */
  resubmitForReview: (
    conceptId: string,
    options?: { newFiles?: string[]; notes?: string }
  ) => Promise<MutationResult<Concept>>;
  // ── Work-status lifecycle (added 0025/0026) ──────────────────────────────
  /** T6 — Designer starts an approved concept. */
  startConcept: (conceptId: string) => Promise<MutationResult<Concept>>;
  /** T7 — Designer puts the in-progress concept on hold with optional reason. */
  holdConcept: (
    conceptId: string,
    reason?: string | null
  ) => Promise<MutationResult<Concept>>;
  /** T8 — Designer resumes a held concept (adds hold duration to total). */
  resumeConcept: (conceptId: string) => Promise<MutationResult<Concept>>;
  /** T9+T10 — Designer marks done; row auto-moves to in_revision for MD. */
  markConceptDone: (conceptId: string, options?: { newFiles?: string[]; notes?: string }) => Promise<MutationResult<Concept>>;
  /** T11 — Admin approves the finished design (terminal). Optionally records
   *  how many of the submitted designs were approved (compared to
   *  `designs_count` at submission). */
  approveDesign: (
    conceptId: string,
    approvedDesignsCount?: number | null
  ) => Promise<MutationResult<Concept>>;
  /** T12 — Admin suggests changes; designer reads md_feedback and reworks. */
  suggestChanges: (
    conceptId: string,
    feedback: string
  ) => Promise<MutationResult<Concept>>;
  /** T13 — Designer starts implementing requested changes. */
  startChanges: (conceptId: string) => Promise<MutationResult<Concept>>;
  /** Hard-delete a concept — gated by RLS to admins/coordinators OR the
   *  concept's owner (submitted_by / designer_id = auth.uid()). The schema
   *  cascades attached files via FK rules, so this also removes related
   *  concept_files. Returns the deleted id on success. */
  deleteConcept: (
    conceptId: string
  ) => Promise<MutationResult<{ id: string }>>;
}

// ============================================================================
// Query function
// ============================================================================

async function fetchConcepts(
  filters: ConceptFilters | undefined,
  userId: string | undefined
): Promise<ConceptWithRelations[]> {
  function buildQuery(selectFragment: string) {
    let q = supabase
      .from("concepts")
      .select(selectFragment)
      .order("created_at", { ascending: false });

    if (filters?.status) {
      if (Array.isArray(filters.status)) {
        if (filters.status.length) q = q.in("md_status", filters.status);
      } else {
        q = q.eq("md_status", filters.status);
      }
    }
    if (filters?.workStatus) {
      if (Array.isArray(filters.workStatus)) {
        if (filters.workStatus.length) q = q.in("work_status", filters.workStatus);
      } else {
        q = q.eq("work_status", filters.workStatus);
      }
    }
    if (filters?.mySubmissionsOnly && userId) {
      q = q.eq("submitted_by", userId);
    } else if (filters?.submittedBy) {
      q = q.eq("submitted_by", filters.submittedBy);
    }
    return q;
  }

  let { data, error } = await buildQuery(FULL_SELECT);

  // 0012 fallback: missing relations → retry with the legacy select.
  if (error && isMissingRelationshipError(error.message)) {
    console.warn(
      "[useConcepts] new relations missing — falling back to legacy select. " +
        "Apply migration 0012 to enable designer/client joins."
    );
    const fallback = await buildQuery(LEGACY_SELECT);
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    console.error("[useConcepts] query error", error);
    throw error;
  }
  return (data ?? []) as unknown as ConceptWithRelations[];
}

// ============================================================================
// Hook
// ============================================================================

export function useConcepts(filters?: ConceptFilters): UseConcepts {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  const filterKey = JSON.stringify(filters ?? {});
  const userKey = filters?.mySubmissionsOnly ? user?.id ?? "" : "any";

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.concepts.list({ filterKey, userKey }),
    queryFn: () => fetchConcepts(filters, user?.id),
  });

  // Invalidate every concept query when the row set changes.
  const invalidateAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.concepts.all });
  }, [queryClient]);

  // Realtime: any concept change invalidates the cache so all consumers refetch.
  useEffect(() => {
    const channel = supabase
      .channel("concepts-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "concepts" },
        () => invalidateAll()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [invalidateAll]);

  // ---------- mutations ----------

  const submitConcept = useCallback<UseConcepts["submitConcept"]>(
    async (input) => {
      if (!user) return { data: null, error: "Not authenticated" };
      if (profile?.role && profile.role !== "designer")
        return { data: null, error: "Only designers can submit concepts. Admins and coordinators can review and approve them." };
      if (!input.title?.trim())
        return { data: null, error: "title is required" };

      // Image / files are OPTIONAL. `concepts.image_url` is NOT NULL in the DB,
      // so fall back to "" when a designer submits without a file (the display
      // layer treats "" as "no image").
      const img = input.image_url?.trim() || "";

      const basePayload = {
        title: input.title.trim(),
        description: input.description?.trim() || null,
        image_url: img,
        submitted_by: user.id,
      };
      const filesArray =
        input.files && input.files.length > 0
          ? input.files
          : img
            ? [img]
            : [];
      const extendedPayload = {
        ...basePayload,
        start_date: input.start_date ?? null,
        designer_id: input.designer_id ?? null,
        client_id: input.client_id ?? null,
        assigned_by: input.assigned_by?.trim() || null,
        priority: input.priority ?? "normal",
        file_url: input.file_url ?? img,
        files: filesArray,
        designs_count: input.designs_count ?? null,
        fabric: input.fabric?.trim() || null,
      };

      let { data, error: err } = await supabase
        .from("concepts")
        .insert(extendedPayload)
        .select("*")
        .single();

      // Schema fallback ladder:
      //   1. Full extendedPayload    — works post-0028
      //   2. Drop `designs_count`    — works post-0018, pre-0028
      //   3. Drop `files` too        — works post-0012, pre-0018
      //   4. basePayload only        — works pre-0012
      if (err && /does not exist|schema cache/i.test(err.message) &&
          /designs_count/i.test(err.message)) {
        console.warn(
          "[useConcepts] `designs_count` missing — retrying without it. " +
            "Apply migration 0028 to persist concept design counts."
        );
        const { designs_count: _omitDc, ...withoutDc } = extendedPayload;
        void _omitDc;
        const retryDc = await supabase
          .from("concepts")
          .insert(withoutDc)
          .select("*")
          .single();
        data = retryDc.data;
        err = retryDc.error;
      }
      if (err && /does not exist|schema cache/i.test(err.message)) {
        console.warn(
          "[useConcepts] schema missing — retrying without `files` column. " +
            "Apply migration 0018 to persist multi-file attachments."
        );
        const { files: _omit, designs_count: _omitDc2, ...withoutFiles } =
          extendedPayload;
        void _omit;
        void _omitDc2;
        const retry1 = await supabase
          .from("concepts")
          .insert(withoutFiles)
          .select("*")
          .single();
        data = retry1.data;
        err = retry1.error;

        if (err && /does not exist|schema cache/i.test(err.message)) {
          console.warn(
            "[useConcepts] extended columns also missing — falling back to base payload. " +
              "Apply migration 0012 to persist start_date/designer/client/etc."
          );
          const retry2 = await supabase
            .from("concepts")
            .insert(basePayload)
            .select("*")
            .single();
          data = retry2.data;
          err = retry2.error;
        }
      }

      if (err) {
        const msg = err.message.includes("Cannot coerce") || err.message.includes("JSON object")
          ? "You don't have permission to perform this action on this concept."
          : err.message;
        return { data: null, error: msg };
      }

      const submitterName = profile?.full_name ?? "A designer";
      const conceptDetails = [
        input.designs_count ? `${input.designs_count} designs` : null,
        input.start_date ? `Start: ${new Date(input.start_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : null,
      ].filter(Boolean).join(" · ");
      void sendNotificationToRole(
        ["admin", "design_coordinator"],
        "New Concept Submitted",
        `${submitterName} submitted "${input.title}"${conceptDetails ? ` — ${conceptDetails}` : ""}`,
        "info",
        "/concepts"
      );

      invalidateAll();
      return { data, error: null };
    },
    [user, profile, invalidateAll]
  );

  const editConcept = useCallback<UseConcepts["editConcept"]>(
    async (conceptId, input) => {
      if (!user) return { data: null, error: "Not authenticated" };

      const update: Record<string, unknown> = {};
      if (input.title !== undefined) update.title = input.title.trim();
      if (input.description !== undefined) update.description = input.description?.trim() || null;
      if (input.image_url !== undefined) update.image_url = input.image_url;
      if (input.file_url !== undefined) update.file_url = input.file_url;
      if (input.files !== undefined) update.files = input.files;
      if (input.client_id !== undefined) update.client_id = input.client_id;
      if (input.assigned_by !== undefined) update.assigned_by = input.assigned_by?.trim() || null;
      if (input.designs_count !== undefined) update.designs_count = input.designs_count;
      if (input.start_date !== undefined) update.start_date = input.start_date;
      if (input.fabric !== undefined) update.fabric = input.fabric?.trim() || null;

      if (Object.keys(update).length === 0)
        return { data: null, error: "Nothing to update" };

      const { data, error: err } = await supabase
        .from("concepts")
        .update(update)
        .eq("id", conceptId)
        .select("*")
        .single();

      if (err) return { data: null, error: err.message };
      invalidateAll();
      return { data: data as Concept, error: null };
    },
    [user, invalidateAll]
  );

  const reviewConcept = useCallback<UseConcepts["reviewConcept"]>(
    async (conceptId, input) => {
      if (!user) return { data: null, error: "Not authenticated" };
      if (profile?.role && profile.role !== "admin" && profile.role !== "super_admin")
        return { data: null, error: "Only MD (Admin) can review concepts at this stage." };
      // Client-side mirror of the 0029 DB trigger — when MD approves, the
      // concept auto-starts (work_status='in_progress' + work_started_at).
      // The trigger already does this server-side; setting it here too
      // means the row we return to the caller reflects the new state
      // immediately without a refetch.
      const now = new Date().toISOString();
      const historyType =
        input.status === "approved" ? "md_concept_approved"
          : input.status === "rejected" ? "md_concept_rejected"
          : "md_concept_revision";
      const history = await appendHistory(conceptId, {
        type: historyType as CompletionHistoryEntry["type"],
        date: now,
        by: profile?.full_name ?? "Admin",
        feedback: input.notes?.trim() || undefined,
      });
      const update: Record<string, unknown> = {
        md_status: input.status,
        md_reviewed_by: user.id,
        md_reviewed_at: now,
        md_notes: input.notes?.trim() || null,
        completion_history: history,
      };
      if (input.status === "approved") {
        update.work_status = "in_progress";
        update.work_started_at = now;
      }

      const { data, error: err } = await supabase
        .from("concepts")
        .update(update)
        .eq("id", conceptId)
        .select("*")
        .single();
      if (err) {
        if (err.message.includes("Cannot coerce") || err.message.includes("JSON object")) {
          return { data: null, error: "You don't have permission to review concepts. Only admins can approve, revise, or reject." };
        }
        return { data: null, error: err.message };
      }

      if (data) {
        // Per-verdict notification — the submitter learns the outcome AND
        // the reason in a single payload, so they don't have to open the
        // drawer to find out why a rejection happened.
        const notes = input.notes?.trim();
        const reviewerName = profile?.full_name ?? "Admin";
        if (input.status === "approved") {
          void sendNotification(
            data.submitted_by,
            "Concept Approved ✨",
            `${reviewerName} approved "${data.title}" — Stage: MD Approval${data.designs_count ? ` · ${data.designs_count} designs` : ""}`,
            "success",
            "/concepts"
          );
        } else if (input.status === "rejected") {
          void sendNotification(
            data.submitted_by,
            "Concept Rejected",
            `${reviewerName} rejected "${data.title}" — Reason: ${notes || "No reason given"}`,
            "warning",
            "/concepts"
          );
        } else if (input.status === "revision_requested") {
          void sendNotification(
            data.submitted_by,
            "Revision Requested",
            `${reviewerName} requested changes on "${data.title}" — Feedback: ${notes || "See details"}`,
            "warning",
            "/concepts"
          );
        }
      }

      invalidateAll();
      return { data, error: null };
    },
    [user, invalidateAll]
  );

  // History helper: fetch current history, append entry, return updated array.
  // The entry's `date` is always stamped with a FULL ISO timestamp (overriding
  // any date-only value a caller passes) so the Activity Timeline can order
  // same-day events to the second and read in true chronological sequence.
  async function appendHistory(
    conceptId: string,
    entry: CompletionHistoryEntry
  ): Promise<CompletionHistoryEntry[]> {
    const { data: row } = await supabase
      .from("concepts")
      .select("completion_history")
      .eq("id", conceptId)
      .single();
    const existing: CompletionHistoryEntry[] =
      Array.isArray(row?.completion_history) ? row.completion_history : [];
    const stamped: CompletionHistoryEntry = {
      ...entry,
      date: new Date().toISOString(),
    };
    return [...existing, stamped];
  }

  const finalizeConcept = useCallback<UseConcepts["finalizeConcept"]>(
    async (conceptId) => {
      if (!user) return { data: null, error: "Not authenticated" };

      const now = new Date().toISOString().slice(0, 10);

      const { data: concept } = await supabase
        .from("concepts")
        .select("designer_planned_date, designer_actual_date")
        .eq("id", conceptId)
        .single();

      if (concept?.designer_actual_date) {
        return { data: null, error: "Already marked as done. Use Re-submit instead." };
      }

      const delay = concept?.designer_planned_date
        ? differenceInDays(parseISO(now), parseISO(concept.designer_planned_date))
        : 0;

      const history = await appendHistory(conceptId, {
        type: "done",
        date: now,
        by: user.user_metadata?.full_name || "Designer",
        delay_days: delay,
      });

      const { data, error: err } = await supabase
        .from("concepts")
        .update({
          designer_actual_date: now,
          completion_history: history as unknown as any,
        })
        .eq("id", conceptId)
        .select("*")
        .single();
      if (err) {
        const msg = err.message.includes("Cannot coerce") || err.message.includes("JSON object")
          ? "You don't have permission to perform this action on this concept."
          : err.message;
        return { data: null, error: msg };
      }
      invalidateAll();
      return { data, error: null };
    },
    [user, invalidateAll]
  );

  const finalApproveConcept = useCallback<UseConcepts["finalApproveConcept"]>(
    async (conceptId, input) => {
      if (!user) return { data: null, error: "Not authenticated" };

      const now = new Date().toISOString();

      const history = await appendHistory(conceptId, {
        type: "approved",
        date: now.slice(0, 10),
        by: user.user_metadata?.full_name || "Admin",
      });

      // Legacy mutation now ALSO closes out the work-status lifecycle by
      // flipping work_status to 'completed' (idempotent if it's already
      // there). Without this, a coordinator clicking the legacy "Approve"
      // card would leave work_status stuck at 'in_revision' and the table
      // would keep showing "In Progress" forever.
      const { data, error: err } = await supabase
        .from("concepts")
        .update({
          final_approved_at: now,
          final_approval_actual_date: now.slice(0, 10),
          final_approval_notes: input?.notes?.trim() || null,
          approved_designs_count: input?.approved_designs_count ?? null,
          completion_history: history as unknown as any,
          work_status: "completed",
          work_completed_at: now,
          md_feedback: null,
        })
        .eq("id", conceptId)
        .select("*")
        .single();

      if (err) {
        const msg = err.message.includes("Cannot coerce") || err.message.includes("JSON object")
          ? "You don't have permission to perform this action on this concept."
          : err.message;
        return { data: null, error: msg };
      }

      if (data) {
        void sendNotification(
          data.submitted_by,
          "Final Approval Granted",
          `Your concept "${data.title}" has received final approval.`,
          "success",
          "/concepts"
        );
      }

      invalidateAll();
      return { data, error: null };
    },
    [user, invalidateAll]
  );

  const finalReviseConcept = useCallback<UseConcepts["finalReviseConcept"]>(
    async (conceptId, notes) => {
      if (!user) return { data: null, error: "Not authenticated" };
      if (!notes?.trim()) return { data: null, error: "Revision feedback is required" };

      const now = new Date().toISOString().slice(0, 10);

      const history = await appendHistory(conceptId, {
        type: "revision",
        date: now,
        by: user.user_metadata?.full_name || "Admin",
        feedback: notes.trim(),
      });

      const { data, error: err } = await supabase
        .from("concepts")
        .update({
          work_status: "changes_requested",
          final_approval_notes: notes.trim(),
          completion_history: history as unknown as any,
        })
        .eq("id", conceptId)
        .select("*")
        .single();

      if (err) {
        const msg = err.message.includes("Cannot coerce") || err.message.includes("JSON object")
          ? "You don't have permission to perform this action on this concept."
          : err.message;
        return { data: null, error: msg };
      }

      if (data) {
        void sendNotification(
          data.submitted_by,
          "Final Review — Changes Needed",
          `Revision needed on "${data.title}": ${notes.trim()}`,
          "warning",
          "/concepts"
        );
      }

      invalidateAll();
      return { data, error: null };
    },
    [user, invalidateAll]
  );

  const resubmitConcept = useCallback<UseConcepts["resubmitConcept"]>(
    async (conceptId) => {
      if (!user) return { data: null, error: "Not authenticated" };

      const now = new Date().toISOString().slice(0, 10);

      const { data: concept } = await supabase
        .from("concepts")
        .select("designer_actual_date")
        .eq("id", conceptId)
        .single();
      const delay = concept?.designer_actual_date
        ? differenceInDays(parseISO(now), parseISO(concept.designer_actual_date))
        : 0;

      const history = await appendHistory(conceptId, {
        type: "resubmit",
        date: now,
        by: user.user_metadata?.full_name || "Designer",
        delay_days: delay,
      });

      const { data, error: err } = await supabase
        .from("concepts")
        .update({
          final_approval_notes: null,
          final_approval_planned_date: now,
          completion_history: history as unknown as any,
        })
        .eq("id", conceptId)
        .select("*")
        .single();

      if (err) {
        const msg = err.message.includes("Cannot coerce") || err.message.includes("JSON object")
          ? "You don't have permission to perform this action on this concept."
          : err.message;
        return { data: null, error: msg };
      }

      if (data) {
        const submitterName = profile?.full_name ?? "Designer";
        void sendNotificationToRole(
          ["admin", "design_coordinator"],
          "Concept Re-submitted",
          `${submitterName} re-submitted "${data.title}" for final review`,
          "info",
          "/concepts"
        );
      }

      invalidateAll();
      return { data, error: null };
    },
    [user, profile, invalidateAll]
  );

  const resubmitForReview = useCallback<UseConcepts["resubmitForReview"]>(
    async (conceptId, options) => {
      if (!user) return { data: null, error: "Not authenticated" };
      const now = new Date().toISOString().slice(0, 10);
      const newFiles = options?.newFiles ?? [];
      const changesNotes = options?.notes?.trim() || undefined;

      // Read previous state so we can append revised files to the existing
      // `files` array and carry the prior md_notes into history before
      // clearing them.
      const { data: previous } = await supabase
        .from("concepts")
        .select("md_notes, files, image_url")
        .eq("id", conceptId)
        .single();

      const existingFiles: string[] = Array.isArray(previous?.files)
        ? (previous!.files as string[])
        : previous?.image_url
          ? [previous.image_url]
          : [];
      const mergedFiles = [...existingFiles, ...newFiles];
      // First newly-uploaded file becomes the hero (image_url). If the
      // designer didn't upload anything, keep the prior hero.
      const newPrimary = newFiles[0] ?? previous?.image_url ?? null;

      const history = await appendHistory(conceptId, {
        type: "resubmit",
        date: now,
        by: profile?.full_name ?? "Designer",
        feedback: changesNotes || undefined,
      });

      // Schema-fallback for the files column (post-0018) — drop it if the
      // DB doesn't have it yet.
      const update: Record<string, unknown> = {
        md_status: "pending",
        md_notes: null,
        md_reviewed_at: null,
        md_reviewed_by: null,
        md_actual_date: null,
        completion_history: history as unknown as any,
        files: mergedFiles,
      };
      if (newPrimary) update.image_url = newPrimary;

      let { data, error: err } = await supabase
        .from("concepts")
        .update(update)
        .eq("id", conceptId)
        .eq("md_status", "revision_requested")
        .select("*")
        .single();

      if (err && /does not exist|schema cache/i.test(err.message)) {
        // Retry without `files` (pre-0018 DB)
        const { files: _omit, ...withoutFiles } = update;
        void _omit;
        const retry = await supabase
          .from("concepts")
          .update(withoutFiles)
          .eq("id", conceptId)
          .eq("md_status", "revision_requested")
          .select("*")
          .single();
        data = retry.data;
        err = retry.error;
      }

      if (err) {
        const msg = err.message.includes("Cannot coerce") || err.message.includes("JSON object")
          ? "You don't have permission to perform this action on this concept."
          : err.message;
        return { data: null, error: msg };
      }
      if (!data) {
        return {
          data: null,
          error: "Concept is not awaiting designer revision",
        };
      }

      const submitterName = profile?.full_name ?? "Designer";
      void sendNotificationToRole(
        ["admin", "design_coordinator"],
        "Concept Re-submitted",
        `${submitterName} addressed feedback and re-submitted "${data.title}"${newFiles.length > 0 ? ` — ${newFiles.length} new file${newFiles.length > 1 ? "s" : ""} uploaded` : ""}${changesNotes ? ` · Note: "${changesNotes.slice(0, 80)}${changesNotes.length > 80 ? "…" : ""}"` : ""}`,
        "info",
        "/concepts"
      );
      invalidateAll();
      return { data, error: null };
    },
    [user, profile, invalidateAll]
  );

  // ============================================================================
  // Work-status lifecycle mutations (added 0025/0026)
  // ============================================================================
  //
  // Pattern across all of these:
  //   1. Update only the rows in the expected source state — the `.eq("work_status", ...)`
  //      guard is a lightweight optimistic lock so two designers / two
  //      browser tabs can't double-transition the same concept.
  //   2. Return { data, error } and never throw — caller toasts the error.
  //   3. Fire a notification (best-effort, void-awaited) so admin/designer
  //      see the transition immediately even without a Realtime hop.

  const startConcept = useCallback<UseConcepts["startConcept"]>(
    async (conceptId) => {
      if (!user) return { data: null, error: "Not authenticated" };
      const now = new Date().toISOString();
      const history = await appendHistory(conceptId, {
        type: "started",
        date: now.slice(0, 10),
        by: profile?.full_name ?? "Designer",
      });

      const { data, error: err } = await supabase
        .from("concepts")
        .update({
          work_status: "in_progress",
          work_started_at: now,
          completion_history: history as unknown as any,
        })
        .eq("id", conceptId)
        .eq("md_status", "approved")
        .eq("work_status", "not_started")
        .select("*")
        .single();
      if (err) {
        const msg = err.message.includes("Cannot coerce") || err.message.includes("JSON object")
          ? "You don't have permission to perform this action on this concept."
          : err.message;
        return { data: null, error: msg };
      }
      if (!data) {
        return { data: null, error: "Concept is not in 'Ready' state" };
      }

      const designerName = profile?.full_name ?? "A designer";
      void sendNotificationToRole(
        ["admin", "design_coordinator"],
        "Concept started",
        `${designerName} started working on "${data.title}"`,
        "info",
        "/concepts"
      );
      invalidateAll();
      return { data, error: null };
    },
    [user, profile, invalidateAll]
  );

  const holdConcept = useCallback<UseConcepts["holdConcept"]>(
    async (conceptId, reason) => {
      if (!user) return { data: null, error: "Not authenticated" };
      const now = new Date().toISOString();

      // Read current hold_count so we can increment client-side. (Supabase
      // doesn't expose `column + 1` raw SQL via the JS client.)
      const { data: row } = await supabase
        .from("concepts")
        .select("hold_count")
        .eq("id", conceptId)
        .single();
      const nextHoldCount = (row?.hold_count ?? 0) + 1;
      const history = await appendHistory(conceptId, {
        type: "held",
        date: now.slice(0, 10),
        by: profile?.full_name ?? "Designer",
        feedback: reason?.trim() || undefined,
      });

      const { data, error: err } = await supabase
        .from("concepts")
        .update({
          work_status: "on_hold",
          work_held_at: now,
          hold_reason: reason?.trim() || null,
          hold_count: nextHoldCount,
          completion_history: history as unknown as any,
        })
        .eq("id", conceptId)
        .eq("work_status", "in_progress")
        .select("*")
        .single();
      if (err) {
        const msg = err.message.includes("Cannot coerce") || err.message.includes("JSON object")
          ? "You don't have permission to perform this action on this concept."
          : err.message;
        return { data: null, error: msg };
      }
      if (!data) {
        return { data: null, error: "Concept is not currently in progress" };
      }

      const designerName = profile?.full_name ?? "A designer";
      void sendNotificationToRole(
        ["admin", "design_coordinator"],
        "Concept on hold",
        `${designerName} paused "${data.title}"${reason?.trim() ? ` — ${reason.trim()}` : ""}`,
        "warning",
        "/concepts"
      );
      invalidateAll();
      return { data, error: null };
    },
    [user, profile, invalidateAll]
  );

  const resumeConcept = useCallback<UseConcepts["resumeConcept"]>(
    async (conceptId) => {
      if (!user) return { data: null, error: "Not authenticated" };
      const now = new Date().toISOString();

      // Compute the held duration so total_hold_duration is updated correctly.
      // Postgres `interval` doesn't have a great client-side helper, so we send
      // the delta as an ISO-8601 interval string ("PT{seconds}S") which
      // Postgres parses natively.
      const { data: row } = await supabase
        .from("concepts")
        .select("work_held_at, total_hold_duration")
        .eq("id", conceptId)
        .single();
      const heldAt = row?.work_held_at ? new Date(row.work_held_at) : null;
      const heldSeconds = heldAt
        ? Math.max(0, Math.floor((Date.now() - heldAt.getTime()) / 1000))
        : 0;

      // total_hold_duration is an interval; Postgres can accept a "{n} seconds"
      // string added via raw SQL but the JS client doesn't expose that, so we
      // overwrite with the running total expressed as a plain seconds string.
      // The existing total is read, parsed loosely, and added to the new delta.
      const existingSeconds = parseIntervalToSeconds(row?.total_hold_duration);
      const newTotalSeconds = existingSeconds + heldSeconds;

      const history = await appendHistory(conceptId, {
        type: "resumed",
        date: now.slice(0, 10),
        by: profile?.full_name ?? "Designer",
      });

      const { data, error: err } = await supabase
        .from("concepts")
        .update({
          work_status: "in_progress",
          work_resumed_at: now,
          work_held_at: null,
          hold_reason: null,
          total_hold_duration: `${newTotalSeconds} seconds`,
          completion_history: history as unknown as any,
        })
        .eq("id", conceptId)
        .eq("work_status", "on_hold")
        .select("*")
        .single();
      if (err) {
        const msg = err.message.includes("Cannot coerce") || err.message.includes("JSON object")
          ? "You don't have permission to perform this action on this concept."
          : err.message;
        return { data: null, error: msg };
      }
      if (!data) {
        return { data: null, error: "Concept is not on hold" };
      }

      const designerName = profile?.full_name ?? "A designer";
      void sendNotificationToRole(
        ["admin", "design_coordinator"],
        "Concept resumed",
        `${designerName} resumed "${data.title}"`,
        "info",
        "/concepts"
      );
      invalidateAll();
      return { data, error: null };
    },
    [user, profile, invalidateAll]
  );

  const markConceptDone = useCallback<UseConcepts["markConceptDone"]>(
    async (conceptId, options) => {
      if (!user) return { data: null, error: "Not authenticated" };

      const newFiles = options?.newFiles ?? [];
      const doneNotes = options?.notes?.trim() || undefined;

      // T9+T10 in the spec — skip `done_partial` (transient) and go straight
      // to `in_revision`. revision_count increments each round.
      const { data: row } = await supabase
        .from("concepts")
        .select("revision_count, files, image_url")
        .eq("id", conceptId)
        .single();
      const nextRevisionCount = (row?.revision_count ?? 0) + 1;
      const now = new Date().toISOString();

      const historyEntry: CompletionHistoryEntry = {
        type: "marked_done",
        date: now.slice(0, 10),
        by: profile?.full_name ?? "Designer",
        round: nextRevisionCount,
      };
      if (doneNotes) historyEntry.feedback = doneNotes;
      const history = await appendHistory(conceptId, historyEntry);

      // Also stamp the legacy `designer_actual_date` so the four-stage
      // pipeline UI (which reads that column for stage 3 = "Designer
      // Completion") shows complete without a second click. We only do it
      // on the FIRST done-mark per concept; later "marked done again"
      // events after revisions keep the original timestamp.
      const { data: existing } = await supabase
        .from("concepts")
        .select("designer_actual_date")
        .eq("id", conceptId)
        .single();
      const designerActualDate =
        existing?.designer_actual_date ?? now.slice(0, 10);

      // Append new files to existing files array (versioning: append, not replace)
      const existingFiles: string[] = Array.isArray(row?.files) ? (row!.files as string[]) : row?.image_url ? [row.image_url] : [];
      const mergedFiles = [...existingFiles, ...newFiles];
      const newPrimary = newFiles[0] ?? row?.image_url ?? null;

      const update: Record<string, unknown> = {
        work_status: "in_revision",
        revision_count: nextRevisionCount,
        completion_history: history as unknown as any,
        designer_actual_date: designerActualDate,
        md_feedback: null,
        final_approval_notes: null,
      };
      if (newFiles.length > 0) {
        update.files = mergedFiles;
        update.image_url = newPrimary;
        update.file_url = newPrimary;
      }

      const { data, error: err } = await supabase
        .from("concepts")
        .update(update)
        .eq("id", conceptId)
        .in("work_status", ["in_progress", "changes_requested", "in_revision"])
        .select("*")
        .single();
      if (err) {
        const msg = err.message.includes("Cannot coerce") || err.message.includes("JSON object")
          ? "You don't have permission to perform this action on this concept."
          : err.message;
        return { data: null, error: msg };
      }
      if (!data) {
        return { data: null, error: "Concept is not currently in progress" };
      }

      const designerName = profile?.full_name ?? "A designer";
      const reviewMeta = [
        data.designs_count ? `${data.designs_count} designs` : null,
        nextRevisionCount > 1 ? `Round ${nextRevisionCount}` : null,
      ].filter(Boolean).join(" · ");
      void sendNotificationToRole(
        ["admin"],
        "Design ready for review",
        `${designerName} completed "${data.title}" — ${reviewMeta || "awaiting your review"}`,
        "info",
        "/concepts"
      );
      invalidateAll();
      return { data, error: null };
    },
    [user, profile, invalidateAll]
  );

  const approveDesign = useCallback<UseConcepts["approveDesign"]>(
    async (conceptId, approvedDesignsCount) => {
      if (!user) return { data: null, error: "Not authenticated" };
      const now = new Date().toISOString();
      const history = await appendHistory(conceptId, {
        type: "design_approved",
        date: now.slice(0, 10),
        by: profile?.full_name ?? "Admin",
      });

      // Stamp the legacy final-approval fields so the four-stage pipeline
      // UI (`final_approved_at` drives stage 4 = "done") lights up without
      // requiring a separate `finalApproveConcept` click. `approved_designs_count`
      // is set only when MD provided it — null leaves the prior value in place.
      const update: Record<string, unknown> = {
        work_status: "completed",
        work_completed_at: now,
        md_feedback: null,
        completion_history: history as unknown as any,
        final_approved_at: now,
        final_approval_actual_date: now.slice(0, 10),
      };
      if (
        approvedDesignsCount !== undefined &&
        approvedDesignsCount !== null &&
        Number.isFinite(approvedDesignsCount)
      ) {
        update.approved_designs_count = approvedDesignsCount;
      }

      const { data, error: err } = await supabase
        .from("concepts")
        .update(update)
        .eq("id", conceptId)
        .eq("work_status", "in_revision")
        .select("*")
        .single();
      if (err) {
        const msg = err.message.includes("Cannot coerce") || err.message.includes("JSON object")
          ? "You don't have permission to perform this action on this concept."
          : err.message;
        return { data: null, error: msg };
      }
      if (!data) {
        return { data: null, error: "Concept is not awaiting design review" };
      }

      // Notify the designer who built it (not the submitter — they may differ).
      const designerId = data.designer_id ?? data.submitted_by;
      void sendNotification(
        designerId,
        "Design approved!",
        `Ma'am approved your design "${data.title}"`,
        "success",
        "/concepts"
      );
      invalidateAll();
      return { data, error: null };
    },
    [user, invalidateAll]
  );

  const suggestChanges = useCallback<UseConcepts["suggestChanges"]>(
    async (conceptId, feedback) => {
      if (!user) return { data: null, error: "Not authenticated" };
      const trimmed = feedback?.trim();
      if (!trimmed) {
        return { data: null, error: "Feedback is required" };
      }
      const now = new Date().toISOString();
      const history = await appendHistory(conceptId, {
        type: "changes_requested",
        date: now.slice(0, 10),
        by: profile?.full_name ?? "Admin",
        feedback: trimmed,
      });

      // Skip `changes_requested` and go straight back to `in_progress` so
      // the designer's "Reworking — round N" banner (gated by
      // revision_count >= 1) lights up immediately with MD's feedback.
      // The legacy `changes_requested` enum value remains in case any
      // pre-0030 row carries it, but the mutation no longer produces new
      // ones.
      const { data, error: err } = await supabase
        .from("concepts")
        .update({
          work_status: "in_progress",
          md_feedback: trimmed,
          completion_history: history as unknown as any,
        })
        .eq("id", conceptId)
        .eq("work_status", "in_revision")
        .select("*")
        .single();
      if (err) {
        const msg = err.message.includes("Cannot coerce") || err.message.includes("JSON object")
          ? "You don't have permission to perform this action on this concept."
          : err.message;
        return { data: null, error: msg };
      }
      if (!data) {
        return { data: null, error: "Concept is not awaiting design review" };
      }

      const designerId = data.designer_id ?? data.submitted_by;
      void sendNotification(
        designerId,
        "Changes requested",
        `Ma'am suggested changes on "${data.title}": ${trimmed}`,
        "warning",
        "/concepts"
      );
      invalidateAll();
      return { data, error: null };
    },
    [user, invalidateAll]
  );

  const startChanges = useCallback<UseConcepts["startChanges"]>(
    async (conceptId) => {
      if (!user) return { data: null, error: "Not authenticated" };
      const now = new Date().toISOString();
      const history = await appendHistory(conceptId, {
        type: "start_changes",
        date: now.slice(0, 10),
        by: profile?.full_name ?? "Designer",
      });

      // T13 — flip back to in_progress; md_feedback stays so designer can
      // reference it while reworking.
      const { data, error: err } = await supabase
        .from("concepts")
        .update({
          work_status: "in_progress",
          completion_history: history as unknown as any,
        })
        .eq("id", conceptId)
        .eq("work_status", "changes_requested")
        .select("*")
        .single();
      if (err) {
        const msg = err.message.includes("Cannot coerce") || err.message.includes("JSON object")
          ? "You don't have permission to perform this action on this concept."
          : err.message;
        return { data: null, error: msg };
      }
      if (!data) {
        return { data: null, error: "Concept is not in 'Changes Needed' state" };
      }

      const designerName = profile?.full_name ?? "A designer";
      void sendNotificationToRole(
        ["admin", "design_coordinator"],
        "Implementing changes",
        `${designerName} started working on changes for "${data.title}"`,
        "info",
        "/concepts"
      );
      invalidateAll();
      return { data, error: null };
    },
    [user, profile, invalidateAll]
  );

  const deleteConcept = useCallback<UseConcepts["deleteConcept"]>(
    async (conceptId) => {
      if (!user) return { data: null, error: "Not authenticated" };
      const { error: err } = await supabase
        .from("concepts")
        .delete()
        .eq("id", conceptId);
      if (err) {
        const msg = err.message.includes("Cannot coerce") || err.message.includes("JSON object")
          ? "You don't have permission to perform this action on this concept."
          : err.message;
        return { data: null, error: msg };
      }
      invalidateAll();
      return { data: { id: conceptId }, error: null };
    },
    [user, invalidateAll]
  );

  const concepts = data ?? [];
  return {
    concepts,
    totalCount: concepts.length,
    isLoading,
    error: error instanceof Error ? error.message : null,
    refetch,
    submitConcept,
    editConcept,
    reviewConcept,
    finalizeConcept,
    finalApproveConcept,
    finalReviseConcept,
    resubmitConcept,
    resubmitForReview,
    startConcept,
    holdConcept,
    resumeConcept,
    markConceptDone,
    approveDesign,
    suggestChanges,
    startChanges,
    deleteConcept,
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Loose parser for Postgres `interval` JSON shapes. Supabase returns
 * `total_hold_duration` as either a serialized string ("01:23:45.6789") or an
 * ISO-8601 duration ("PT5025S") depending on the rest config. We just need
 * the total seconds — drift-tolerant since this is only used for cumulative
 * hold tracking, not billing.
 */
function parseIntervalToSeconds(raw: string | null | undefined): number {
  if (!raw) return 0;
  // ISO 8601: PT5025S / PT1H23M / etc.
  const iso = raw.match(/^P(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/);
  if (iso) {
    const h = parseInt(iso[1] ?? "0", 10);
    const m = parseInt(iso[2] ?? "0", 10);
    const s = parseFloat(iso[3] ?? "0");
    return h * 3600 + m * 60 + s;
  }
  // HH:MM:SS[.fff] or numeric-only ("5025" / "5025 seconds")
  const hms = raw.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
  if (hms) {
    return parseInt(hms[1], 10) * 3600 + parseInt(hms[2], 10) * 60 + parseFloat(hms[3]);
  }
  const numeric = parseFloat(raw);
  return Number.isFinite(numeric) ? numeric : 0;
}
