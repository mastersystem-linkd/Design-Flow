import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type {
  ExternalIntegration,
  IntegrationEvent,
} from "@/types/database";

// ============================================================================
// Crypto helpers (client-side key generation)
// ============================================================================

export function generateApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const rand = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sk_live_${rand}`;
}

export function generateWebhookSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const rand = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `whsec_${rand}`;
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ============================================================================
// Types
// ============================================================================

export interface QueueStats {
  pending: number;
  failed: number;
  sent: number;
}

type MutResult = { error: string | null };

// ============================================================================
// Hook
// ============================================================================

export function useIntegration() {
  const queryClient = useQueryClient();

  const invalidateAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.integration.all });
  }, [queryClient]);

  // ── Config (single Sales ERP row) ──
  const configQuery = useQuery({
    queryKey: queryKeys.integration.config,
    queryFn: async (): Promise<ExternalIntegration | null> => {
      const { data, error } = await supabase
        .from("external_integrations")
        .select("*")
        .eq("name", "Sales ERP")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // ── Events (last 50) ──
  const eventsQuery = useQuery({
    queryKey: queryKeys.integration.events,
    queryFn: async (): Promise<IntegrationEvent[]> => {
      const { data, error } = await supabase
        .from("integration_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as IntegrationEvent[];
    },
  });

  // ── Queue stats ──
  const queueQuery = useQuery({
    queryKey: queryKeys.integration.queueStats,
    queryFn: async (): Promise<QueueStats> => {
      const [pendingRes, failedRes, sentRes] = await Promise.all([
        supabase
          .from("webhook_outbox")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("webhook_outbox")
          .select("id", { count: "exact", head: true })
          .eq("status", "failed"),
        supabase
          .from("webhook_outbox")
          .select("id", { count: "exact", head: true })
          .eq("status", "sent"),
      ]);
      return {
        pending: pendingRes.count ?? 0,
        failed: failedRes.count ?? 0,
        sent: sentRes.count ?? 0,
      };
    },
  });

  // ── Mutations ──

  async function createIntegration(): Promise<
    MutResult & { key?: string }
  > {
    const key = generateApiKey();
    const hash = await sha256Hex(key);
    const prefix = key.slice(0, 10);
    const secret = generateWebhookSecret();

    const { error } = await supabase.from("external_integrations").insert({
      name: "Sales ERP",
      api_key_hash: hash,
      api_key_prefix: prefix,
      webhook_secret: secret,
      is_active: true,
    });
    if (error) return { error: error.message };
    invalidateAll();
    return { error: null, key };
  }

  async function toggleActive(
    id: string,
    active: boolean
  ): Promise<MutResult> {
    const { error } = await supabase
      .from("external_integrations")
      .update({ is_active: active })
      .eq("id", id);
    if (error) return { error: error.message };
    invalidateAll();
    return { error: null };
  }

  async function updateWebhookUrl(
    id: string,
    url: string
  ): Promise<MutResult> {
    const { error } = await supabase
      .from("external_integrations")
      .update({ webhook_url: url.trim() || null })
      .eq("id", id);
    if (error) return { error: error.message };
    invalidateAll();
    return { error: null };
  }

  async function regenerateApiKey(
    id: string
  ): Promise<MutResult & { key?: string }> {
    const key = generateApiKey();
    const hash = await sha256Hex(key);
    const prefix = key.slice(0, 10);
    const { error } = await supabase
      .from("external_integrations")
      .update({ api_key_hash: hash, api_key_prefix: prefix })
      .eq("id", id);
    if (error) return { error: error.message };
    invalidateAll();
    return { error: null, key };
  }

  async function regenerateWebhookSecret(
    id: string
  ): Promise<MutResult & { secret?: string }> {
    const secret = generateWebhookSecret();
    const { error } = await supabase
      .from("external_integrations")
      .update({ webhook_secret: secret })
      .eq("id", id);
    if (error) return { error: error.message };
    invalidateAll();
    return { error: null, secret };
  }

  async function sendTestPing(id: string): Promise<MutResult> {
    const config = configQuery.data;
    if (!config?.webhook_url) {
      return { error: "No webhook URL configured" };
    }
    const { error } = await supabase.from("webhook_outbox").insert({
      event: "test.ping",
      entity_type: "integration",
      entity_id: id,
      ref_id: null,
      target_url: config.webhook_url,
      payload: {
        event: "test.ping",
        timestamp: new Date().toISOString(),
        message: "Test ping from Design Flow",
      },
    });
    if (error) return { error: error.message };
    void queryClient.invalidateQueries({
      queryKey: queryKeys.integration.queueStats,
    });
    return { error: null };
  }

  async function retryFailed(): Promise<MutResult> {
    const { error } = await supabase
      .from("webhook_outbox")
      .update({
        status: "pending" as const,
        attempts: 0,
        next_retry_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("status", "failed");
    if (error) return { error: error.message };
    void queryClient.invalidateQueries({
      queryKey: queryKeys.integration.queueStats,
    });
    return { error: null };
  }

  return {
    config: configQuery.data ?? null,
    configLoading: configQuery.isLoading,
    events: eventsQuery.data ?? [],
    eventsLoading: eventsQuery.isLoading,
    queueStats: queueQuery.data ?? { pending: 0, failed: 0, sent: 0 },
    queueLoading: queueQuery.isLoading,
    refetchEvents: eventsQuery.refetch,
    refetchQueue: queueQuery.refetch,
    createIntegration,
    toggleActive,
    updateWebhookUrl,
    regenerateApiKey,
    regenerateWebhookSecret,
    sendTestPing,
    retryFailed,
  };
}
