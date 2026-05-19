import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { requireProfile } from "@/lib/auth";
import { can } from "@/lib/permissions";

export default async function ClientsPage() {
  const me = await requireProfile();
  const supabase = createClient();
  const { data: clients, error } = await supabase
    .from("clients")
    .select("*")
    .order("party_name");

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Failed to load clients: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="text-sm text-muted-foreground">
            {clients?.length ?? 0} parties.
          </p>
        </div>
        {can(me.role, "clients:create") && (
          <Button size="sm" className="gap-2">
            <Plus className="h-4 w-4" />
            Add client
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All clients</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-y bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Party name</th>
                <th className="px-4 py-2 font-medium">Added</th>
              </tr>
            </thead>
            <tbody>
              {(clients ?? []).map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium">{c.party_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(c.created_at)}
                  </td>
                </tr>
              ))}
              {(!clients || clients.length === 0) && (
                <tr>
                  <td
                    colSpan={2}
                    className="px-4 py-8 text-center text-sm text-muted-foreground"
                  >
                    No clients yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
