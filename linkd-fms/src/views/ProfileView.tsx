import { useRef, useState } from "react";
import { Camera, Loader2, Lock, Save } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
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
import { formatDate } from "@/lib/utils";

export function ProfileView() {
  const { user, profile, refreshProfile } = useAuth();
  const { codesByProfile } = useDesignerCodes();
  const myCodes = profile ? (codesByProfile.get(profile.id) ?? []) : [];

  // ── Edit profile state ──
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Password change state ──
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

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
    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }

    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Password updated");
      setNewPassword("");
      setConfirmPassword("");
      setShowPassword(false);
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
            onClick={() => setShowPassword(!showPassword)}
            className="flex items-center gap-2 text-sm font-medium text-foreground"
          >
            <Lock className="h-4 w-4" />
            Change Password
          </button>

          {showPassword && (
            <div className="mt-4 space-y-3 animate-fade-in">
              <div>
                <Label htmlFor="new-password" className="text-xs">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="confirm-password" className="text-xs">Confirm Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                  className="mt-1"
                />
              </div>
              <Button
                onClick={() => void handlePasswordChange()}
                disabled={changingPassword}
                className="gap-1.5"
              >
                {changingPassword ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
                Update Password
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
