import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertCircle, Check, Eye, EyeOff, Lock, Mail, ArrowLeft, ArrowRight,
  Layers, Zap, Shield,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { Input, LoadingButton, toast } from "@/components/ui";
import { ROUTES, roleHomePath } from "@/lib/routes";
import { cn } from "@/lib/utils";

const SUCCESS_FLASH_MS = 300;

const stagger = (i: number): React.CSSProperties => ({
  opacity: 0,
  animation: `loginReveal 800ms cubic-bezier(0.22,1,0.36,1) ${150 + i * 100}ms forwards`,
});

// ─── Subtle Nebula (right panel only) ───────────────────────────────────────
function NebulaCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let t = 0;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = canvas!.offsetWidth * dpr;
      canvas!.height = canvas!.offsetHeight * dpr;
      ctx!.scale(dpr, dpr);
    }

    function draw() {
      const w = canvas!.offsetWidth;
      const h = canvas!.offsetHeight;
      t += 0.001;

      ctx!.fillStyle = "#0C0B16";
      ctx!.fillRect(0, 0, w, h);

      const clouds = [
        { x: w * (0.3 + Math.sin(t * 0.5) * 0.08), y: h * (0.25 + Math.cos(t * 0.35) * 0.06), r: Math.min(w, h) * 0.7, c: [124, 92, 255], a: 0.12 },
        { x: w * (0.7 + Math.cos(t * 0.4) * 0.06), y: h * (0.7 + Math.sin(t * 0.6) * 0.08), r: Math.min(w, h) * 0.5, c: [91, 59, 219], a: 0.1 },
        { x: w * (0.5 + Math.sin(t * 0.7) * 0.1), y: h * (0.5 + Math.cos(t * 0.3) * 0.12), r: Math.min(w, h) * 0.6, c: [160, 132, 255], a: 0.07 },
      ];

      for (const cloud of clouds) {
        const grad = ctx!.createRadialGradient(cloud.x, cloud.y, 0, cloud.x, cloud.y, cloud.r);
        grad.addColorStop(0, `rgba(${cloud.c[0]},${cloud.c[1]},${cloud.c[2]},${cloud.a})`);
        grad.addColorStop(0.6, `rgba(${cloud.c[0]},${cloud.c[1]},${cloud.c[2]},${cloud.a * 0.3})`);
        grad.addColorStop(1, `rgba(${cloud.c[0]},${cloud.c[1]},${cloud.c[2]},0)`);
        ctx!.fillStyle = grad;
        ctx!.fillRect(0, 0, w, h);
      }

      ctx!.fillStyle = "rgba(255,255,255,0.3)";
      for (let i = 0; i < 35; i++) {
        const sx = (i * 137.5 + t * 2) % w;
        const sy = (i * 97.3 + Math.sin(i + t) * 2) % h;
        const sr = 0.3 + Math.sin(t * 2 + i) * 0.25;
        ctx!.beginPath();
        ctx!.arc(sx, sy, Math.max(0.2, sr), 0, Math.PI * 2);
        ctx!.fill();
      }

      animId = requestAnimationFrame(draw);
    }

    resize();
    draw();
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize); };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}

