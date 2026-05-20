import { useEffect } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { ROUTES, roleHomePath } from "@/lib/routes";

/**
 * Reached when the user is signed in but no profiles row matches their
 * auth.uid(). In normal operation this should never happen — the
 * `on_auth_user_created` trigger auto-creates the row at signup. It only
 * occurs when:
 *
 *   1. The user was created BEFORE migrations were applied (legacy seed data)
 *   2. The trigger failed for some reason
 *   3. The profile row was manually deleted
 *
 * Since RLS does not permit users to insert profile rows themselves, we ask
 * them to wait for an admin to provision one.
 */
export function OnboardingView() {
  const navigate = useNavigate();
  const {
    isLoading,
    isAuthenticated,
    needsOnboarding,
    profile,
    refreshProfile,
    signOut,
  } = useAuth();

  // Once a profile materialises (admin provisioned it), bounce to the
  // role-appropriate landing page.
  useEffect(() => {
    if (!isLoading && isAuthenticated && !needsOnboarding && profile) {
      navigate(roleHomePath(profile.role), { replace: true });
    }
  }, [isLoading, isAuthenticated, needsOnboarding, profile, navigate]);

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to={ROUTES.login} replace />;
  }

  async function handleRetry() {
    await refreshProfile();
    toast.info("Checked again");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Setting up your account</CardTitle>
          <CardDescription>
            Your sign-in worked, but your workspace profile hasn't been set up
            yet. An admin needs to add you to LinkD FMS before you can continue.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>What you can do:</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Reach out to your admin and ask them to add you.</li>
            <li>
              Once they confirm, click <span className="font-medium">Check again</span>{" "}
              below — no need to sign in again.
            </li>
          </ol>
        </CardContent>
        <CardFooter className="gap-2">
          <Button onClick={handleRetry}>Check again</Button>
          <Button variant="outline" onClick={signOut}>
            Sign out
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
