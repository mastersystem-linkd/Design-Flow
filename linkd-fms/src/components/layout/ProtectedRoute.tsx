import { Suspense, type ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { TShirtLoader } from "@/components/ui";
import { AccessRestrictedView } from "@/views/AccessRestrictedView";
import { ROUTES } from "@/lib/routes";
import type { UserRole } from "@/types/database";

type Props = {
  /** If set, only users with one of these roles may enter. Wrong-role users
   *  see the inline AccessRestrictedView instead of being redirected. */
  allowedRoles?: UserRole[];
  /** Optional explicit children. If omitted, renders <Outlet/>. */
  children?: ReactNode;
};

/**
 * Route guard for authed sections of the app. Behavior:
 *
 *   1. While auth is resolving       →  AppShellSkeleton (looks like the app
 *                                       is loading, not a generic spinner).
 *   2. If not signed in              →  Navigate to /login (state.from for
 *                                       post-login redirect).
 *   3. If profile is missing         →  Navigate to /onboarding.
 *   4. If role not in allowedRoles   →  AppLayout + AccessRestrictedView
 *                                       (preserves sidebar + nav, the URL
 *                                       stays as the attempted route).
 *   5. Otherwise                     →  AppLayout + children/Outlet.
 */
export function ProtectedRoute({ allowedRoles, children }: Props) {
  const { isLoading, isAuthenticated, needsOnboarding, profile } = useAuth();
  const location = useLocation();

  // 1 — loading the app shell while auth resolves
  if (isLoading) {
    return <TShirtLoader open text="Loading Design Flow…" />;
  }

  // 2 — not signed in
  if (!isAuthenticated) {
    return <Navigate to={ROUTES.login} state={{ from: location }} replace />;
  }

  // 3 — signed in but no profile row yet
  if (needsOnboarding) {
    return <Navigate to={ROUTES.onboarding} replace />;
  }

  // Belt + suspenders — shouldn't reach here without a profile.
  if (!profile) {
    return <TShirtLoader open text="Loading Design Flow…" />;
  }

  // 4 — role mismatch (inline, not a redirect)
  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return (
      <AppLayout profile={profile}>
        <AccessRestrictedView allowedRoles={allowedRoles} />
      </AppLayout>
    );
  }

  // 5 — go. The Suspense catches lazy-loaded route chunks (see App.tsx) so the
  // sidebar + top nav stay rendered while the page's code streams in.
  return (
    <AppLayout profile={profile}>
      <Suspense fallback={<RouteFallback />}>{children ?? <Outlet />}</Suspense>
    </AppLayout>
  );
}

/** Lightweight in-shell fallback while a lazy route chunk loads. */
function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
    </div>
  );
}
