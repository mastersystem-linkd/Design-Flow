import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
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
   * Storage path of the supporting file (image, PSD, MP4) inside the
   * `sample-files` bucket. Pre-0012 this was an image inside `design-files`;
   * new submissions use `sample-files` (100 MB cap).
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
  refetch: () => Promise<void>;
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

export function useConcepts(filters?: ConceptFilters): UseConcepts {
  const { user } = useAuth();
  const [concepts, setConcepts] = useState<ConceptWithRelations[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filterKey = JSON.stringify(filters ?? {});

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);

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
      if (filters?.mySubmissionsOnly && user?.id) {
        q = q.eq("submitted_by", user.id);
      } else if (filters?.submittedBy) {
        q = q.eq("submitted_by", filters.submittedBy);
      }
      return q;
    }

    // Try the full select first (post-0012 schema).
    let { data, error: err } = await buildQuery(FULL_SELECT);

    // If 0012 hasn't been applied yet, PostgREST reports the missing relation
    // and we fall back to the legacy select so the page still renders.
    if (err && isMissingRelationshipError(err.message)) {
      console.warn(
        "[useConcepts] new relations missing — falling back to legacy select. " +
          "Apply migration 0012 to enable designer/client joins."
      );
      const fallback = await buildQuery(LEGACY_SELECT);
      data = fallback.data;
      err = fallback.error;
    }

    if (err) {
      console.error("[useConcepts] query error", err);
      setError(err.message);
      setConcepts([]);
    } else {
      setConcepts((data ?? []) as unknown as ConceptWithRelations[]);
    }
    setIsLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, user?.id]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  // ── Realtime subscription ─────────────────────────────────────────
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    const channel = supabase
      .channel("concepts-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "concepts" },
        () => { void refetch(); }
      )
      .subscribe();

    channelRef.current = channel;
    return () => {
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [refetch]);

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
      const extendedPayload = {
        ...basePayload,
        start_date: input.start_date ?? null,
        designer_id: input.designer_id ?? null,
        client_id: input.client_id ?? null,
        assigned_by: input.assigned_by?.trim() || null,
        priority: input.priority ?? "normal",
        file_url: input.file_url ?? input.image_url,
      };

      let { data, error: err } = await supabase
        .from("concepts")
        .insert(extendedPayload)
        .select("*")
        .single();

      // If migration 0012 isn't applied yet, the new columns don't exist
      // (Postgres reports "column ... does not exist"). Fall back to the
      // base payload so submission still works.
      if (err && /does not exist|schema cache/i.test(err.message)) {
        console.warn(
          "[useConcepts] new columns missing — submitting with base payload. " +
            "Apply migration 0012 to persist start_date/designer/client/etc."
        );
        const fallback = await supabase
          .from("concepts")
          .insert(basePayload)
          .select("*")
          .single();
        data = fallback.data;
        err = fallback.error;
      }

      if (err) return { data: null, error: err.message };

      // Notify admins that a concept was submitted for review
      void sendNotificationToRole(
        "admin",
        "New Concept Submitted",
        `${input.title} was submitted for review.`,
        "info",
        "/concepts"
      );

      await refetch();
      return { data, error: null };
    },
    [user, refetch]
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
          // md_actual_date + md_reviewed_at stamped by trigger
          // designer_planned_date = +4d set by trigger on approval
        })
        .eq("id", conceptId)
        .select("*")
        .single();
      if (err) return { data: null, error: err.message };

      // Notify the concept submitter of the review result
      if (data) {
        const statusLabel =
          input.status === "approved" ? "approved" :
          input.status === "rejected" ? "rejected" :
          "sent back for revision";
        const type = input.status === "approved" ? "success" as const :
                     input.status === "rejected" ? "warning" as const :
                     "info" as const;
        void sendNotification(
          data.submitted_by,
          `Concept ${statusLabel}`,
          `Your concept "${data.title}" has been ${statusLabel}.`,
          type,
          "/concepts"
        );
      }

      await refetch();
      return { data, error: null };
    },
    [user, refetch]
  );

  // ── History helper: fetch current history, append entry, return updated ──
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

  // ── Designer marks concept as Done (first time) ──
  const finalizeConcept = useCallback<UseConcepts["finalizeConcept"]>(
    async (conceptId) => {
      if (!user) return { data: null, error: "Not authenticated" };

      const now = new Date().toISOString().slice(0, 10);

      // Fetch concept to calculate delay
      const { data: concept } = await supabase
        .from("concepts")
        .select("designer_planned_date, designer_actual_date")
        .eq("id", conceptId)
        .single();

      // Don't overwrite if already done (re-submit uses resubmitConcept)
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
      await refetch();
      return { data, error: null };
    },
    [user, refetch]
  );

  // ── MD grants Final Approval ──
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

      await refetch();
      return { data, error: null };
    },
    [user, refetch]
  );

  // ── MD requests revision (with mandatory feedback) ──
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
          "Revision Feedback",
          `Your concept "${data.title}" received feedback: ${notes.trim()}`,
          "warning",
          "/concepts"
        );
      }

      await refetch();
      return { data, error: null };
    },
    [user, refetch]
  );

  // ── Designer re-submits after revision ──
  const resubmitConcept = useCallback<UseConcepts["resubmitConcept"]>(
    async (conceptId) => {
      if (!user) return { data: null, error: "Not authenticated" };

      const now = new Date().toISOString().slice(0, 10);

      // Calculate delay from original done date
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
        void sendNotificationToRole(
          "admin",
          "Concept Re-submitted",
          `"${data.title}" has been re-submitted after revision.`,
          "info",
          "/concepts"
        );
      }

      await refetch();
      return { data, error: null };
    },
    [user, refetch]
  );

  return {
    concepts,
    totalCount: concepts.length,
    isLoading,
    error,
    refetch,
    submitConcept,
    reviewConcept,
    finalizeConcept,
    finalApproveConcept,
    finalReviseConcept,
    resubmitConcept,
  };
}
