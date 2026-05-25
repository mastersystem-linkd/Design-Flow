import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, Check, Eye, EyeOff, Lock, Mail, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { Input, Label, LoadingButton, toast } from "@/components/ui";
import { ROUTES, roleHomePath } from "@/lib/routes";
import { cn } from "@/lib/utils";

const SUCCESS_FLASH_MS = 300;

// Staggered entrance helper — each element gets an increasing delay
const stagger = (index: number): React.CSSProperties => ({
  opacity: 0,
  animation: `loginFadeIn 400ms ease-out ${index * 80}ms forwards`,
});

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

  // Forgot password state
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [resetEmail, setResetEmail] = useState("");
  const [resetSending, setResetSending] = useState(false);
  const [resetSent, setResetSent] = useState(false);

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

  async function handleResetSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!resetEmail.trim()) return;
    setErrorMsg(null);
    setResetSending(true);

    const { error } = await supabase.auth.resetPasswordForEmail(
      resetEmail.trim(),
      { redirectTo: window.location.origin + "/reset-password" }
    );

    setResetSending(false);

    if (error) {
      setErrorMsg(error.message);
      toast.error(error.message);
      return;
    }

    setResetSent(true);
    toast.success("Check your email for a reset link");
  }

  function switchToForgot() {
    setMode("forgot");
    setResetEmail(email);
    setErrorMsg(null);
    setResetSent(false);
  }

  function switchToLogin() {
    setMode("login");
    setErrorMsg(null);
    setResetSent(false);
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
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* ── Stagger animation keyframe ── */}
      <style>{`
        @keyframes loginFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes floatOrb {
          0%, 100% { transform: translate(0, 0); }
          33%      { transform: translate(30px, -20px); }
          66%      { transform: translate(-15px, 15px); }
        }
      `}</style>

      {/* ═══════════════ LEFT — BRAND ═══════════════ */}

      {/* Mobile top bar */}
      <div className="flex h-20 items-center gap-3 bg-sidebar px-6 lg:hidden">
        <div className="w-9 overflow-hidden rounded-lg bg-white p-1 shadow">
          <img src="/logo.png" alt="LinkD" className="block h-auto w-full" draggable={false} />
        </div>
        <span className="text-sm font-bold uppercase tracking-[0.15em] text-white">
          LinkD
        </span>
      </div>

      {/* Desktop panel */}
      <aside className="relative hidden w-[45%] flex-col items-center justify-center overflow-hidden bg-sidebar lg:flex">
        {/* Layer 1: base is bg-sidebar */}

        {/* Layer 2: radial glow */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.12) 0%, transparent 60%)",
          }}
        />

        {/* Layer 3: dot grid */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />

        {/* Layer 4: bottom gradient */}
        <div
          className="absolute bottom-0 left-0 right-0 h-1/2"
          style={{
            background:
              "linear-gradient(to top, rgb(var(--primary) / 0.1), transparent)",
          }}
        />

        {/* Floating orbs */}
        <div
          className="absolute left-[10%] top-[15%] h-[280px] w-[280px] rounded-full bg-white/[0.05]"
          style={{ animation: "floatOrb 18s ease-in-out infinite" }}
        />
        <div
          className="absolute bottom-[20%] right-[8%] h-[200px] w-[200px] rounded-full bg-white/[0.06]"
          style={{ animation: "floatOrb 22s ease-in-out infinite reverse" }}
        />
        <div
          className="absolute right-[25%] top-[55%] h-[340px] w-[340px] rounded-full bg-white/[0.04]"
          style={{ animation: "floatOrb 15s ease-in-out infinite 3s" }}
        />

        {/* Brand content — simplified per the latest brand direction:
             transparent logo on the dark left panel, single app-name
             line, no marketing stats. */}
        <div className="relative z-10 flex flex-col items-center px-12 text-center">
          {/* LinkD wordmark — transparent PNG so no white card needed. */}
          <img
            src="/logo.png"
            alt="LinkD"
            className="mb-6 block h-auto w-48 drop-shadow-2xl"
            draggable={false}
          />

          {/* Separator */}
          <div className="mb-5 h-[2px] w-12 rounded-full bg-white/30" />

          {/* Single app-name heading — replaces the prior "LinkD" + tagline. */}
          <h1 className="text-3xl font-bold uppercase tracking-[0.15em] text-white">
            Design Flow System
          </h1>
        </div>

        <p className="absolute bottom-8 text-xs tracking-wider text-white/25">
          Design Flow System
        </p>
      </aside>

      {/* ═══════════════ RIGHT — FORM ═══════════════ */}
      <section className="flex flex-1 flex-col bg-background">
        <div className="flex flex-1 items-center justify-center px-6 py-12">
          <div className="w-full max-w-[380px]">
            {mode === "login" ? (
              /* ── Login form ── */
              <>
                <div style={stagger(0)} className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <Lock className="h-6 w-6 text-primary" />
                </div>

                <h2 style={stagger(1)} className="text-2xl font-semibold tracking-tight text-foreground">
                  Sign in
                </h2>
                <p style={stagger(1)} className="mt-1 text-sm text-muted-foreground">
                  Enter your credentials to access the dashboard.
                </p>

                <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
                  <div style={stagger(2)} className="space-y-1.5">
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
                      aria-describedby={errorMsg ? "login-error" : undefined}
                      className={cn(
                        "h-11 rounded-lg bg-background transition-all duration-200",
                        "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20",
                        errorMsg && "border-destructive/60"
                      )}
                    />
                  </div>

                  <div style={stagger(3)} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password" className="text-sm font-medium">
                        Password
                      </Label>
                      <button
                        type="button"
                        onClick={switchToForgot}
                        className="text-xs text-primary hover:underline"
                      >
                        Forgot password?
                      </button>
                    </div>
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
                        aria-describedby={errorMsg ? "login-error" : undefined}
                        className={cn(
                          "h-11 rounded-lg bg-background pr-10 transition-all duration-200",
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

                  {errorMsg && (
                    <div
                      id="login-error"
                      key={errorMsg}
                      role="alert"
                      className="animate-fade-in flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 p-3"
                    >
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      <p className="text-sm leading-relaxed text-destructive">{errorMsg}</p>
                    </div>
                  )}

                  <div style={stagger(4)}>
                    <LoadingButton
                      type="submit"
                      size="lg"
                      loading={submitting}
                      loadingText="Signing in…"
                      disabled={!email.trim() || !password || successFlash}
                      className={cn(
                        "w-full h-11 rounded-lg font-medium shadow-sm shadow-primary/20 transition-all",
                        "hover:shadow-md hover:shadow-primary/25 active:scale-[0.98]"
                      )}
                    >
                      {successFlash ? (
                        <Check className="h-5 w-5 text-white" strokeWidth={3} />
                      ) : (
                        "Sign In"
                      )}
                    </LoadingButton>
                  </div>
                </form>

                <p style={stagger(5)} className="mt-8 text-center text-xs text-muted-foreground">
                  Need help?{" "}
                  <span className="text-primary hover:underline cursor-pointer">
                    Contact your administrator
                  </span>
                </p>
              </>
            ) : (
              /* ── Forgot password form ── */
              <>
                <div style={stagger(0)} className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <Mail className="h-6 w-6 text-primary" />
                </div>

                <h2 style={stagger(1)} className="text-2xl font-semibold tracking-tight text-foreground">
                  Reset your password
                </h2>
                <p style={stagger(1)} className="mt-1 text-sm text-muted-foreground">
                  Enter your email and we'll send you a reset link.
                </p>

                {resetSent ? (
                  <div className="mt-6 space-y-4 animate-fade-in">
                    <div className="flex flex-col items-center rounded-xl border border-success/30 bg-success/5 p-6 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
                        <Mail className="h-6 w-6 text-success" />
                      </div>
                      <h3 className="mt-3 text-sm font-semibold text-foreground">
                        Reset link sent!
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Check your inbox at{" "}
                        <span className="font-medium text-foreground">
                          {resetEmail}
                        </span>
                        . The link expires in 1 hour.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={switchToLogin}
                      className="flex w-full items-center justify-center gap-1.5 text-sm text-primary hover:underline"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      Back to sign in
                    </button>
                  </div>
                ) : (
                  <form
                    onSubmit={handleResetSubmit}
                    className="mt-6 space-y-4"
                    noValidate
                  >
                    <div style={stagger(2)} className="space-y-1.5">
                      <Label htmlFor="reset-email" className="text-sm font-medium">
                        Email address
                      </Label>
                      <Input
                        id="reset-email"
                        type="email"
                        autoComplete="email"
                        required
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        placeholder="you@company.com"
                        disabled={resetSending}
                        className={cn(
                          "h-11 rounded-lg bg-background transition-all duration-200",
                          "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20",
                          errorMsg && "border-destructive/60"
                        )}
                      />
                    </div>

                    {errorMsg && (
                      <div
                        key={errorMsg}
                        role="alert"
                        className="animate-fade-in flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 p-3"
                      >
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                        <p className="text-sm leading-relaxed text-destructive">
                          {errorMsg}
                        </p>
                      </div>
                    )}

                    <div style={stagger(3)}>
                      <LoadingButton
                        type="submit"
                        size="lg"
                        loading={resetSending}
                        loadingText="Sending…"
                        disabled={!resetEmail.trim()}
                        className={cn(
                          "w-full h-11 rounded-lg font-medium shadow-sm shadow-primary/20 transition-all",
                          "hover:shadow-md hover:shadow-primary/25 active:scale-[0.98]"
                        )}
                      >
                        Send reset link
                      </LoadingButton>
                    </div>

                    <button
                      type="button"
                      onClick={switchToLogin}
                      style={stagger(4)}
                      className="flex w-full items-center justify-center gap-1.5 text-sm text-primary hover:underline"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      Back to sign in
                    </button>
                  </form>
                )}

                <p style={stagger(5)} className="mt-8 text-center text-xs text-muted-foreground">
                  Need help?{" "}
                  <span className="text-primary hover:underline cursor-pointer">
                    Contact your administrator
                  </span>
                </p>
              </>
            )}
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
