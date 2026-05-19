import { useNavigate } from "react-router-dom";
import { Compass, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { roleHomePath, ROUTES } from "@/lib/routes";

/**
 * Catch-all 404. Rendered INSIDE the app shell when an authed user lands on
 * an unknown URL (so they keep their sidebar and don't feel kicked out).
 */
export function NotFoundView() {
  const navigate = useNavigate();
  const { profile, isAuthenticated } = useAuth();
  const target = profile
    ? roleHomePath(profile.role)
    : isAuthenticated
      ? ROUTES.dashboard
      : ROUTES.login;

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-secondary/60">
          <Compass className="h-6 w-6 text-foreground" strokeWidth={2} />
        </div>

        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          404
        </p>
        <h1 className="mt-1 font-sans text-3xl tracking-tight text-foreground">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          It might have been moved, renamed, or the link was mistyped.
        </p>

        <Button
          onClick={() => navigate(target, { replace: true })}
          className="mt-6 gap-2"
        >
          Go home
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
