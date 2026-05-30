import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { Client, ClientGroup } from "@/types/database";

// Supabase/PostgREST caps a single response at 1,000 rows. The party list can
// be much larger (thousands), so page through with `.range()` until a short
// page signals the end. Tiebreak on `id` so pagination stays stable even when
// the same party_name exists in both groups.
async function fetchClients(): Promise<Client[]> {
  const PAGE = 1000;
  const all: Client[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("party_name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as Client[];
    all.push(...batch);
    if (batch.length < PAGE) break;
  }
  return all;
}

/**
 * Lists clients ordered by party_name.
 *
 * `ldClients` and `jobWorkClients` are pre-filtered views over the same
 * fetched data — callers that only care about one segment can read those
 * without re-running the query. Cache key is shared across all consumers.
 */
export function useClients() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.clients.all,
    queryFn: fetchClients,
  });
  const clients = data ?? [];

  const { ldClients, jobWorkClients } = useMemo(() => {
    const ld: Client[] = [];
    const jw: Client[] = [];
    for (const c of clients) {
      if (c.client_group === "ld") ld.push(c);
      else if (c.client_group === "job_work") jw.push(c);
    }
    return { ldClients: ld, jobWorkClients: jw };
  }, [clients]);

  return {
    clients,
    ldClients,
    jobWorkClients,
    totalCount: clients.length,
    isLoading,
    error: error instanceof Error ? error.message : null,
    refetch,
  };
}

/** Friendly labels for the client_group enum — use everywhere the segment
 *  is shown in the UI so wording stays consistent. */
export const CLIENT_GROUP_LABEL: Record<ClientGroup, string> = {
  ld: "LD",
  job_work: "Job Work",
};
