import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, Check, Eye, EyeOff, Lock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Input, Label, LoadingButton } from "@/components/ui";
import { ROUTES, roleHomePath } from "@/lib/routes";
import { cn } from "@/lib/utils";

const SUCCESS_FLASH_MS = 300;

export function LoginView() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isLoading, profile, needsOnboarding, signIn } =
    useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successFlash, setSuccessFlash] = useState(false);

  const explicitFrom = (location.state as { from?: { pathname: string } } | null)
    ?.from?.pathname;

  useEffect(() => {
    if (isLoading || !isAuthenticated || successFlash) return;
    if (needsOnboarding) {
      navigate(ROUTES.onboarding, { replace: true });
      return;
    }
    if (profile) {
      const target = explicitFrom ?? roleHomePath(profile.role);
      navigate(target, { replace: true });
    }
  }, [isLoading, isAuthenticated, needsOnboarding, profile, navigate, explicitFrom, successFlash]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    const { error } = await signIn(email.trim(), password);

    if (error) {
      setErrorMsg(humaniseAuthError(error));
      setSubmitting(false);
      setPassword("");
      return;
    }

    setSubmitting(false);
    setSuccessFlash(true);
    setTimeout(() => setSuccessFlash(false), SUCCESS_FLASH_MS);
  }

  const aboutToRedirect = !isLoading && isAuthenticated && !successFlash;
  if (isLoading || aboutToRedirect) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex h-12 w-12 animate-pulse items-center justify-center rounded-xl bg-primary">
          <span className="text-2xl font-bold text-white">L</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* ═══════════════ LEFT — BRAND ═══════════════ */}
      <aside className="relative hidden w-[45%] flex-col items-center justify-center overflow-hidden bg-sidebar lg:flex">
        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgb(var(--primary)) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--primary)) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        {/* Gradient accent */}
        <div
          className="absolute bottom-0 left-0 right-0 h-1/2"
          style={{
            background:
              "linear-gradient(to top, rgb(var(--primary) / 0.08), transparent)",
          }}
        />

        {/* Brand content */}
        <div className="relative z-10 flex flex-col items-center px-12 text-center">
          <div className="mb-8 w-48 overflow-hidden rounded-2xl bg-white p-4 shadow-2xl shadow-black/20">
            <img
              src="/logo.png"
              alt="LinkD"
              className="block h-auto w-full"
              draggable={false}
            />
          </div>

          <h1 className="text-2xl font-bold uppercase tracking-[0.2em] text-white">
            Design Flow System
          </h1>
          <p className="mt-2 max-w-[260px] text-sm leading-relaxed text-white/40">
            Streamline your textile design workflow from brief to production.
          </p>

          {/* Stats hint */}
          <div className="mt-10 flex gap-6">
            {[
              { n: "3", label: "Systems" },
              { n: "12", label: "Users" },
              { n: "∞", label: "Designs" },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-2xl font-bold text-white">{s.n}</p>
                <p className="text-[10px] uppercase tracking-wider text-white/30">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </div>

        <p className="absolute bottom-6 text-[10px] tracking-wider text-white/15">
          LinkD Prints © {new Date().getFullYear()}
        </p>
      </aside>

      {/* ═══════════════ RIGHT — FORM ═══════════════ */}
      <section className="flex flex-1 flex-col bg-background">
        {/* Mobile header */}
        <div className="flex items-center gap-3 border-b border-border px-6 py-4 lg:hidden">
          <div className="w-8 overflow-hidden rounded-lg bg-white shadow">
            <img src="/logo.png" alt="LinkD" className="block h-auto w-full" draggable={false} />
          </div>
          <span className="text-sm font-bold uppercase tracking-[0.12em] text-foreground">
            Design Flow System
          </span>
        </div>

        {/* Centered form */}
        <div className="flex flex-1 items-center justify-center px-6 py-12">
          <div className="w-full max-w-[380px]">
            {/* Lock icon */}
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Lock className="h-6 w-6 text-primary" />
            </div>

            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Sign in
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter your credentials to access the dashboard.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
              {/* Email */}
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-medium">
                  Email address
                </Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  disabled={submitting || successFlash}
                  aria-invalid={!!errorMsg}
                  className={cn(
                    "h-11 rounded-lg transition-all",
                    "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20",
                    errorMsg && "border-destructive/60"
                  )}
                />
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-sm font-medium">
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    disabled={submitting || successFlash}
                    aria-invalid={!!errorMsg}
                    className={cn(
                      "h-11 rounded-lg pr-10 transition-all",
                      "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20",
                      errorMsg && "border-destructive/60"
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    disabled={submitting || successFlash}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Error */}
              {errorMsg && (
                <div
                  key={errorMsg}
                  role="alert"
                  className="animate-fade-in flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 p-3"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <p className="text-sm leading-relaxed text-destructive">{errorMsg}</p>
                </div>
              )}

              {/* Submit */}
              <LoadingButton
                type="submit"
                size="lg"
                loading={submitting}
                loadingText="Signing in…"
                disabled={!email.trim() || !password || successFlash}
                className={cn(
                  "w-full h-11 rounded-lg font-medium transition-all",
                  "hover:shadow-md hover:shadow-primary/20 active:scale-[0.98]"
                )}
              >
                {successFlash ? (
                  <Check className="h-5 w-5 text-white" strokeWidth={3} />
                ) : (
                  "Sign In"
                )}
              </LoadingButton>
            </form>

            <p className="mt-8 text-center text-xs text-muted-foreground">
              Need help? Contact your administrator.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function humaniseAuthError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("invalid login") || lower.includes("invalid credentials") || lower.includes("invalid email or password"))
    return "Invalid email or password. Please try again.";
  if (lower.includes("email not confirmed"))
    return "Your email hasn't been verified yet. Ask an admin to confirm it.";
  if (lower.includes("network") || lower.includes("fetch") || lower.includes("failed to fetch") || lower.includes("offline"))
    return "Unable to connect. Please check your internet and try again.";
  if (lower.includes("rate") || lower.includes("too many"))
    return "Too many attempts. Please wait a minute before trying again.";
  return raw;
}
