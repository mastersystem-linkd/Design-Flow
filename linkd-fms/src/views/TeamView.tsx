import { useState } from "react";
import { RefreshCw, Plus, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useProfiles } from "@/hooks/useProfiles";
import { useDesignerCodes } from "@/hooks/useDesignerCodes";
import { supabase } from "@/lib/supabase";
import { sendNotification } from "@/lib/notifications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { toast } from "@/components/ui/Toaster";
import { cn, formatDate } from "@/lib/utils";
import { isAdmin as isAdminCheck } from "@/lib/permissions";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  getInitials,
} from "@/components/ui/avatar";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ROLE_LABELS } from "@/lib/constants";
import type { UserRole, Profile } from "@/types/database";

const ALL_ROLES: UserRole[] = ["admin", "design_coordinator", "designer"];

export function TeamView() {
  const { profile: myProfile } = useAuth();
  const isAdmin = isAdminCheck(myProfile?.role);

  const { profiles, isLoading: profilesLoading, error: profilesError, refetch: refetchProfiles } = useProfiles();
  const { codes, codesByProfile, isLoading: codesLoading, refetch: refetchCodes } = useDesignerCodes();
  const [refreshing, setRefreshing] = useState(false);

  // Role change state
  const [roleChange, setRoleChange] = useState<{ user: Profile; newRole: UserRole } | null>(null);
  const [changingRole, setChangingRole] = useState(false);

  // Designer code add state
  const [addCodeFor, setAddCodeFor] = useState<string | null>(null);
  const [newCode, setNewCode] = useState("");
  const [addingCode, setAddingCode] = useState(false);

  // Designer code delete state
  const [deleteCode, setDeleteCode] = useState<{ id: string; code: string; userName: string } | null>(null);
  const [deletingCode, setDeletingCode] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([refetchProfiles(), refetchCodes()]);
    setRefreshing(false);
  }

  // ── Role change ──
  async function confirmRoleChange() {
    if (!roleChange) return;
    setChangingRole(true);
    const { error } = await supabase
      .from("profiles")
      .update({ role: roleChange.newRole })
      .eq("id", roleChange.user.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`${roleChange.user.full_name}'s role updated to ${ROLE_LABELS[roleChange.newRole]}`);
      void sendNotification(
        roleChange.user.id,
        "Role Updated",
        `Your role has been changed to ${ROLE_LABELS[roleChange.newRole]}.`,
        "info"
      );
      await refetchProfiles();
    }
    setChangingRole(false);
    setRoleChange(null);
  }

  // ── Add designer code ──
  async function handleAddCode(profileId: string) {
    const code = newCode.trim().toUpperCase();
    if (!code) { toast.error("Code is required"); return; }

    setAddingCode(true);
    const { error } = await supabase
      .from("designer_codes")
      .insert({
        profile_id: profileId,
        code,
        joining_date: new Date().toISOString().slice(0, 10),
        status: "active",
      });

    if (error) {
      toast.error(error.code === "23505" ? `Code "${code}" already exists` : error.message);
    } else {
      toast.success(`Code "${code}" added`);
      setNewCode("");
      setAddCodeFor(null);
      await refetchCodes();
    }
    setAddingCode(false);
  }

  // ── Delete designer code ──
  async function confirmDeleteCode() {
    if (!deleteCode) return;
    setDeletingCode(true);
    const { error } = await supabase
      .from("designer_codes")
      .delete()
      .eq("id", deleteCode.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`Code "${deleteCode.code}" removed`);
      await refetchCodes();
    }
    setDeletingCode(false);
    setDeleteCode(null);
  }

  if (profilesError) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        Failed to load team: {profilesError}
      </div>
    );
  }

  const designerCount = profiles.filter((p) => p.role === "designer").length;
  const adminCount = profiles.filter((p) => p.role === "admin").length;
  const isLoading = profilesLoading || codesLoading;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <p className="text-sm text-muted-foreground">
            {profiles.length} member{profiles.length === 1 ? "" : "s"}
          </p>
          {!profilesLoading && (
            <p className="text-xs text-muted-foreground">
              · {adminCount} admin{adminCount === 1 ? "" : "s"} ·{" "}
              {designerCount} designer{designerCount === 1 ? "" : "s"}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
        </button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All users</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4"><SkeletonTable rows={4} cols={5} /></div>
          ) : profiles.length === 0 ? (
            <div className="p-6"><EmptyState icon="👥" title="No members yet" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-y border-border bg-secondary/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Name</th>
                    <th className="px-4 py-2 font-medium">Role</th>
                    <th className="px-4 py-2 font-medium">Designer codes</th>
                    <th className="px-4 py-2 font-medium">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((p) => {
                    const userCodes = codesByProfile.get(p.id) ?? [];
                    const isSelf = p.id === myProfile?.id;
                    return (
                      <tr key={p.id} className="border-b border-border last:border-0">
                        {/* Name */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <Avatar className="h-7 w-7">
                              {p.avatar_url ? <AvatarImage src={p.avatar_url} /> : null}
                              <AvatarFallback>{getInitials(p.full_name)}</AvatarFallback>
                            </Avatar>
                            <span className="font-medium text-foreground">{p.full_name}</span>
                            {isSelf && <span className="text-[10px] text-muted-foreground">(you)</span>}
                          </div>
                        </td>

                        {/* Role — admin gets a dropdown */}
                        <td className="px-4 py-3">
                          {isAdmin && !isSelf ? (
                            <select
                              value={p.role}
                              onChange={(e) =>
                                setRoleChange({ user: p, newRole: e.target.value as UserRole })
                              }
                              className="h-8 rounded-md border border-border bg-card px-2 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-ring"
                            >
                              {ALL_ROLES.map((r) => (
                                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                              ))}
                            </select>
                          ) : (
                            <Badge variant="secondary">{ROLE_LABELS[p.role]}</Badge>
                          )}
                        </td>

                        {/* Designer codes — with add/remove for admin */}
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {userCodes.length === 0 && (
                              <span className="text-xs italic text-muted-foreground">—</span>
                            )}
                            {userCodes.map((c) => (
                              <span
                                key={c.id}
                                title={`Joined ${formatDate(c.joining_date)}${c.status === "inactive" ? " · inactive" : ""}`}
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold",
                                  c.status === "active"
                                    ? "border-primary/60 bg-primary/15 text-foreground"
                                    : "border-border bg-secondary text-muted-foreground line-through"
                                )}
                              >
                                {c.code}
                                {isAdmin && (
                                  <button
                                    type="button"
                                    onClick={() => setDeleteCode({ id: c.id, code: c.code, userName: p.full_name })}
                                    className="ml-0.5 rounded p-0.5 text-muted-foreground hover:text-destructive"
                                    title="Remove code"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                )}
                              </span>
                            ))}
                            {isAdmin && (
                              addCodeFor === p.id ? (
                                <div className="flex items-center gap-1">
                                  <Input
                                    value={newCode}
                                    onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                                    placeholder="Code"
                                    className="h-7 w-16 px-1.5 font-mono text-xs"
                                    maxLength={5}
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") void handleAddCode(p.id);
                                      if (e.key === "Escape") { setAddCodeFor(null); setNewCode(""); }
                                    }}
                                  />
                                  <Button
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => void handleAddCode(p.id)}
                                    disabled={addingCode}
                                  >
                                    Add
                                  </Button>
                                  <button
                                    type="button"
                                    onClick={() => { setAddCodeFor(null); setNewCode(""); }}
                                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => { setAddCodeFor(p.id); setNewCode(""); }}
                                  className="inline-flex items-center gap-0.5 rounded-md border border-dashed border-border px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                                >
                                  <Plus className="h-3 w-3" />
                                </button>
                              )
                            )}
                          </div>
                        </td>

                        {/* Joined */}
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatDate(p.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Role change confirmation */}
      <ConfirmDialog
        open={!!roleChange}
        title="Change role?"
        description={
          roleChange
            ? `Change ${roleChange.user.full_name}'s role to ${ROLE_LABELS[roleChange.newRole]}?`
            : ""
        }
        variant="warning"
        confirmLabel={changingRole ? "Updating…" : "Confirm"}
        onConfirm={() => void confirmRoleChange()}
        onCancel={() => setRoleChange(null)}
      />

      {/* Code delete confirmation */}
      <ConfirmDialog
        open={!!deleteCode}
        title="Remove designer code?"
        description={
          deleteCode
            ? `Remove code "${deleteCode.code}" from ${deleteCode.userName}?`
            : ""
        }
        variant="danger"
        confirmLabel={deletingCode ? "Removing…" : "Remove"}
        onConfirm={() => void confirmDeleteCode()}
        onCancel={() => setDeleteCode(null)}
      />
    </div>
  );
}
