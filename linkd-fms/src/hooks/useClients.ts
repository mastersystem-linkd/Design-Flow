import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import type { Client } from "@/types/database";

async function fetchClients(): Promise<Client[]> {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("party_name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Lists all clients ordered by party_name. */
export function useClients() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.clients.all,
    queryFn: fetchClients,
  });
  const clients = data ?? [];
  return {
    clients,
    totalCount: clients.length,
    isLoading,
    error: error instanceof Error ? error.message : null,
    refetch,
  };
}
