import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Client } from "@/types/database";

/** Lists all clients ordered by party_name. */
export function useClients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("clients")
      .select("*")
      .order("party_name", { ascending: true });
    if (err) {
      setError(err.message);
      setClients([]);
    } else {
      setClients(data ?? []);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { clients, isLoading, error, refetch };
}
