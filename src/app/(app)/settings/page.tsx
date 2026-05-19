import { getCurrentProfile } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/constants";

export default async function SettingsPage() {
  const profile = await getCurrentProfile();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Your profile.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between border-b py-2">
            <span className="text-muted-foreground">Full name</span>
            <span>{profile?.full_name ?? "—"}</span>
          </div>
          <div className="flex justify-between border-b py-2">
            <span className="text-muted-foreground">Role</span>
            <span>{profile ? ROLE_LABELS[profile.role] : "—"}</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-muted-foreground">User ID</span>
            <span className="font-mono text-xs">{profile?.id ?? "—"}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
