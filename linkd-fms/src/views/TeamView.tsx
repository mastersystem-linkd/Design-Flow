import { useEffect, useState } from "react";
import {
  RefreshCw,
  Plus,
  X,
  BarChart3,
  UserPlus,
  Pencil,
  Trash2,
} from "lucide-react";
import { DesignerScorecardDrawer } from "@/components/analytics/DesignerScorecardDrawer";
import { useAuth } from "@/hooks/useAuth";
import { useProfiles } from "@/hooks/useProfiles";
import { useDesignerCodes } from "@/hooks/useDesignerCodes";
import { supabase } from "@/lib/supabase";
import { sendNotification } from "@/lib/notifications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { toast } from "@/components/ui/Toaster";
import { cn, formatDate } from "@/lib/utils";
import { isAdminOrCoordinator } from "@/lib/permissions";
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

const ALL_ROLES: UserRole[] = ["admin", "design_coordinator", "designer", "deo"];

export function TeamView() {
  const { profile: myProfile } = useAuth();
  // Both admin AND design_coordinator can do team CRUD per product spec.
  const canManage = isAdminOrCoordinator(myProfile?.role);

  const { profiles, isLoading: profilesLoading, error: profilesError, refetch: refetchProfiles } = useProfiles();
  const { codesByProfile, isLoading: codesLoading, refetch: refetchCodes } = useDesignerCodes();
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

  // Scorecard drawer
  const [scorecardDesignerId, setScorecardDesignerId] = useState<string | null>(null);

  // CRUD dialogs
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [editUser, setEditUser] = useState<Profile | null>(null);
  const [deleteUser, setDeleteUser] = useState<Profile | null>(null);
  const [removingUser, setRemovingUser] = useState(false);

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

  // ── Soft-delete user (deactivate) ──
  // We can't hard-delete auth.users from the client (no service-role key).
  // is_active=false hides the user from the team list + every useProfiles
  // consumer while preserving FKs on tasks/concepts/comments/etc.
  async function confirmDeleteUser() {
    if (!deleteUser) return;
    setRemovingUser(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        is_active: false,
        deactivated_at: new Date().toISOString(),
        deactivated_by: myProfile?.id ?? null,
      })
      .eq("id", deleteUser.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`${deleteUser.full_name} removed from team`);
      await refetchProfiles();
    }
    setRemovingUser(false);
    setDeleteUser(null);
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
        <div className="flex items-center gap-2">
          {canManage && (
            <Button
              size="sm"
              onClick={() => setAddUserOpen(true)}
              className="gap-1.5"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Add User
            </Button>
          )}
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
                <caption className="sr-only">Team members and roles</caption>
                <thead className="border-y border-border bg-secondary/60 text-left text-[11px] font-bold uppercase tracking-wider text-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Name</th>
                    <th className="px-4 py-2 font-medium">Role</th>
                    <th className="px-4 py-2 font-medium">Designer codes</th>
                    <th className="px-4 py-2 font-medium">Joined</th>
                    {canManage && <th className="px-4 py-2 font-medium text-right">Actions</th>}
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
                          {canManage && !isSelf ? (
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
                                {canManage && (
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
                            {canManage && (
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

                        {/* Actions — admin + coordinator. Edit / Delete are
                            disabled on the self row (use Profile page for own
                            edits; can't deactivate yourself). */}
                        {canManage && (
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              {p.role === "designer" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setScorecardDesignerId(p.id)}
                                  title="View scorecard"
                                  className="h-8 gap-1 px-2"
                                >
                                  <BarChart3 className="h-3.5 w-3.5" />
                                  <span className="hidden xl:inline">Scorecard</span>
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setEditUser(p)}
                                title="Edit name"
                                className="h-8 gap-1 px-2 text-muted-foreground hover:text-foreground"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                <span className="hidden xl:inline">Edit</span>
                              </Button>
                              {!isSelf && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setDeleteUser(p)}
                                  title="Remove from team"
                                  className="h-8 gap-1 px-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  <span className="hidden xl:inline">Remove</span>
                                </Button>
                              )}
                            </div>
                          </td>
                        )}
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

      {/* Designer scorecard drawer (admin / coordinator) */}
      <DesignerScorecardDrawer
        designerId={scorecardDesignerId}
        onClose={() => setScorecardDesignerId(null)}
      />

      {/* Add user dialog */}
      <AddUserDialog
        open={addUserOpen}
        onOpenChange={setAddUserOpen}
        onCreated={() => {
          void refetchProfiles();
        }}
      />

      {/* Edit user dialog (full_name) */}
      <EditUserDialog
        user={editUser}
        onOpenChange={(o) => !o && setEditUser(null)}
        onSaved={() => {
          setEditUser(null);
          void refetchProfiles();
        }}
      />

      {/* Soft-delete user confirmation */}
      <ConfirmDialog
        open={!!deleteUser}
        title="Remove this user from the team?"
        description={
          deleteUser
            ? `${deleteUser.full_name} will be deactivated and hidden from the team list. Their past tasks and concepts stay intact. You can re-enable them later by clearing is_active in the database.`
            : ""
        }
        variant="danger"
        confirmLabel={removingUser ? "Removing…" : "Remove"}
        onConfirm={() => void confirmDeleteUser()}
        onCancel={() => setDeleteUser(null)}
      />
    </div>
  );
}

// ============================================================================
// AddUserDialog — admin / coordinator creates a new team member
// ============================================================================
//
// Uses supabase.auth.signUp from the client (no service-role key in the
// browser). The DB trigger `handle_new_user` auto-creates the profile row
// with role='designer'; a follow-up UPDATE flips it to the chosen role +
// fills in full_name.
//
// If Supabase project has email-confirmation enabled the new user will need
// to confirm before signing in — surface that in the success toast so the
// admin knows the credentials work but the user hasn't activated yet.

function AddUserDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("designer");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFullName("");
    setEmail("");
    setPassword("");
    setRole("designer");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const name = fullName.trim();
    const mail = email.trim().toLowerCase();
    if (!name) return setError("Full name is required");
    if (!mail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail))
      return setError("Valid email is required");
    if (password.length < 8)
      return setError("Password must be at least 8 characters");

    setSubmitting(true);
    try {
      // 1) Create the auth user. The handle_new_user trigger inserts a
      //    profile row with role='designer' + full_name from metadata.
      const { data, error: signUpErr } = await supabase.auth.signUp({
        email: mail,
        password,
        options: {
          data: { full_name: name },
        },
      });
      if (signUpErr) {
        setError(signUpErr.message);
        return;
      }
      const newUserId = data.user?.id;
      if (!newUserId) {
        setError("Couldn't create user — no id returned");
        return;
      }

      // 2) Overwrite the trigger's defaults with the chosen role + name.
      //    RLS allows admin/coordinator to update any profile.
      const { error: updErr } = await supabase
        .from("profiles")
        .update({ role, full_name: name })
        .eq("id", newUserId);
      if (updErr) {
        setError(`User created but couldn't set role: ${updErr.message}`);
        return;
      }

      toast.success(
        `${name} added as ${ROLE_LABELS[role]}. They can sign in with the email + password you set.`
      );
      reset();
      onOpenChange(false);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add team member</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 px-6 py-4">
          <div>
            <Label htmlFor="new-user-name">Full name</Label>
            <Input
              id="new-user-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Priya Sharma"
              disabled={submitting}
            />
          </div>
          <div>
            <Label htmlFor="new-user-email">Email</Label>
            <Input
              id="new-user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@linkdprints.com"
              disabled={submitting}
            />
          </div>
          <div>
            <Label htmlFor="new-user-password">Temporary password</Label>
            <Input
              id="new-user-password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 characters"
              disabled={submitting}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Share this with the user; they can change it from their profile after signing in.
            </p>
          </div>
          <div>
            <Label htmlFor="new-user-role">Role</Label>
            <select
              id="new-user-role"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              disabled={submitting}
              className="block h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {ALL_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
              {error}
            </p>
          )}
        </form>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <LoadingButton
            type="button"
            onClick={(e) => void handleSubmit(e as unknown as React.FormEvent)}
            loading={submitting}
            loadingText="Creating…"
          >
            Create user
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// EditUserDialog — rename a team member
// ============================================================================
//
// Just full_name for now. Role changes go through the existing inline
// dropdown so the confirmation prompt fires. Avatar changes belong on the
// user's own Profile page — admins shouldn't be uploading photos of other
// people.

