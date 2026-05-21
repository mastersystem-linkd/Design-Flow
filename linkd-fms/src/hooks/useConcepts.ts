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
  /** Designer re-submits after addressing revision feedback — clears notes so MD sees "Pending". */
  resubmitConcept: (conceptId: string) => Promise<MutationResult<Concept>>;
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
      if (!input.title?.trim())
        return { data: null, error: "title is required" };
      if (!input.image_url?.trim())
        return { data: null, error: "image is required" };

      const basePayload = {
        title: input.title.trim(),
        description: input.description?.trim() || null,
        image_url: input.image_url,
        submitted_by: user.id,
      };
      const filesArray =
        input.files && input.files.length > 0
          ? input.files
          : [input.image_url];
      const extendedPayload = {
        ...basePayload,
        start_date: input.start_date ?? null,
        designer_id: input.designer_id ?? null,
        client_id: input.client_id ?? null,
        assigned_by: input.assigned_by?.trim() || null,
        priority: input.priority ?? "normal",
        file_url: input.file_url ?? input.image_url,
        files: filesArray,
      };

      let { data, error: err } = await supabase
        .from("concepts")
        .insert(extendedPayload)
        .select("*")
        .single();

      // Schema fallback ladder:
      //   1. Full extendedPayload   — works post-0018
      //   2. Drop `files` column    — works post-0012, pre-0018
      //   3. basePayload only       — works pre-0012
      if (err && /does not exist|schema cache/i.test(err.message)) {
        console.warn(
          "[useConcepts] schema missing — retrying without `files` column. " +
            "Apply migration 0018 to persist multi-file attachments."
        );
        const { files: _omit, ...withoutFiles } = extendedPayload;
        void _omit;
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

      if (err) return { data: null, error: err.message };

      const submitterName = profile?.full_name ?? "A designer";
      void sendNotificationToRole(
        ["admin", "design_coordinator"],
        "New Concept Submitted",
        `${submitterName} submitted "${input.title}"`,
        "info",
        "/concepts"
      );

      invalidateAll();
      return { data, error: null };
    },
    [user, profile, invalidateAll]
  );

  const reviewConcept = useCallback<UseConcepts["reviewConcept"]>(
    async (conceptId, input) => {
      if (!user) return { data: null, error: "Not authenticated" };
      const { data, error: err } = await supabase
        .from("concepts")
        .update({
          md_status: input.status,
          md_reviewed_by: user.id,
          md_notes: input.notes?.trim() || null,
        })
        .eq("id", conceptId)
        .select("*")
        .single();
      if (err) return { data: null, error: err.message };

      if (data) {
        // Per-verdict notification — the submitter learns the outcome AND
        // the reason in a single payload, so they don't have to open the
        // drawer to find out why a rejection happened.
        const notes = input.notes?.trim();
        if (input.status === "approved") {
          void sendNotification(
            data.submitted_by,
            "Concept Approved",
            `Your concept "${data.title}" has been approved.`,
            "success",
            "/concepts"
          );
        } else if (input.status === "rejected") {
          void sendNotification(
            data.submitted_by,
            "Concept Rejected",
            `Your concept "${data.title}" was rejected: ${notes || "No reason given"}`,
            "warning",
            "/concepts"
          );
        } else if (input.status === "revision_requested") {
          void sendNotification(
            data.submitted_by,
            "Revision Requested",
            `Changes needed on "${data.title}": ${notes || "See details"}`,
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
    return [...existing, entry];
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
      if (err) return { data: null, error: err.message };
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

      const { data, error: err } = await supabase
        .from("concepts")
        .update({
          final_approved_at: now,
          final_approval_actual_date: now.slice(0, 10),
          final_approval_notes: input?.notes?.trim() || null,
          approved_designs_count: input?.approved_designs_count ?? null,
          completion_history: history as unknown as any,
        })
        .eq("id", conceptId)
        .select("*")
        .single();

      if (err) return { data: null, error: err.message };

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
          final_approval_notes: notes.trim(),
          completion_history: history as unknown as any,
        })
        .eq("id", conceptId)
        .select("*")
        .single();

      if (err) return { data: null, error: err.message };

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

      if (err) return { data: null, error: err.message };

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

  const concepts = data ?? [];
  return {
    concepts,
    totalCount: concepts.length,
    isLoading,
    error: error instanceof Error ? error.message : null,
    refetch,
    submitConcept,
    reviewConcept,
    finalizeConcept,
    finalApproveConcept,
    finalReviseConcept,
    resubmitConcept,
  };
}
