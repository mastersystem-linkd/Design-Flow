import { useRef, useState } from "react";
import { Camera, Eye, EyeOff, Loader2, Lock, Monitor, Moon, Save, Sun, User } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { useDesignerCodes } from "@/hooks/useDesignerCodes";
import {
  Card,
  CardContent,
  Badge,
  Button,
  Input,
  Label,
  Avatar,
  AvatarFallback,
  AvatarImage,
  getInitials,
  toast,
} from "@/components/ui";
import { ROLE_LABELS } from "@/lib/constants";
import { cn, formatDate } from "@/lib/utils";

const THEME_OPTIONS = [
  {
    value: "light" as const,
    label: "Light",
    description: "Bright & clean",
    icon: Sun,
  },
  {
    value: "dark" as const,
    label: "Dark",
    description: "Easy on eyes",
    icon: Moon,
  },
  {
    value: "system" as const,
    label: "System",
    description: "Match your OS",
    icon: Monitor,
  },
];

export function ProfileView() {
  const { user, profile, refreshProfile } = useAuth();
  const { theme, setTheme } = useTheme();
  const { codesByProfile } = useDesignerCodes();
  const myCodes = profile ? (codesByProfile.get(profile.id) ?? []) : [];

  // ── Edit profile state ──
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Password change state ──
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const pwTooShort = newPassword.length > 0 && newPassword.length < 8;
  const pwMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canChangePassword = newPassword.length >= 8 && newPassword === confirmPassword && !changingPassword;

  async function handleSaveProfile() {
    if (!profile) return;
    const name = fullName.trim();
    if (!name) { toast.error("Name is required"); return; }

    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: name })
      .eq("id", profile.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Profile updated");
      await refreshProfile();
      setEditing(false);
    }
    setSaving(false);
  }

  async function handleAvatarUpload(file: File) {
    if (!user || !profile) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Avatar must be under 5 MB");
      return;
    }

    setUploadingAvatar(true);
    const ext = file.name.split(".").pop() ?? "png";
    const path = `${user.id}/avatar.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("avatars")
      .upload(path, file, { contentType: file.type, upsert: true });

    if (uploadErr) {
      toast.error(uploadErr.message);
      setUploadingAvatar(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);

    const { error: updateErr } = await supabase
      .from("profiles")
      .update({ avatar_url: urlData.publicUrl })
      .eq("id", profile.id);

    if (updateErr) {
      toast.error(updateErr.message);
    } else {
      toast.success("Avatar updated");
      await refreshProfile();
    }
    setUploadingAvatar(false);
  }

  async function handlePasswordChange() {
    if (!canChangePassword) return;

    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Password updated");
      setNewPassword("");
      setConfirmPassword("");
      setShowPasswordSection(false);
      setShowNewPw(false);
      setShowConfirmPw(false);
    }
    setChangingPassword(false);
  }

  if (!profile || !user) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* ── Profile card ── */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
            {/* Avatar */}
            <div className="relative">
              <Avatar className="h-20 w-20 ring-2 ring-border">
                {profile.avatar_url ? <AvatarImage src={profile.avatar_url} /> : null}
                <AvatarFallback className="text-xl">{getInitials(profile.full_name)}</AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-primary text-white transition-colors hover:bg-primary/80"
                title="Change avatar"
              >
                {uploadingAvatar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleAvatarUpload(f);
                  if (e.target) e.target.value = "";
                }}
              />
            </div>

            {/* Info */}
            <div className="flex-1 text-center sm:text-left">
              {editing ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="h-9"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") void handleSaveProfile(); }}
                  />
                  <Button size="sm" onClick={() => void handleSaveProfile()} disabled={saving} className="gap-1.5">
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setEditing(false); setFullName(profile.full_name); }}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold text-foreground">{profile.full_name}</h2>
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="text-xs text-primary hover:underline"
                  >
                    Edit
                  </button>
                </div>
              )}
              <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="secondary">{ROLE_LABELS[profile.role]}</Badge>
                <span className="text-xs text-muted-foreground">
                  Joined {formatDate(profile.created_at)}
                </span>
              </div>

              {/* Designer codes */}
              {myCodes.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {myCodes.map((c) => (
                    <span
                      key={c.id}
                      className="rounded-md border border-primary/60 bg-primary/15 px-2 py-0.5 font-mono text-[11px] font-semibold text-foreground"
                    >
                      {c.code}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Password change ── */}
      <Card>
        <CardContent className="p-6">
          <button
            type="button"
            onClick={() => setShowPasswordSection(!showPasswordSection)}
            className="flex w-full items-center justify-between text-sm font-medium text-foreground"
          >
            <span className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-muted-foreground" />
              Change Password
            </span>
            <span className="text-xs text-muted-foreground">
              {showPasswordSection ? "Hide" : "Show"}
            </span>
          </button>

          {showPasswordSection && (
            <div className="mt-4 space-y-3 animate-fade-in">
              {/* New password */}
              <div className="space-y-1.5">
                <Label htmlFor="new-password" className="text-xs">
                  New Password
                </Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showNewPw ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 8 characters"
                    className="h-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPw((s) => !s)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground"
                    aria-label={showNewPw ? "Hide password" : "Show password"}
                  >
                    {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {pwTooShort && (
                  <p className="text-[11px] text-warning">
                    {8 - newPassword.length} more character{8 - newPassword.length > 1 ? "s" : ""} needed
                  </p>
                )}
                {newPassword.length >= 8 && (
                  <p className="text-[11px] text-success">Password length OK</p>
                )}
              </div>

              {/* Confirm password */}
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password" className="text-xs">
                  Confirm Password
                </Label>
                <div className="relative">
                  <Input
                    id="confirm-password"
                    type={showConfirmPw ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    className="h-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPw((s) => !s)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground"
                    aria-label={showConfirmPw ? "Hide password" : "Show password"}
                  >
                    {showConfirmPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {pwMismatch && (
                  <p className="text-[11px] text-destructive">Passwords don't match</p>
                )}
              </div>

              <Button
                onClick={() => void handlePasswordChange()}
                disabled={!canChangePassword}
                className="gap-1.5"
              >
                {changingPassword ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
                Update Password
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Appearance ── */}
      <Card>
        <CardContent className="p-6">
          <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Sun className="h-4 w-4 text-muted-foreground" />
            Appearance
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Choose how the app looks for you.
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
            {THEME_OPTIONS.map((opt) => {
              const active = theme === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTheme(opt.value)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 transition-all sm:gap-2 sm:p-4",
                    active
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-border bg-card hover:border-muted-foreground/30"
                  )}
                >
                  <opt.icon
                    className={cn(
                      "h-5 w-5 sm:h-6 sm:w-6",
                      active ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                  <span
                    className={cn(
                      "text-[11px] font-medium sm:text-xs",
                      active ? "text-primary" : "text-foreground"
                    )}
                  >
                    {opt.label}
                  </span>
                  <span className="hidden text-[10px] text-muted-foreground sm:inline">
                    {opt.description}
                  </span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
