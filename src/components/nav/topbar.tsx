import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS } from "@/lib/constants";
import type { Profile } from "@/types/database";

const ROLE_BADGE_CLASS: Record<Profile["role"], string> = {
  super_admin: "bg-red-100 text-red-700 hover:bg-red-100",
  admin: "bg-orange-100 text-orange-700 hover:bg-orange-100",
  designer: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  production: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
};

export function Topbar({ profile }: { profile: Profile }) {
  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-6">
      <div className="flex items-center gap-3 text-sm">
        <span className="font-medium text-foreground">{profile.full_name}</span>
        <Badge variant="secondary" className={ROLE_BADGE_CLASS[profile.role]}>
          {ROLE_LABELS[profile.role]}
        </Badge>
      </div>
      <form action="/auth/signout" method="post">
        <Button type="submit" variant="ghost" size="sm" className="gap-2">
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </form>
    </header>
  );
}