// ─── Feature pills for left panel ───────────────────────────────────────────
const FEATURES = [
  { icon: Layers, label: "Concept to Delivery", desc: "End-to-end pipeline" },
  { icon: Zap, label: "Real-time Updates", desc: "Live task tracking" },
  { icon: Shield, label: "Role-based Access", desc: "Secure by design" },
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
  const [successFlash, setSuccessFlash] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);

  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [resetEmail, setResetEmail] = useState("");
  const [resetSending, setResetSending] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const explicitFrom = (location.state as { from?: { pathname: string } } | null)?.from?.pathname;

  useEffect(() => {
    if (isLoading || !isAuthenticated || successFlash) return;
    if (needsOnboarding) { navigate(ROUTES.onboarding, { replace: true }); return; }
    if (profile) { navigate(explicitFrom ?? roleHomePath(profile.role), { replace: true }); }
  }, [isLoading, isAuthenticated, needsOnboarding, profile, navigate, explicitFrom, successFlash]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    const { error } = await signIn(email.trim(), password);
    if (error) { setErrorMsg(humaniseAuthError(error)); setSubmitting(false); setPassword(""); return; }
    setSubmitting(false);
    setSuccessFlash(true);
    setTimeout(() => setSuccessFlash(false), SUCCESS_FLASH_MS);
  }, [email, password, signIn]);

  const handleResetSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) return;
    setErrorMsg(null);
    setResetSending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), { redirectTo: window.location.origin + "/reset-password" });
    setResetSending(false);
    if (error) { setErrorMsg(error.message); toast.error(error.message); return; }
    setResetSent(true);
    toast.success("Check your email for a reset link");
  }, [resetEmail]);

  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogleSignIn = useCallback(async () => {
    setErrorMsg(null);
    setGoogleLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
    if (error) { setGoogleLoading(false); setErrorMsg(error.message); toast.error(error.message); }
  }, []);

  function switchToForgot() { setMode("forgot"); setResetEmail(email); setErrorMsg(null); setResetSent(false); }
  function switchToLogin() { setMode("login"); setErrorMsg(null); setResetSent(false); }

  const aboutToRedirect = !isLoading && isAuthenticated && !successFlash;
  if (isLoading || aboutToRedirect) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: "#0C0B16" }}>
        <div className="login-logo-breathe flex h-14 w-14 items-center justify-center rounded-2xl"
          style={{ background: "linear-gradient(135deg, #A084FF, #7C5CFF, #5B3BDB)" }}>
          <span className="text-2xl font-bold text-white">L</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen overflow-hidden" style={{ background: "#0C0B16" }}>
      <style>{`
        @keyframes loginReveal {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes loginBreath {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.04); }
        }
        @keyframes loginBtnSweep {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes loginBtnGlow {
          0%, 100% { box-shadow: 0 4px 20px rgba(124,92,255,0.3); }
          50%      { box-shadow: 0 8px 40px rgba(124,92,255,0.5); }
        }
        @keyframes loginInputGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(124,92,255,0); }
          50%      { box-shadow: 0 0 20px rgba(124,92,255,0.1); }
        }
        .login-logo-breathe { animation: loginBreath 3s ease-in-out infinite; }
        .login-btn-primary {
          background-size: 200% 200%;
          animation: loginBtnSweep 3s ease infinite, loginBtnGlow 3s ease-in-out infinite;
        }
        .login-input-alive:focus-within { animation: loginInputGlow 2s ease-in-out infinite; }
      `}</style>

      {/* ═══════════ LEFT — BRAND PANEL ═══════════ */}

      {/* Mobile: top bar */}
      <div className="fixed left-0 right-0 top-0 z-30 flex h-14 items-center gap-3 px-5 lg:hidden"
        style={{ background: "rgba(12,11,22,0.9)", backdropFilter: "blur(16px)" }}>
        <img src="/logo.png" alt="LinkD" className="h-8 w-8" draggable={false} style={{ mixBlendMode: "screen" }} />
        <span className="text-[13px] font-semibold text-white/90">Design Flow System</span>
      </div>

      <aside className="relative hidden w-[52%] lg:flex lg:flex-col" style={{ background: "#F7F5FF" }}>
        {/* Dot grid texture */}
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{ backgroundImage: "radial-gradient(circle, rgba(124,92,255,0.15) 1px, transparent 1px)", backgroundSize: "20px 20px" }} />
        {/* Top-right subtle violet glow */}
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 h-[400px] w-[400px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(124,92,255,0.08), transparent 70%)" }} />

        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-10">
          {/* Logo */}
          <div style={{ animation: "loginReveal 700ms cubic-bezier(0.22,1,0.36,1) 100ms both" }}>
            <img src="/logo.png" alt="LinkD" className="h-24 w-24 object-contain" draggable={false}
              style={{ filter: "drop-shadow(0 4px 16px rgba(124,92,255,0.15))" }} />
          </div>

          {/* Title */}
          <h1 style={{
            fontFamily: "'Anton', sans-serif", fontSize: "44px", fontWeight: 400,
            letterSpacing: "0.03em", lineHeight: 1, textTransform: "uppercase",
            color: "#1A1830", marginTop: "6px",
            animation: "loginReveal 700ms cubic-bezier(0.22,1,0.36,1) 200ms both",
          }}>
            Design Flow
          </h1>

          {/* Tagline */}
          <p className="mt-3 max-w-[360px] text-center text-[14px] leading-relaxed"
            style={{ color: "#6E6A82", animation: "loginReveal 700ms cubic-bezier(0.22,1,0.36,1) 300ms both" }}>
            Streamline your textile print &amp; design workflow — from concept to delivery
          </p>

          {/* Brand stripe */}
          <div className="mt-6 h-[2px] w-16 rounded-full"
            style={{ background: "linear-gradient(90deg, #E63946, #F4C419, #2C6BD9)",
              animation: "loginReveal 700ms cubic-bezier(0.22,1,0.36,1) 400ms both" }} />

          {/* Feature pills */}
          <div className="mt-10 flex flex-col gap-3"
            style={{ animation: "loginReveal 700ms cubic-bezier(0.22,1,0.36,1) 500ms both" }}>
            {FEATURES.map((f) => (
              <div key={f.label} className="flex items-center gap-3 rounded-xl px-4 py-2.5"
                style={{ background: "rgba(124,92,255,0.06)", border: "1px solid rgba(124,92,255,0.08)" }}>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ background: "linear-gradient(135deg, #7C5CFF, #5B3BDB)" }}>
                  <f.icon className="h-4 w-4 text-white" strokeWidth={2.2} />
                </div>
                <div>
                  <p className="text-[13px] font-semibold" style={{ color: "#2D2A42" }}>{f.label}</p>
                  <p className="text-[11px]" style={{ color: "#8E8AA6" }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 flex items-center justify-between px-8 pb-5">
          <span className="text-[11px] font-medium tracking-wider" style={{ color: "rgba(26,24,48,0.25)" }}>LinkD Prints</span>
          <span className="text-[11px]" style={{ color: "rgba(26,24,48,0.25)" }}>&copy; 2026</span>
        </div>
      </aside>

      {/* ═══════════ RIGHT — DARK FORM PANEL ═══════════ */}
      <section className="relative flex flex-1 flex-col pt-14 pb-14 lg:pt-0 lg:pb-0" style={{ background: "#0C0B16" }}>
        <NebulaCanvas />

        <div className="relative z-10 flex flex-1 items-center justify-center px-0 sm:px-10">
          {/* Glass card container */}
          <div className="w-full max-w-[420px] rounded-2xl px-6 py-8 mx-4 sm:mx-0"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
              backdropFilter: "blur(24px)", boxShadow: "0 24px 80px rgba(0,0,0,0.4)" }}>

            {mode === "login" ? (
              <>
                {/* Header */}
                <p style={stagger(0)} className="text-[12px] font-bold uppercase tracking-[0.18em]"
                  ><span style={{ color: "#7C5CFF" }}>Design Flow</span></p>

                <h2 style={{ ...stagger(1), fontFamily: "Sora, system-ui, sans-serif" }}
                  className="mt-2 text-[28px] font-extrabold tracking-tight leading-tight text-white">
                  Welcome back
                </h2>
                <p style={stagger(2)} className="mt-1 text-[14px] leading-relaxed"
                  ><span style={{ color: "#9B97B5" }}>Enter your credentials to access your workspace</span></p>

                {/* Form */}
                <form onSubmit={handleSubmit} className="mt-7 space-y-5" noValidate>
                  {/* Email */}
                  <div style={stagger(3)} className="space-y-2">
                    <label htmlFor="login-email" className="text-[12px] font-bold uppercase tracking-[0.08em]"
                      style={{ color: "#B0ACC8" }}>Email</label>
                    <div className={cn(
                      "login-input-alive relative rounded-xl border transition-all duration-300",
                      focused === "email" ? "border-[#7C5CFF] ring-2 ring-[#7C5CFF]/20" : "border-white/8 hover:border-white/15"
                    )} style={{ background: "rgba(255,255,255,0.04)" }}>
                      <Mail className={cn(
                        "absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 transition-colors duration-300",
                        focused === "email" ? "text-[#A084FF]" : "text-white/25"
                      )} />
                      <Input id="login-email" type="email" autoComplete="email" required value={email}
                        onChange={(e) => setEmail(e.target.value)} onFocus={() => setFocused("email")} onBlur={() => setFocused(null)}
                        placeholder="you@company.com" disabled={submitting || successFlash}
                        aria-invalid={!!errorMsg} aria-describedby={errorMsg ? "login-error" : undefined}
                        className="h-12 border-0 bg-transparent pl-11 text-[14px] text-white placeholder:text-white/20 shadow-none ring-0 focus-visible:ring-0 focus-visible:ring-offset-0" />
                    </div>
                  </div>

                  {/* Password */}
                  <div style={stagger(4)} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label htmlFor="login-password" className="text-[12px] font-bold uppercase tracking-[0.08em]"
                        style={{ color: "#B0ACC8" }}>Password</label>
                      <button type="button" onClick={switchToForgot}
                        className="text-[12px] font-semibold transition-colors hover:text-[#A084FF]"
                        style={{ color: "#7C5CFF" }}>Forgot?</button>
                    </div>
                    <div className={cn(
                      "login-input-alive relative rounded-xl border transition-all duration-300",
                      focused === "password" ? "border-[#7C5CFF] ring-2 ring-[#7C5CFF]/20" : "border-white/8 hover:border-white/15"
                    )} style={{ background: "rgba(255,255,255,0.04)" }}>
                      <Lock className={cn(
                        "absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 transition-colors duration-300",
                        focused === "password" ? "text-[#A084FF]" : "text-white/25"
                      )} />
                      <Input id="login-password" type={showPassword ? "text" : "password"} autoComplete="current-password"
                        required value={password} onChange={(e) => setPassword(e.target.value)}
                        onFocus={() => setFocused("password")} onBlur={() => setFocused(null)}
                        placeholder="Enter your password" disabled={submitting || successFlash}
                        aria-invalid={!!errorMsg} aria-describedby={errorMsg ? "login-error" : undefined}
                        className="h-12 border-0 bg-transparent pl-11 pr-11 text-[14px] text-white placeholder:text-white/20 shadow-none ring-0 focus-visible:ring-0 focus-visible:ring-offset-0" />
                      <button type="button" onClick={() => setShowPassword((s) => !s)} disabled={submitting || successFlash}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-white/25 transition-colors hover:text-white/50 disabled:opacity-40">
                        {showPassword ? <EyeOff className="h-[17px] w-[17px]" /> : <Eye className="h-[17px] w-[17px]" />}
                      </button>
                    </div>
                  </div>

                  {/* Error */}
                  {errorMsg && (
                    <div id="login-error" key={errorMsg} role="alert" className="flex items-start gap-2.5 rounded-xl p-3.5"
                      style={{ animation: "loginReveal 400ms ease-out", background: "rgba(230,57,70,0.1)", border: "1px solid rgba(230,57,70,0.2)" }}>
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#E63946" }} />
                      <p className="text-[13px] leading-relaxed" style={{ color: "#FF9BA2" }}>{errorMsg}</p>
                    </div>
                  )}

                  {/* CTA */}
                  <div style={stagger(5)}>
                    <LoadingButton type="submit" size="lg" loading={submitting} loadingText="Signing in…"
                      disabled={!email.trim() || !password || successFlash}
                      className={cn(
                        "login-btn-primary w-full h-[50px] rounded-xl font-bold text-[15px] text-white border-0 transition-all duration-300",
                        "hover:-translate-y-0.5 active:translate-y-0",
                        "disabled:opacity-40 disabled:hover:translate-y-0 disabled:shadow-none"
                      )}
                      style={{ background: "linear-gradient(-45deg, #5B3BDB, #7C5CFF, #A084FF, #7C5CFF)" }}>
                      {successFlash ? (
                        <Check className="h-5 w-5 text-white" strokeWidth={3} />
                      ) : (
                        <span className="flex items-center gap-2">Sign in <ArrowRight className="h-4 w-4" /></span>
                      )}
                    </LoadingButton>
                  </div>
                </form>

                {/* Divider */}
                <div style={stagger(6)} className="mt-6 flex items-center gap-3">
                  <div className="h-px flex-1" style={{ background: "rgba(255,255,255,0.06)" }} />
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: "rgba(255,255,255,0.2)" }}>or</span>
                  <div className="h-px flex-1" style={{ background: "rgba(255,255,255,0.06)" }} />
                </div>

                {/* Google */}
                <button type="button" onClick={() => void handleGoogleSignIn()}
                  disabled={googleLoading || submitting || successFlash} style={stagger(7)}
                  className={cn(
                    "mt-4 flex w-full items-center justify-center gap-2.5 rounded-xl border px-4 py-3 text-[14px] font-semibold transition-all duration-200",
                    "border-white/8 text-white/60 hover:border-white/15 hover:bg-white/[0.03] active:scale-[0.99]",
                    "disabled:cursor-not-allowed disabled:opacity-50"
                  )} aria-label="Continue with Google">
                  <GoogleIcon className="h-[18px] w-[18px]" />
                  {googleLoading ? "Redirecting…" : "Google"}
                </button>

                {/* Footer */}
                <p style={stagger(8)} className="mt-6 text-center text-[13px]">
                  <span style={{ color: "#6E6A82" }}>No account?{" "}</span>
                  <a href="mailto:ai.linkdprints@gmail.com?subject=Design%20Flow%20System%20%E2%80%94%20Access%20request"
                    className="font-semibold transition-colors hover:text-[#A084FF]" style={{ color: "#7C5CFF" }}>
                    Request access
                  </a>
                </p>
              </>
            ) : (
              /* ── Forgot Password ── */
              <>
                <div style={stagger(0)}>
                  <button type="button" onClick={switchToLogin}
                    className="flex items-center gap-1.5 text-[13px] font-medium transition-colors hover:text-white/60"
                    style={{ color: "rgba(255,255,255,0.3)" }}>
                    <ArrowLeft className="h-3.5 w-3.5" /> Back
                  </button>
                </div>

                <p style={stagger(1)} className="mt-6 text-[12px] font-bold uppercase tracking-[0.18em]"
                  ><span style={{ color: "#7C5CFF" }}>Design Flow</span></p>

                <h2 style={{ ...stagger(2), fontFamily: "Sora, system-ui, sans-serif" }}
                  className="mt-2 text-[28px] font-extrabold tracking-tight text-white leading-tight">
                  Reset password
                </h2>
                <p style={stagger(3)} className="mt-1 text-[14px]">
                  <span style={{ color: "#9B97B5" }}>We'll send a reset link to your email</span>
                </p>

                {resetSent ? (
                  <div className="mt-8 space-y-5" style={{ animation: "loginReveal 600ms ease-out" }}>
                    <div className="flex flex-col items-center rounded-2xl p-8 text-center"
                      style={{ background: "rgba(52,211,153,0.06)", border: "1px solid rgba(52,211,153,0.15)" }}>
                      <div className="flex h-12 w-12 items-center justify-center rounded-full"
                        style={{ background: "rgba(52,211,153,0.12)" }}>
                        <Check className="h-5 w-5" style={{ color: "#34D399" }} />
                      </div>
                      <p className="mt-4 text-[14px] font-bold text-white">Check your email</p>
                      <p className="mt-1 text-[13px]" style={{ color: "#9B97B5" }}>
                        We sent a link to <span className="font-semibold text-white">{resetEmail}</span>
                      </p>
                    </div>
                    <button type="button" onClick={switchToLogin}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl border py-3 text-[13px] font-semibold transition-colors hover:bg-white/[0.03]"
                      style={{ borderColor: "rgba(255,255,255,0.08)", color: "#9B97B5" }}>
                      <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleResetSubmit} className="mt-8 space-y-5" noValidate>
                    <div style={stagger(4)} className="space-y-2">
                      <label htmlFor="reset-email" className="text-[12px] font-bold uppercase tracking-[0.08em]"
                        style={{ color: "#B0ACC8" }}>Email address</label>
                      <div className={cn(
                        "login-input-alive relative rounded-xl border transition-all duration-300",
                        focused === "reset-email" ? "border-[#7C5CFF] ring-2 ring-[#7C5CFF]/20" : "border-white/8 hover:border-white/15"
                      )} style={{ background: "rgba(255,255,255,0.04)" }}>
                        <Mail className={cn(
                          "absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 transition-colors duration-300",
                          focused === "reset-email" ? "text-[#A084FF]" : "text-white/25"
                        )} />
                        <Input id="reset-email" type="email" autoComplete="email" required value={resetEmail}
                          onChange={(e) => setResetEmail(e.target.value)} onFocus={() => setFocused("reset-email")}
                          onBlur={() => setFocused(null)} placeholder="you@company.com" disabled={resetSending}
                          className="h-12 border-0 bg-transparent pl-11 text-[14px] text-white placeholder:text-white/20 shadow-none ring-0 focus-visible:ring-0 focus-visible:ring-offset-0" />
                      </div>
                    </div>

                    {errorMsg && (
                      <div key={errorMsg} role="alert" className="flex items-start gap-2.5 rounded-xl p-3.5"
                        style={{ animation: "loginReveal 400ms ease-out", background: "rgba(230,57,70,0.1)", border: "1px solid rgba(230,57,70,0.2)" }}>
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#E63946" }} />
                        <p className="text-[13px] leading-relaxed" style={{ color: "#FF9BA2" }}>{errorMsg}</p>
                      </div>
                    )}

                    <div style={stagger(5)}>
                      <LoadingButton type="submit" size="lg" loading={resetSending} loadingText="Sending…"
                        disabled={!resetEmail.trim()}
                        className={cn(
                          "login-btn-primary w-full h-[50px] rounded-xl font-bold text-[15px] text-white border-0 transition-all duration-300",
                          "hover:-translate-y-0.5 active:translate-y-0",
                          "disabled:opacity-40 disabled:hover:translate-y-0"
                        )}
                        style={{ background: "linear-gradient(-45deg, #5B3BDB, #7C5CFF, #A084FF, #7C5CFF)" }}>
                        Send reset link
                      </LoadingButton>
                    </div>

                    <button type="button" onClick={switchToLogin} style={stagger(6)}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl py-3 text-[13px] font-medium transition-colors hover:text-white/60">
                      <span style={{ color: "rgba(255,255,255,0.3)" }} className="flex items-center gap-1.5">
                        <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
                      </span>
                    </button>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      </section>
    </div>
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
