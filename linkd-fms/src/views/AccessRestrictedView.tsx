import { useNavigate } from "react-router-dom";
import { Lock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { roleHomePath } from "@/lib/routes";
import { ROLE_LABELS } from "@/lib/constants";
import type { UserRole } from "@/types/database";

const ROLE_PHRASE: Record<UserRole, string> = {
  admin: "admins",
  design_coordinator: "design coordinators",
  designer: "designers",
};

function rolesPhrase(roles: UserRole[]): string {
  const parts = roles.map((r) => ROLE_PHRASE[r] ?? ROLE_LABELS[r]);
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2) return parts.join(" and ");
  return `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`;
}

interface Props {
  allowedRoles: UserRole[];
}

/**
 * Friendly "you can't see this page" content. Renders INSIDE the app
 * layout (sidebar + topnav still visible), so it feels like a content
 * panel — not a hard 403.
 */
export function AccessRestrictedView({ allowedRoles }: Props) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const target = profile ? roleHomePath(profile.role) : "/";

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary/20">
          <Lock className="h-6 w-6 text-foreground" strokeWidth={2} />
        </div>

        <h1 className="font-sans text-3xl tracking-tight text-foreground">
          Access restricted
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don't have access to this page.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          This section is for{" "}
          <span className="font-medium text-foreground">
            {rolesPhrase(allowedRoles)}
          </span>{" "}
          users.
        </p>

        <Button
          onClick={() => navigate(target, { replace: true })}
          className="mt-6 gap-2"
        >
          Go to my dashboard
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