function EditUserDialog({
  user,
  onOpenChange,
  onSaved,
}: {
  user: Profile | null;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the field whenever a new user is selected.
  useStateSync(() => setName(user?.full_name ?? ""), [user?.id]);

  async function handleSave() {
    if (!user) return;
    const next = name.trim();
    if (!next) {
      setError("Name can't be empty");
      return;
    }
    if (next === user.full_name) {
      onOpenChange(false);
      return;
    }
    setError(null);
    setSaving(true);
    const { error: updErr } = await supabase
      .from("profiles")
      .update({ full_name: next })
      .eq("id", user.id);
    setSaving(false);
    if (updErr) {
      setError(updErr.message);
      return;
    }
    toast.success("Name updated");
    onSaved();
  }

  return (
    <Dialog open={!!user} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit team member</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 px-6 py-4">
          <div>
            <Label htmlFor="edit-user-name">Full name</Label>
            <Input
              id="edit-user-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              autoFocus
            />
          </div>
          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
              {error}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">
            Role changes happen via the inline dropdown in the table. Avatar updates live on the user's own Profile page.
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <LoadingButton
            type="button"
            onClick={() => void handleSave()}
            loading={saving}
            loadingText="Saving…"
          >
            Save
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Tiny helper — runs `fn` whenever the dep array changes. Saves writing
// `useEffect(() => fn(), deps)` with a no-return-value lambda.
function useStateSync(fn: () => void, deps: React.DependencyList) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(fn, deps);
}
