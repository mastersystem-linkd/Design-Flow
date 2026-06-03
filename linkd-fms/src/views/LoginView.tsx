import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertCircle, Check, Eye, EyeOff, Lock, Mail, ArrowLeft, ArrowRight,
  Layers, Zap, Shield, Loader2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { Input, LoadingButton, toast } from "@/components/ui";
import { ROUTES, roleHomePath } from "@/lib/routes";
import { cn } from "@/lib/utils";

const SUCCESS_FLASH_MS = 300;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Staggered fade+rise for entrance. The global `prefers-reduced-motion` rule in
// index.css collapses these to ~0ms (ending in the visible `forwards` state), so
// reduced-motion users still see the content — just without movement.
const stagger = (i: number): React.CSSProperties => ({
  opacity: 0,
  animation: `loginReveal 700ms cubic-bezier(0.22,1,0.36,1) ${120 + i * 80}ms forwards`,
});

const FEATURES = [
  { icon: Layers, title: "Concept to Delivery", desc: "One pipeline from first sketch to shipped print." },
  { icon: Zap, title: "Real-time Updates", desc: "Live task tracking the whole team can see." },
  { icon: Shield, title: "Role-based Access", desc: "Secure by design — everyone sees what they should." },
] as const;

export function LoginView() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isLoading, profile, needsOnboarding, signIn } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [successFlash, setSuccessFlash] = useState(false);

  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [resetEmail, setResetEmail] = useState("");
  const [resetErr, setResetErr] = useState<string | null>(null);
  const [resetSending, setResetSending] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const explicitFrom = (location.state as { from?: { pathname: string } } | null)?.from?.pathname;

  useEffect(() => {
    if (isLoading || !isAuthenticated || successFlash) return;
    if (needsOnboarding) { navigate(ROUTES.onboarding, { replace: true }); return; }
    if (profile) { navigate(explicitFrom ?? roleHomePath(profile.role), { replace: true }); }
  }, [isLoading, isAuthenticated, needsOnboarding, profile, navigate, explicitFrom, successFlash]);

  function validate(): boolean {
    const e = !email.trim()
      ? "Email is required."
      : !EMAIL_RE.test(email.trim())
        ? "Enter a valid email address."
        : null;
    const p = !password ? "Password is required." : null;
    setEmailErr(e);
    setPwErr(p);
    return !e && !p;
  }

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!validate()) return;
    setSubmitting(true);
    const { error } = await signIn(email.trim(), password);
    if (error) { setErrorMsg(humaniseAuthError(error)); setSubmitting(false); setPassword(""); return; }
    setSubmitting(false);
    setSuccessFlash(true);
    setTimeout(() => setSuccessFlash(false), SUCCESS_FLASH_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, password, signIn]);

  const handleResetSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) { setResetErr("Email is required."); return; }
    if (!EMAIL_RE.test(resetEmail.trim())) { setResetErr("Enter a valid email address."); return; }
    setResetErr(null);
    setErrorMsg(null);
    setResetSending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), { redirectTo: window.location.origin + "/reset-password" });
    setResetSending(false);
    if (error) { setErrorMsg(error.message); toast.error(error.message); return; }
    setResetSent(true);
    toast.success("Check your email for a reset link");
  }, [resetEmail]);

  const handleGoogleSignIn = useCallback(async () => {
    setErrorMsg(null);
    setGoogleLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
    if (error) { setGoogleLoading(false); setErrorMsg(error.message); toast.error(error.message); }
  }, []);

  function switchToForgot() { setMode("forgot"); setResetEmail(email); setErrorMsg(null); setResetErr(null); setResetSent(false); }
  function switchToLogin() { setMode("login"); setErrorMsg(null); setResetSent(false); }

  // ── Pre-auth splash ──
  const aboutToRedirect = !isLoading && isAuthenticated && !successFlash;
  if (isLoading || aboutToRedirect) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#0A0912]">
        <div className="login-logo-breathe flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ background: "linear-gradient(135deg, #A084FF, #7C5CFF, #5B3BDB)" }}>
          <span className="text-2xl font-bold text-white">L</span>
        </div>
      </div>
    );
  }

  const busy = submitting || successFlash;

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-[#0A0912] text-white lg:flex-row">
      <LoginStyles />
      <Aurora />

      {/* ═══════════ LEFT — BRAND ═══════════ */}
      <aside className="relative z-10 flex flex-col justify-center px-6 pb-2 pt-10 sm:px-10 lg:w-[52%] lg:px-16 lg:py-12">
        <div className="mx-auto w-full max-w-[460px]">
          {/* Logo */}
          <div style={{ animation: "loginReveal 700ms cubic-bezier(0.22,1,0.36,1) 60ms both" }}
            className="flex items-center gap-3 lg:flex-col lg:items-start lg:gap-0">
            <img src="/logo.png" alt="LinkD" draggable={false}
              className="h-12 w-12 object-contain lg:h-20 lg:w-20"
              style={{ filter: "drop-shadow(0 4px 20px rgba(124,92,255,0.35))" }} />
            <h1 className="font-display text-2xl font-extrabold uppercase leading-none tracking-[0.04em] lg:mt-5 lg:text-[44px]">
              Design&nbsp;Flow
            </h1>
          </div>

          {/* Tagline */}
          <p style={{ animation: "loginReveal 700ms cubic-bezier(0.22,1,0.36,1) 160ms both" }}
            className="mt-3 max-w-[400px] text-[14px] leading-relaxed text-white/70 lg:mt-5 lg:text-[15px]">
            Streamline your textile print &amp; design workflow — from concept to delivery.
          </p>

          {/* Brand stripe */}
          <div className="mt-5 h-[3px] w-20 rounded-full"
            style={{
              background: "linear-gradient(90deg, #E63946, #F4C419, #2C6BD9)",
              animation: "loginReveal 700ms cubic-bezier(0.22,1,0.36,1) 240ms both",
            }} />

          {/* Feature cards — full-width, desktop only (mobile stays condensed) */}
          <div className="mt-9 hidden flex-col gap-3 lg:flex">
            {FEATURES.map((f, i) => (
              <div key={f.title}
                style={{ animation: `loginReveal 700ms cubic-bezier(0.22,1,0.36,1) ${320 + i * 90}ms both` }}
                className="group flex w-full items-center gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 transition-colors duration-200 hover:border-white/15 hover:bg-white/[0.05]">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-[0_6px_20px_-6px_rgba(124,92,255,0.6)]"
                  style={{ background: "linear-gradient(135deg, #8B6BFF, #5B3BDB)" }}>
                  <f.icon className="h-5 w-5 text-white" strokeWidth={2.2} />
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-white">{f.title}</p>
                  <p className="mt-0.5 text-[13px] leading-snug text-white/55">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Soft seam bridge between the halves (no hard line) */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-[52%] hidden w-px lg:block"
        style={{ background: "linear-gradient(to bottom, transparent, rgba(255,255,255,0.08), transparent)" }} />

      {/* ═══════════ RIGHT — FORM ═══════════ */}
      <section className="relative z-10 flex flex-1 items-center justify-center px-6 pb-16 pt-6 sm:px-10 lg:py-12">
        <div style={{ animation: "loginReveal 700ms cubic-bezier(0.22,1,0.36,1) 200ms both" }}
          className="w-full max-w-[420px] rounded-3xl border border-white/[0.08] bg-white/[0.035] p-6 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.7)] backdrop-blur-2xl sm:p-8">

          {mode === "login" ? (
            <>
              <h2 className="font-display text-[26px] font-extrabold leading-tight tracking-tight sm:text-[28px]">
                Welcome back
              </h2>
              <p className="mt-1.5 text-[14px] leading-relaxed text-white/60">
                Enter your credentials to access your workspace.
              </p>

              <form onSubmit={handleSubmit} className="mt-7 space-y-4" noValidate>
                {/* Email */}
                <Field label="Email" htmlFor="login-email" error={emailErr}>
                  <FieldShell icon={Mail} invalid={!!emailErr}>
                    <Input id="login-email" type="email" autoComplete="email" inputMode="email" required value={email}
                      onChange={(e) => { setEmail(e.target.value); if (emailErr) setEmailErr(null); }}
                      onBlur={() => email && setEmailErr(!EMAIL_RE.test(email.trim()) ? "Enter a valid email address." : null)}
                      placeholder="you@company.com" disabled={busy}
                      aria-invalid={!!emailErr} aria-describedby={emailErr ? "login-email-err" : undefined}
                      className={INPUT_CLS} />
                  </FieldShell>
                </Field>

                {/* Password */}
                <Field
                  label="Password" htmlFor="login-password" error={pwErr}
                  action={
                    <button type="button" onClick={switchToForgot}
                      className="rounded text-[12px] font-semibold text-[#A78BFF] outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-[#7C5CFF]">
                      Forgot?
                    </button>
                  }>
                  <FieldShell icon={Lock} invalid={!!pwErr}>
                    <Input id="login-password" type={showPassword ? "text" : "password"} autoComplete="current-password"
                      required value={password}
                      onChange={(e) => { setPassword(e.target.value); if (pwErr) setPwErr(null); }}
                      placeholder="Enter your password" disabled={busy}
                      aria-invalid={!!pwErr} aria-describedby={pwErr ? "login-password-err" : undefined}
                      className={cn(INPUT_CLS, "pr-11")} />
                    <button type="button" onClick={() => setShowPassword((s) => !s)} disabled={busy}
                      aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-white/40 outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-[#7C5CFF] disabled:opacity-40">
                      {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                    </button>
                  </FieldShell>
                </Field>

                {errorMsg && <ErrorBanner id="login-error" message={errorMsg} />}

                <LoadingButton type="submit" size="lg" loading={submitting} loadingText="Signing in…"
                  disabled={busy}
                  className={cn(
                    "login-btn-primary mt-1 h-[50px] w-full rounded-xl border-0 text-[15px] font-bold text-white transition-all duration-200",
                    "hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 active:brightness-95",
                    "outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0912]",
                    "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                  )}
                  style={{ background: "linear-gradient(-45deg, #5B3BDB, #7C5CFF, #A084FF, #7C5CFF)" }}>
                  {successFlash ? (
                    <Check className="h-5 w-5" strokeWidth={3} />
                  ) : (
                    <span className="flex items-center gap-2">Sign in <ArrowRight className="h-4 w-4" /></span>
                  )}
                </LoadingButton>
              </form>

              {/* Divider */}
              <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">or</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              {/* Google */}
              <button type="button" onClick={() => void handleGoogleSignIn()} disabled={googleLoading || busy}
                aria-label="Continue with Google"
                className={cn(
                  "flex w-full items-center justify-center gap-2.5 rounded-xl border border-white/12 bg-white/[0.02] px-4 py-3 text-[14px] font-semibold text-white/85 transition-all duration-200",
                  "hover:border-white/25 hover:bg-white/[0.06] active:scale-[0.99]",
                  "outline-none focus-visible:ring-2 focus-visible:ring-[#7C5CFF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0912]",
                  "disabled:cursor-not-allowed disabled:opacity-50"
                )}>
                {googleLoading ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <GoogleIcon className="h-[18px] w-[18px]" />}
                {googleLoading ? "Redirecting…" : "Continue with Google"}
              </button>

              <p className="mt-6 text-center text-[13px] text-white/55">
                No account?{" "}
                <a href="mailto:ai.linkdprints@gmail.com?subject=Design%20Flow%20System%20%E2%80%94%20Access%20request"
                  className="rounded font-semibold text-[#A78BFF] outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-[#7C5CFF]">
                  Request access
                </a>
              </p>
            </>
          ) : (
            /* ── Forgot password ── */
            <>
              <button type="button" onClick={switchToLogin}
                className="-ml-1 flex items-center gap-1.5 rounded px-1 py-0.5 text-[13px] font-medium text-white/55 outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-[#7C5CFF]">
                <ArrowLeft className="h-4 w-4" /> Back
              </button>

              <h2 className="mt-5 font-display text-[26px] font-extrabold leading-tight tracking-tight sm:text-[28px]">
                Reset password
              </h2>
              <p className="mt-1.5 text-[14px] text-white/60">We&apos;ll email you a secure reset link.</p>

              {resetSent ? (
                <div className="mt-7 space-y-5">
                  <div className="flex flex-col items-center rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-7 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-400/15">
                      <Check className="h-5 w-5 text-emerald-300" />
                    </div>
                    <p className="mt-4 text-[14px] font-bold">Check your email</p>
                    <p className="mt-1 text-[13px] text-white/60">
                      We sent a link to <span className="font-semibold text-white">{resetEmail}</span>
                    </p>
                  </div>
                  <button type="button" onClick={switchToLogin}
                    className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/12 py-3 text-[13px] font-semibold text-white/70 outline-none transition-colors hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-[#7C5CFF]">
                    <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
                  </button>
                </div>
              ) : (
                <form onSubmit={handleResetSubmit} className="mt-7 space-y-4" noValidate>
                  <Field label="Email address" htmlFor="reset-email" error={resetErr}>
                    <FieldShell icon={Mail} invalid={!!resetErr}>
                      <Input id="reset-email" type="email" autoComplete="email" inputMode="email" required value={resetEmail}
                        onChange={(e) => { setResetEmail(e.target.value); if (resetErr) setResetErr(null); }}
                        placeholder="you@company.com" disabled={resetSending}
                        aria-invalid={!!resetErr} aria-describedby={resetErr ? "reset-email-err" : undefined}
                        className={INPUT_CLS} />
                    </FieldShell>
                  </Field>

                  {errorMsg && <ErrorBanner message={errorMsg} />}

                  <LoadingButton type="submit" size="lg" loading={resetSending} loadingText="Sending…"
                    disabled={resetSending}
                    className={cn(
                      "login-btn-primary mt-1 h-[50px] w-full rounded-xl border-0 text-[15px] font-bold text-white transition-all duration-200",
                      "hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0",
                      "outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0912]",
                      "disabled:opacity-50 disabled:hover:translate-y-0"
                    )}
                    style={{ background: "linear-gradient(-45deg, #5B3BDB, #7C5CFF, #A084FF, #7C5CFF)" }}>
                    Send reset link
                  </LoadingButton>
                </form>
              )}
            </>
          )}
        </div>
      </section>

      {/* Footer — single centered line across the whole screen */}
      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-center justify-center gap-2 pb-4 text-[11px] tracking-wide text-white/35">
        <span className="pointer-events-auto font-medium">LinkD Prints</span>
        <span aria-hidden>·</span>
        <span>© 2026</span>
      </footer>
    </div>
  );
}

// ── Shared input shell + field wrapper ──────────────────────────────────────

const INPUT_CLS =
  "h-12 border-0 bg-transparent pl-11 text-[16px] text-white shadow-none outline-none ring-0 placeholder:text-white/30 focus-visible:ring-0 focus-visible:ring-offset-0";

function Field({
  label, htmlFor, error, action, children,
}: {
  label: string; htmlFor: string; error?: string | null; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label htmlFor={htmlFor} className="text-[12px] font-bold uppercase tracking-[0.08em] text-white/65">
          {label}
        </label>
        {action}
      </div>
      {children}
      {error && (
        <p id={`${htmlFor}-err`} role="alert" className="flex items-center gap-1 text-[12px] font-medium text-rose-300">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
        </p>
      )}
    </div>
  );
}

function FieldShell({
  icon: Icon, invalid, children,
}: {
  icon: React.ComponentType<{ className?: string }>; invalid?: boolean; children: React.ReactNode;
}) {
  return (
    <div className={cn(
      "relative rounded-xl border bg-white/[0.04] transition-all duration-200",
      "focus-within:border-[#7C5CFF] focus-within:ring-2 focus-within:ring-[#7C5CFF]/30",
      invalid ? "border-rose-400/50" : "border-white/10 hover:border-white/20"
    )}>
      <Icon className={cn(
        "pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 transition-colors",
        invalid ? "text-rose-300/80" : "text-white/45"
      )} />
      {children}
    </div>
  );
}

function ErrorBanner({ id, message }: { id?: string; message: string }) {
  return (
    <div id={id} key={message} role="alert"
      className="flex items-start gap-2.5 rounded-xl border border-rose-400/25 bg-rose-500/10 p-3.5"
      style={{ animation: "loginReveal 350ms ease-out" }}>
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
      <p className="text-[13px] leading-relaxed text-rose-200">{message}</p>
    </div>
  );
}

// ── Background: a quiet animated aurora + dot grid spanning the whole screen ──
function Aurora() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId = 0;
    let t = 0;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = canvas!.offsetWidth * dpr;
      canvas!.height = canvas!.offsetHeight * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw() {
      const w = canvas!.offsetWidth;
      const h = canvas!.offsetHeight;
      t += 0.0008;
      ctx!.clearRect(0, 0, w, h);
      const blobs = [
        { x: w * (0.28 + Math.sin(t * 0.5) * 0.06), y: h * (0.3 + Math.cos(t * 0.35) * 0.05), r: Math.max(w, h) * 0.5, c: [124, 92, 255], a: 0.16 },
        { x: w * (0.75 + Math.cos(t * 0.4) * 0.05), y: h * (0.7 + Math.sin(t * 0.6) * 0.06), r: Math.max(w, h) * 0.42, c: [91, 59, 219], a: 0.13 },
        { x: w * (0.55 + Math.sin(t * 0.7) * 0.08), y: h * (0.45 + Math.cos(t * 0.3) * 0.1), r: Math.max(w, h) * 0.4, c: [160, 132, 255], a: 0.08 },
      ];
      for (const b of blobs) {
        const g = ctx!.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        g.addColorStop(0, `rgba(${b.c[0]},${b.c[1]},${b.c[2]},${b.a})`);
        g.addColorStop(0.6, `rgba(${b.c[0]},${b.c[1]},${b.c[2]},${b.a * 0.3})`);
        g.addColorStop(1, `rgba(${b.c[0]},${b.c[1]},${b.c[2]},0)`);
        ctx!.fillStyle = g;
        ctx!.fillRect(0, 0, w, h);
      }
      animId = requestAnimationFrame(draw);
    }

    resize();
    draw();
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize); };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />
      {/* Fine dot grid for depth (static, quiet) */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
          maskImage: "radial-gradient(ellipse at center, black 40%, transparent 85%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 40%, transparent 85%)",
        }} />
    </>
  );
}

function LoginStyles() {
  return (
    <style>{`
      @keyframes loginReveal { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes loginBreath { 0%,100% { transform: scale(1); } 50% { transform: scale(1.04); } }
      @keyframes loginBtnSweep { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
      .login-logo-breathe { animation: loginBreath 3s ease-in-out infinite; }
      .login-btn-primary { background-size: 220% 220%; animation: loginBtnSweep 5s ease infinite; box-shadow: 0 10px 30px -8px rgba(124,92,255,0.6); }
      /* Keep autofilled inputs on-theme (Chrome forces a light pill otherwise) */
      input:-webkit-autofill, input:-webkit-autofill:hover, input:-webkit-autofill:focus {
        -webkit-text-fill-color: #fff;
        -webkit-box-shadow: 0 0 0 1000px rgba(255,255,255,0.02) inset;
        caret-color: #fff;
        transition: background-color 9999s ease-in-out 0s;
      }
      @media (prefers-reduced-motion: reduce) {
        .login-logo-breathe, .login-btn-primary { animation: none !important; }
      }
    `}</style>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853" />
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
    </svg>
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
