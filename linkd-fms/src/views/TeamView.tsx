import { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import {
  RefreshCw,
  Plus,
  X,
  BarChart3,
  UserPlus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  MoreVertical,
} from "lucide-react";
import { DesignerScorecardDrawer } from "@/components/analytics/DesignerScorecardDrawer";
import { useAuth } from "@/hooks/useAuth";
import { useProfiles } from "@/hooks/useProfiles";
import { useDesignerCodes } from "@/hooks/useDesignerCodes";
import { supabase } from "@/lib/supabase";
import { callAdminApi } from "@/lib/adminApi";
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
import { TABLE_HEAD, TABLE_TH } from "@/lib/tableStyles";
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

/** Format the structured error returned by callAdminApi for display. */
function formatAdminApiError(
  err: { message: string; status?: number },
  fallback: string
): string {
  const base = err.message || fallback;
  return err.status ? `${base} (HTTP ${err.status})` : base;
}

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

  // Email map (user_id → email) — auth.users isn't in profiles, so we fetch
  // via the admin-update-user edge function in list_emails mode. Only admins
  // and coordinators see emails in the table; everyone else gets a dash.
  const [emailsById, setEmailsById] = useState<Record<string, string>>({});
  const [emailsError, setEmailsError] = useState<string | null>(null);

  useEffect(() => {
    if (!canManage) return;
    let cancelled = false;
    setEmailsError(null);
    void callAdminApi<{ emails?: Record<string, string> }>("admin-update-user", {
      list_emails: true,
    }).then(({ data, error: apiErr }) => {
      if (cancelled) return;
      if (apiErr) {
        // Expected 404 in `npm run dev` (Vite doesn't serve /api/* routes).
        // Downgrade to info so the DevTools console isn't full of red errors
        // when developing locally. The UI shows a friendly dev banner anyway.
        if (import.meta.env.DEV && apiErr.status === 404) {
          console.info("[TeamView] /api unavailable in dev — email column shows dashes.");
        } else {
          console.error("[TeamView] list_emails failed:", apiErr);
        }
        setEmailsError(formatAdminApiError(apiErr, "Couldn't load emails"));
        return;
      }
      if (data?.emails) setEmailsById(data.emails);
    });
    return () => { cancelled = true; };
  }, [canManage, profiles.length]);

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
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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

      {canManage && emailsError && (
        import.meta.env.DEV ? (
          // Dev: `npm run dev` only runs Vite, not Vercel serverless functions,
          // so /api/* is naturally 404. Show a low-key note instead of a scary
          // warning. Use `npx vercel dev` if you need to exercise the API locally.
          <div className="rounded-md border border-border bg-card/50 px-3 py-1.5 text-[11px] text-muted-foreground">
            Email column needs the Vercel API route, which isn't served by{" "}
            <code className="font-mono">npm run dev</code>. It works on the deployed site.
            Run <code className="font-mono">npx vercel dev</code> to test locally.
          </div>
        ) : (
          <div className="rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-warning-foreground">
            <span className="font-medium">Email column unavailable:</span> {emailsError}
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              The <code className="font-mono">/api/admin-update-user</code> route needs to be live on Vercel with the{" "}
              <code className="font-mono">SUPABASE_URL</code>, <code className="font-mono">SUPABASE_ANON_KEY</code>, and{" "}
              <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> env vars set. Check the Vercel function logs for runtime errors.
            </p>
          </div>
        )
      )}

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
                <thead className={TABLE_HEAD}>
                  <tr className="[&>th]:border-r [&>th]:border-border/30 [&>th:last-child]:border-r-0">
                    <th className={TABLE_TH}>Name</th>
                    {canManage && <th className={TABLE_TH}>Email</th>}
                    <th className={TABLE_TH}>Role</th>
                    <th className={TABLE_TH}>Designer codes</th>
                    <th className={TABLE_TH}>Joined</th>
                    {canManage && <th className={cn(TABLE_TH, "text-right")}>Actions</th>}
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

                        {/* Email — only admins/coordinators see this column */}
                        {canManage && (
                          <td className="px-4 py-3 text-muted-foreground">
                            <span className="truncate" title={emailsById[p.id] ?? ""}>
                              {emailsById[p.id] ?? <span className="text-xs italic">—</span>}
                            </span>
                          </td>
                        )}

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

                        {/* Actions — admin + coordinator. All actions are
                            consolidated into a ⋮ menu so the row stays narrow.
                            Remove is hidden on the self row (you can't
                            deactivate yourself). */}
                        {canManage && (
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end">
                              <TeamRowActionsMenu
                                showScorecard={p.role === "designer"}
                                showRemove={!isSelf}
                                onScorecard={() => setScorecardDesignerId(p.id)}
                                onEdit={() => setEditUser(p)}
                                onRemove={() => setDeleteUser(p)}
                              />
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

      {/* Edit user dialog — name, role, designer codes */}
      <EditUserDialog
        user={editUser}
        onOpenChange={(o) => !o && setEditUser(null)}
        onSaved={() => {
          setEditUser(null);
          void refetchProfiles();
          void refetchCodes();
        }}
        codesByProfile={codesByProfile}
        viewerId={myProfile?.id}
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
// Calls the `admin-create-user` Edge Function which uses the service-role
// key to:
//   1) Verify the caller is admin/coordinator
//   2) Create the auth user with `email_confirm: true` so they can sign
//      in immediately (no verification email round-trip)
//   3) Upsert the profile row with the chosen role + name
//
// Critically, this does NOT use `supabase.auth.signUp`, which would have
// swapped the admin's session for the new user's. The admin stays logged
// in throughout.

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
      const { data, error: invokeErr } = await supabase.functions.invoke<{
        id: string;
        email: string;
        full_name: string;
        role: UserRole;
        error?: string;
      }>("admin-create-user", {
        body: {
          email: mail,
          password,
          full_name: name,
          role,
        },
      });

      // Edge Function returns 4xx/5xx with `{ error: string }` in the body.
      // `supabase.functions.invoke` surfaces both transport errors (invokeErr)
      // and server-side errors (data.error), so handle both.
      if (invokeErr) {
        // Pull the JSON body if present — Supabase wraps non-2xx responses.
        const fnErr = invokeErr as unknown as {
          message?: string;
          context?: { body?: string };
        };
        let serverMsg: string | null = null;
        if (fnErr.context?.body) {
          try {
            serverMsg = (JSON.parse(fnErr.context.body) as { error?: string })
              .error ?? null;
          } catch {
            /* not JSON */
          }
        }
        setError(serverMsg ?? fnErr.message ?? "Failed to create user");
        return;
      }
      if (data?.error) {
        setError(data.error);
        return;
      }
      if (!data?.id) {
        setError("Couldn't create user — no id returned");
        return;
      }

      toast.success(
        `${name} added as ${ROLE_LABELS[role]}. They can sign in immediately with the email + password you set.`
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
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
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
// EditUserDialog — edit every field an admin/coordinator can change
// ============================================================================
//
// Editable fields:
//   • Full name, Role, Status (is_active)  → profiles table (direct)
//   • Email, Password                       → auth.users (via admin-update-user)
//   • Date of joining                       → profiles.created_at (via edge fn)
//   • Designer codes                        → designer_codes (direct add/remove)
//
// Email + password + created_at require service-role access, so they go
// through the `admin-update-user` Edge Function. Everything else still uses
// direct RLS-protected updates. The dialog fetches the user's current email
// (which isn't on the profiles row) the first time it opens.

function EditUserDialog({
  user,
  onOpenChange,
  onSaved,
  codesByProfile,
  viewerId,
}: {
  user: Profile | null;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
  codesByProfile: Map<string, { id: string; code: string; status: string; joining_date: string }[]>;
  viewerId: string | undefined;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>("designer");
  const [email, setEmail] = useState("");
  const [originalEmail, setOriginalEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [joiningDate, setJoiningDate] = useState("");
  const [originalJoiningDate, setOriginalJoiningDate] = useState("");
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newCode, setNewCode] = useState("");
  const [addingCode, setAddingCode] = useState(false);
  const [deletingCodeId, setDeletingCodeId] = useState<string | null>(null);
  const isSelf = user?.id === viewerId;

  useStateSync(() => {
    setName(user?.full_name ?? "");
    setRole((user?.role ?? "designer") as UserRole);
    setIsActive(user?.is_active !== false);
    setEmail("");
    setOriginalEmail("");
    setPassword("");
    setShowPassword(false);
    setJoiningDate(user?.created_at ? user.created_at.slice(0, 10) : "");
    setOriginalJoiningDate(user?.created_at ? user.created_at.slice(0, 10) : "");
    setNewCode("");
    setError(null);

    // Pull the auth email from the API route. profiles doesn't store email
    // — auth.users does — and the SPA can't query auth.users directly.
    if (user?.id) {
      setLoadingDetails(true);
      void callAdminApi<{ email?: string; created_at?: string | null }>(
        "admin-update-user",
        { user_id: user.id, fetch: true }
      )
        .then(({ data, error: apiErr }) => {
          if (apiErr) {
            if (import.meta.env.DEV && apiErr.status === 404) {
              console.info("[EditUserDialog] /api unavailable in dev — current email/joining date won't pre-fill.");
            } else {
              console.error("[EditUserDialog] fetch failed:", apiErr);
            }
            setError(formatAdminApiError(apiErr, "Couldn't load user details"));
          } else if (data) {
            setEmail(data.email ?? "");
            setOriginalEmail(data.email ?? "");
            if (data.created_at) {
              const d = data.created_at.slice(0, 10);
              setJoiningDate(d);
              setOriginalJoiningDate(d);
            }
          }
        })
        .finally(() => setLoadingDetails(false));
    }
  }, [user?.id]);

  const userCodes = user ? (codesByProfile.get(user.id) ?? []) : [];

  async function handleSave() {
    if (!user) return;
    const next = name.trim();
    if (!next) { setError("Name can't be empty"); return; }
    const mail = email.trim().toLowerCase();
    if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      setError("Valid email is required"); return;
    }
    if (password && password.length < 8) {
      setError("Password must be at least 8 characters"); return;
    }
    setError(null);
    setSaving(true);

    // Build the edge-function payload — only include fields that changed.
    const payload: Record<string, unknown> = { user_id: user.id };
    const changedMsgs: string[] = [];

    if (next !== user.full_name) {
      payload.full_name = next;
      changedMsgs.push("name");
    }
    if (role !== user.role && !isSelf) {
      payload.role = role;
      changedMsgs.push("role");
    }
    if (mail && mail !== originalEmail.toLowerCase()) {
      payload.email = mail;
      changedMsgs.push("email");
    }
    if (password) {
      payload.password = password;
      changedMsgs.push("password");
    }
    if (!isSelf && isActive !== (user.is_active !== false)) {
      payload.is_active = isActive;
      changedMsgs.push(isActive ? "reactivated" : "deactivated");
    }
    if (joiningDate && joiningDate !== originalJoiningDate) {
      payload.created_at = new Date(joiningDate).toISOString();
      changedMsgs.push("joining date");
    }

    if (Object.keys(payload).length === 1) {
      // only user_id — nothing to update
      setSaving(false);
      onOpenChange(false);
      return;
    }

    const { error: apiErr } = await callAdminApi<{ ok?: boolean }>(
      "admin-update-user",
      payload
    );

    setSaving(false);

    if (apiErr) {
      console.error("[EditUserDialog] save failed:", apiErr);
      setError(formatAdminApiError(apiErr, "Failed to update user"));
      return;
    }

    if (payload.role) {
      void sendNotification(
        user.id,
        "Role Updated",
        `Your role has been changed to ${ROLE_LABELS[role]}.`,
        "info"
      );
    }
    if (payload.password) {
      void sendNotification(
        user.id,
        "Password Updated",
        "An admin updated your account password. Please use the new password on your next sign-in.",
        "warning"
      );
    }
    if (payload.email) {
      void sendNotification(
        user.id,
        "Email Updated",
        `Your sign-in email was changed to ${mail}.`,
        "info"
      );
    }

    toast.success(`Updated ${changedMsgs.join(", ")}`);
    onSaved();
  }

  async function handleAddCode() {
    if (!user) return;
    const code = newCode.trim().toUpperCase();
    if (!code) return;
    setAddingCode(true);
    const { error: cErr } = await supabase
      .from("designer_codes")
      .insert({ profile_id: user.id, code, joining_date: new Date().toISOString().slice(0, 10), status: "active" });
    if (cErr) {
      toast.error(cErr.code === "23505" ? `Code "${code}" already exists` : cErr.message);
    } else {
      toast.success(`Code "${code}" added`);
      setNewCode("");
      onSaved();
    }
    setAddingCode(false);
  }

  async function handleDeleteCode(codeId: string, codeLabel: string) {
    setDeletingCodeId(codeId);
    const { error: dErr } = await supabase.from("designer_codes").delete().eq("id", codeId);
    if (dErr) toast.error(dErr.message);
    else { toast.success(`Code "${codeLabel}" removed`); onSaved(); }
    setDeletingCodeId(null);
  }

  return (
    <Dialog open={!!user} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit team member</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-4">
          {/* Full name */}
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

          {/* Email */}
          <div>
            <Label htmlFor="edit-user-email">Email</Label>
            <Input
              id="edit-user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={saving || loadingDetails}
              placeholder={loadingDetails ? "Loading…" : "user@linkdprints.com"}
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Sign-in email. Changing this immediately updates the user's login.
            </p>
          </div>

          {/* Password */}
          <div>
            <Label htmlFor="edit-user-password">Password</Label>
            <div className="relative">
              <Input
                id="edit-user-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={saving}
                placeholder="Set a new password to reset"
                className="pr-10"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
                title={showPassword ? "Hide" : "Show"}
              >
                {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Existing passwords are hashed and can't be displayed. Type a new value (min 8 chars) to overwrite, then share with the user out-of-band.
            </p>
          </div>

          {/* Role */}
          <div>
            <Label htmlFor="edit-user-role">Role</Label>
            {isSelf ? (
              <p className="mt-1 text-sm text-muted-foreground">{ROLE_LABELS[role]} <span className="text-[10px]">(can't change own role)</span></p>
            ) : (
              <select
                id="edit-user-role"
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                disabled={saving}
                className="block h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            )}
          </div>

          {/* Date of joining */}
          <div>
            <Label htmlFor="edit-user-joined">Date of joining</Label>
            <Input
              id="edit-user-joined"
              type="date"
              value={joiningDate}
              onChange={(e) => setJoiningDate(e.target.value)}
              disabled={saving || loadingDetails}
              max={new Date().toISOString().slice(0, 10)}
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Used in the "Joined" column and scorecard tenure calculations.
            </p>
          </div>

          {/* Designer codes */}
          <div>
            <Label>Designer codes</Label>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {userCodes.length === 0 && (
                <span className="text-xs italic text-muted-foreground">No codes assigned</span>
              )}
              {userCodes.map((c) => (
                <span
                  key={c.id}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold",
                    c.status === "active"
                      ? "border-primary/60 bg-primary/15 text-foreground"
                      : "border-border bg-secondary text-muted-foreground line-through"
                  )}
                >
                  {c.code}
                  <button
                    type="button"
                    disabled={deletingCodeId === c.id}
                    onClick={() => void handleDeleteCode(c.id, c.code)}
                    className="ml-0.5 rounded p-0.5 text-muted-foreground hover:text-destructive disabled:opacity-50"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <div className="flex items-center gap-1">
                <Input
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                  placeholder="Add code"
                  className="h-7 w-20 px-1.5 font-mono text-xs"
                  maxLength={5}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleAddCode(); } }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={() => void handleAddCode()}
                  disabled={addingCode || !newCode.trim()}
                >
                  <Plus className="mr-0.5 h-3 w-3" />
                  Add
                </Button>
              </div>
            </div>
          </div>

          {/* Status */}
          {!isSelf && user && (
            <div>
              <Label>Status</Label>
              <div className="mt-1.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsActive(true)}
                  disabled={saving}
                  className={cn(
                    "rounded-md border px-3 py-1 text-xs font-medium transition-colors",
                    isActive
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:text-foreground"
                  )}
                >
                  Active
                </button>
                <button
                  type="button"
                  onClick={() => setIsActive(false)}
                  disabled={saving}
                  className={cn(
                    "rounded-md border px-3 py-1 text-xs font-medium transition-colors",
                    !isActive
                      ? "border-destructive bg-destructive/10 text-destructive"
                      : "border-border bg-card text-muted-foreground hover:text-foreground"
                  )}
                >
                  Deactivated
                </button>
              </div>
              {!isActive && (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Deactivated users are hidden from team lists but past tasks/concepts stay intact.
                </p>
              )}
            </div>
          )}

          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
              {error}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground">
            Avatar updates live on the user's own Profile page.
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

// ============================================================================
// TeamRowActionsMenu — ⋮ menu used in each row of the Team table.
// Portal-rendered so the open menu can escape table overflow clipping. Same
// pattern as ConceptsView's ConceptRowActionsMenu.
// ============================================================================
function TeamRowActionsMenu({
  showScorecard,
  showRemove,
  onScorecard,
  onEdit,
  onRemove,
}: {
  showScorecard: boolean;
  showRemove: boolean;
  onScorecard: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function handleToggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (open) { setOpen(false); return; }
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const itemCount = 1 + (showScorecard ? 1 : 0) + (showRemove ? 1 : 0);
      const menuHeight = itemCount * 38 + 16;
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < menuHeight + 8;
      setPos({
        top: openUp ? rect.top - menuHeight - 4 : rect.bottom + 4,
        left: rect.right - 170,
      });
    }
    setOpen(true);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground transition-colors hover:border-[var(--border-hover)] hover:bg-secondary hover:text-foreground"
        aria-label="User actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>

      {open && ReactDOM.createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ position: "fixed", top: pos.top, left: pos.left }}
          className="z-[9999] min-w-[170px] overflow-hidden rounded-lg border border-border bg-card py-1 shadow-dropdown animate-fade-in"
        >
          {showScorecard && (
            <button
              type="button"
              role="menuitem"
              onClick={(e) => { e.stopPropagation(); setOpen(false); onScorecard(); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary"
            >
              <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
              View scorecard
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={(e) => { e.stopPropagation(); setOpen(false); onEdit(); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-secondary"
          >
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
            Edit
          </button>
          {showRemove && (
            <>
              <div className="my-1 h-px bg-border" aria-hidden />
              <button
                type="button"
                role="menuitem"
                onClick={(e) => { e.stopPropagation(); setOpen(false); onRemove(); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </button>
            </>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
