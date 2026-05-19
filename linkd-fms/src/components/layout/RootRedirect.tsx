import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AppShellSkeleton } from "@/components/ui/AppShellSkeleton";
import { ROUTES, roleHomePath } from "@/lib/routes";

/**
 * Lands the user on their role-appropriate home page. Used for the bare "/"
 * route so the URL doesn't reveal an arbitrary default.
 */
export function RootRedirect() {
  const { isLoading, isAuthenticated, profile } = useAuth();

  if (isLoading) return <AppShellSkeleton />;
  if (!isAuthenticated) return <Navigate to={ROUTES.login} replace />;
  if (!profile) return <Navigate to={ROUTES.onboarding} replace />;
  return <Navigate to={roleHomePath(profile.role)} replace />;
}
