import { createClient } from "@/lib/supabase/server";
import { requireSection } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { can } from "@/lib/permissions";
import type { UserRole } from "@/types/database";
import { RoleSelect } from "./role-select";

export default async function UsersPage() {
  const me = await requireSection("users");
  const supabase = createClient();
  const { data: users, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        Failed to load users: {error.message}
      </div>
    );
  }

  const canManage = can(me.role, "users:manage_roles");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">
          {users?.length ?? 0} member{users?.length === 1 ? "" : "s"}. Roles
          determine what each user can see and do.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All users</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-y bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Added</th>
              </tr>
            </thead>
            <tbody>
              {(users ?? []).map((u) => {
                const isSelf = u.id === me.id;
                return (
                  <tr key={u.id} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium">{u.full_name}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {u.id}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {canManage && !isSelf ? (
                        <RoleSelect userId={u.id} current={u.role as UserRole} />
                      ) : (
                        <Badge variant="secondary">{ROLE_LABELS[u.role]}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(u.created_at)}
                    </td>
                  </tr>
                );
              })}
              {(!users || users.length === 0) && (
                <tr>
                  <td
                    colSpan={3}
                    className="px-4 py-8 text-center text-sm text-muted-foreground"
                  >
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {!canManage && (
        <p className="text-xs text-muted-foreground">
          Role changes are restricted. Ask an admin to update someone's role.
        </p>
      )}
    </div>
  );
}
