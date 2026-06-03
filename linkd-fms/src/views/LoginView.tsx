import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type * as THREENS from "three";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui";
import { ROUTES, roleHomePath } from "@/lib/routes";

const SUCCESS_FLASH_MS = 300;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginView() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isLoading, profile, needsOnboarding, signIn } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successFlash, setSuccessFlash] = useState(false);

  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [resetEmail, setResetEmail] = useState("");
  const [resetSending, setResetSending] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const explicitFrom = (location.state as { from?: { pathname: string } } | null)?.from?.pathname;

  // ── Redirect once authenticated ──
  useEffect(() => {
    if (isLoading || !isAuthenticated || successFlash) return;
    if (needsOnboarding) { navigate(ROUTES.onboarding, { replace: true }); return; }
    if (profile) navigate(explicitFrom ?? roleHomePath(profile.role), { replace: true });
  }, [isLoading, isAuthenticated, needsOnboarding, profile, navigate, explicitFrom, successFlash]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!email.trim() || !EMAIL_RE.test(email.trim())) { setErrorMsg("Enter a valid email address."); return; }
    if (!password) { setErrorMsg("Password is required."); return; }
    setSubmitting(true);
    const { error } = await signIn(email.trim(), password);
    if (error) { setErrorMsg(humaniseAuthError(error)); setSubmitting(false); setPassword(""); return; }
    setSubmitting(false);
    setSuccessFlash(true);
    setTimeout(() => setSuccessFlash(false), SUCCESS_FLASH_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, password, signIn]);

  const handleGoogleSignIn = useCallback(async () => {
    setErrorMsg(null);
    setGoogleLoading(true);
    const redirectTo = import.meta.env.PROD ? "https://linkd-fms.vercel.app" : window.location.origin;
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    if (error) { setGoogleLoading(false); setErrorMsg(error.message); toast.error(error.message); }
  }, []);

  const handleResetSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim() || !EMAIL_RE.test(resetEmail.trim())) { setErrorMsg("Enter a valid email address."); return; }
    setErrorMsg(null);
    setResetSending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), { redirectTo: window.location.origin + "/reset-password" });
    setResetSending(false);
    if (error) { setErrorMsg(error.message); toast.error(error.message); return; }
    setResetSent(true);
    toast.success("Check your email for a reset link");
  }, [resetEmail]);

  function switchToForgot(e: React.MouseEvent) { e.preventDefault(); setMode("forgot"); setResetEmail(email); setErrorMsg(null); setResetSent(false); }
  function switchToLogin() { setMode("login"); setErrorMsg(null); setResetSent(false); }

  const busy = submitting || successFlash;

  return (
    <div className="df-login">
      <LoginStyles />
      <WeaveCanvas />
      <div className="vignette" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      <main className="stage">
        <div className="shell">

          {/* ───────── BRAND ───────── */}
          <section className="brand">
            <p className="eyebrow reveal d1">
              <span className="stitch"><i /><i /><i /><i /></span>
              Textile Workflow OS
            </p>
            <p className="wordmark reveal d1">LINKD&nbsp;PRINTS</p>
            <h1 className="reveal d2">Design<br />Flow<span className="tint">.</span></h1>
            <div className="rule reveal d2" />
            <p className="lede reveal d3">
              Streamline your textile print &amp; design workflow — woven from
              first sketch to shipped fabric, in one continuous thread.
            </p>

            <div className="feats reveal d4">
              <Feature
                title="Concept to Delivery"
                desc="One pipeline from first sketch to shipped print."
                path={<><path d="M12 3 3 8l9 5 9-5-9-5Z" /><path d="m3 13 9 5 9-5" /><path d="m3 18 9 5 9-5" /></>}
              />
              <Feature
                title="Real-time Updates"
                desc="Live task tracking the whole team can see."
                path={<path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />}
              />
              <Feature
                title="Role-based Access"
                desc="Secure by design — everyone sees what they should."
                path={<path d="M12 3 4 6v6c0 5 3.5 7.5 8 9 4.5-1.5 8-4 8-9V6l-8-3Z" />}
              />
            </div>
          </section>

          {/* ───────── FORM ───────── */}
          <section className="card reveal d3" aria-label="Sign in">
            {mode === "login" ? (
              <>
                <h2>Welcome back</h2>
                <p className="sub">Enter your credentials to access your workspace.</p>

                <form onSubmit={handleSubmit} noValidate>
                  <div className="field">
                    <label htmlFor="login-email">Email</label>
                    <div className="input">
                      <span className="lead" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m3.5 7 8.5 6 8.5-6" /></svg>
                      </span>
                      <input id="login-email" name="email" type="email" autoComplete="email" inputMode="email"
                        value={email} onChange={(e) => { setEmail(e.target.value); if (errorMsg) setErrorMsg(null); }}
                        placeholder="you@studio.com" disabled={busy}
                        aria-invalid={!!errorMsg} aria-describedby={errorMsg ? "login-error" : undefined} />
                    </div>
                  </div>

                  <div className="field">
                    <div className="label-row">
                      <label htmlFor="login-password">Password</label>
                      <a href="#" onClick={switchToForgot}>Forgot?</a>
                    </div>
                    <div className="input">
                      <span className="lead" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></svg>
                      </span>
                      <input id="login-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password"
                        value={password} onChange={(e) => { setPassword(e.target.value); if (errorMsg) setErrorMsg(null); }}
                        placeholder="••••••••••" disabled={busy}
                        aria-invalid={!!errorMsg} aria-describedby={errorMsg ? "login-error" : undefined} />
                      <button type="button" className="toggle" onClick={() => setShowPassword((s) => !s)} disabled={busy}
                        aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}>
                        <EyeIcon open={!showPassword} />
                      </button>
                    </div>
                  </div>

                  {errorMsg && (
                    <p id="login-error" role="alert" className="err">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 8v5" /><path d="M12 16h.01" /></svg>
                      {errorMsg}
                    </p>
                  )}

                  <button type="submit" className={`btn btn-primary${busy ? " loading" : ""}`} disabled={busy}>
                    {busy ? (
                      <><span className="spin" aria-hidden /><span className="lbl">{successFlash ? "Welcome" : "Signing in"}</span></>
                    ) : (
                      <><span className="lbl">Sign in</span>
                        <svg className="arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg></>
                    )}
                  </button>

                  <div className="or">OR</div>

                  <button type="button" className="btn btn-ghost" onClick={() => void handleGoogleSignIn()} disabled={googleLoading || busy}>
                    {googleLoading ? <span className="spin spin-light" aria-hidden /> : <GoogleIcon />}
                    {googleLoading ? "Redirecting…" : "Continue with Google"}
                  </button>

                  <p className="foot-note">
                    No account?{" "}
                    <a href="mailto:ai.linkdprints@gmail.com?subject=Design%20Flow%20System%20%E2%80%94%20Access%20request">Request access</a>
                  </p>
                </form>
              </>
            ) : (
              /* ── Forgot password (our reset flow) ── */
              <>
                <button type="button" className="back" onClick={switchToLogin}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
                  Back
                </button>
                <h2>Reset password</h2>
                <p className="sub">We&apos;ll email you a secure reset link.</p>

                {resetSent ? (
                  <div className="reset-ok">
                    <div className="reset-ok-ic" aria-hidden>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                    </div>
                    <p className="reset-ok-t">Check your email</p>
                    <p className="reset-ok-s">We sent a link to <b>{resetEmail}</b></p>
                    <button type="button" className="btn btn-ghost" onClick={switchToLogin}>Back to sign in</button>
                  </div>
                ) : (
                  <form onSubmit={handleResetSubmit} noValidate>
                    <div className="field">
                      <label htmlFor="reset-email">Email address</label>
                      <div className="input">
                        <span className="lead" aria-hidden="true">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m3.5 7 8.5 6 8.5-6" /></svg>
                        </span>
                        <input id="reset-email" type="email" autoComplete="email" inputMode="email"
                          value={resetEmail} onChange={(e) => { setResetEmail(e.target.value); if (errorMsg) setErrorMsg(null); }}
                          placeholder="you@studio.com" disabled={resetSending}
                          aria-invalid={!!errorMsg} aria-describedby={errorMsg ? "reset-error" : undefined} />
                      </div>
                    </div>

                    {errorMsg && (
                      <p id="reset-error" role="alert" className="err">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 8v5" /><path d="M12 16h.01" /></svg>
                        {errorMsg}
                      </p>
                    )}

                    <button type="submit" className={`btn btn-primary${resetSending ? " loading" : ""}`} disabled={resetSending}>
                      {resetSending ? <><span className="spin" aria-hidden /><span className="lbl">Sending</span></> : <span className="lbl">Send reset link</span>}
                    </button>
                  </form>
                )}
              </>
            )}
          </section>

        </div>
      </main>

      <footer className="page-foot reveal d6"><b>LinkD Prints</b>&nbsp;·&nbsp;© 2026</footer>
    </div>
  );
}

// ── Feature row ──
function Feature({ title, desc, path }: { title: string; desc: string; path: React.ReactNode }) {
  return (
    <div className="feat">
      <span className="ic" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{path}</svg>
      </span>
      <div><h3>{title}</h3><p>{desc}</p></div>
    </div>
  );
}

// ── Eye / eye-off icon ──
function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M3 3l18 18" /><path d="M10.6 10.7a3 3 0 0 0 4.2 4.2" />
      <path d="M9.4 5.2A10.5 10.5 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.2 6.2A17 17 0 0 0 2 12s3.5 7 10 7a10.4 10.4 0 0 0 3-.4" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35 24 35c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21 21-9.4 21-21c0-1.2-.1-2.3-.4-3.5Z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 5.1 29.6 3 24 3 16 3 9.1 7.6 6.3 14.7Z" />
      <path fill="#4CAF50" d="M24 45c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 36 26.7 37 24 37c-5.3 0-9.7-2.6-11.3-6.9l-6.5 5C9 41.4 15.9 45 24 45Z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C39.9 41.4 45 36 45 24c0-1.2-.1-2.3-.4-3.5Z" />
    </svg>
  );
}

// ── 3D woven-fabric backdrop (Three.js) ─────────────────────────────────────
function WeaveCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cleanup = () => {};
    let cancelled = false;
    // Lazy-load three.js so its ~600KB only ships with the login chunk,
    // not the main app bundle every authenticated page would parse.
    void import("three").then((THREE) => {
      if (cancelled || !canvasRef.current) return;
      cleanup = setupWeave(THREE, canvasRef.current);
    });
    return () => { cancelled = true; cleanup(); };
  }, []);

  return <canvas ref={canvasRef} className="weave" aria-hidden="true" />;
}

function setupWeave(THREE: typeof THREENS, canvas: HTMLCanvasElement): () => void {
  {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0b10, 0.034);

    const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 200);
    camera.position.set(0, 6.2, 16);
    camera.lookAt(0, -0.4, -3);

    const N = 64, W = 26, D = 34;
    const countV = N * N;
    const positions = new Float32Array(countV * 3);
    const colors = new Float32Array(countV * 3);
    const idx = (i: number, j: number) => i * N + j;

    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const k = idx(i, j) * 3;
        positions[k] = (j / (N - 1) - 0.5) * W;
        positions[k + 1] = 0;
        positions[k + 2] = (i / (N - 1) - 0.5) * D;
      }
    }

    const seg: number[] = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N - 1; j++) seg.push(idx(i, j), idx(i, j + 1)); // weft
    for (let j = 0; j < N; j++) for (let i = 0; i < N - 1; i++) seg.push(idx(i, j), idx(i + 1, j)); // warp
    const index = new Uint16Array(seg);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.setIndex(new THREE.BufferAttribute(index, 1));

    const mat = new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending,
    });
    const cloth = new THREE.LineSegments(geo, mat);
    scene.add(cloth);

    const cA = new THREE.Color(0x4a52d6); // indigo
    const cB = new THREE.Color(0x4fd9cf); // teal
    const cC = new THREE.Color(0xff9d6e); // warm highlight
    const tmp = new THREE.Color();

    const wave = (x: number, z: number, t: number) =>
      0.85 * Math.sin(x * 0.42 + t * 0.55)
      + 0.70 * Math.sin(z * 0.55 - t * 0.5)
      + 0.45 * Math.sin((x + z) * 0.30 + t * 0.9)
      + 0.30 * Math.sin((x - z) * 0.6 - t * 0.7);

    const pos = geo.attributes.position.array as Float32Array;
    const col = geo.attributes.color.array as Float32Array;

    function update(t: number) {
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          const k = idx(i, j) * 3;
          const x = pos[k], z = pos[k + 2];
          const y = wave(x, z, t);
          pos[k + 1] = y;
          const depth = i / (N - 1);
          const mix = 0.5 + 0.5 * Math.sin(j * 0.18 + y * 0.5 + t * 0.25);
          tmp.copy(cA).lerp(cB, mix);
          const crest = Math.max(0, (y - 0.7) / 1.6);
          tmp.lerp(cC, crest * 0.5);
          const lum = 0.18 + depth * depth * 0.95;
          col[k] = tmp.r * lum; col[k + 1] = tmp.g * lum; col[k + 2] = tmp.b * lum;
        }
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    }

    let tx = 0, ty = 0, cx = 0, cy = 0;
    const onPointer = (e: PointerEvent) => {
      tx = e.clientX / window.innerWidth - 0.5;
      ty = e.clientY / window.innerHeight - 0.5;
    };

    function resize() {
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    window.addEventListener("resize", resize);
    resize();

    let rafId = 0;
    let disposed = false;
    const start = performance.now();

    if (reduce) {
      update(0.6);
      renderer.render(scene, camera);
    } else {
      window.addEventListener("pointermove", onPointer, { passive: true });
      const loop = (now: number) => {
        if (disposed) return;
        const t = (now - start) / 1000;
        update(t);
        cx += (tx - cx) * 0.04; cy += (ty - cy) * 0.04;
        cloth.rotation.z = cx * 0.12;
        cloth.rotation.x = -cy * 0.10;
        camera.position.x = cx * 2.2;
        camera.lookAt(0, -0.4, -3);
        renderer.render(scene, camera);
        rafId = requestAnimationFrame(loop);
      };
      rafId = requestAnimationFrame(loop);
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointer);
      geo.dispose();
      mat.dispose();
      renderer.dispose();
    };
  }
}

// ── Scoped styles (ported verbatim from the reference, namespaced .df-login) ──
function LoginStyles() {
  return (
    <style>{`
.df-login{
  --ink:#0a0b10; --ink-2:#0e1018; --surface:rgba(20,23,34,.55); --surface-2:rgba(255,255,255,.04);
  --hairline:rgba(255,255,255,.10); --hairline-2:rgba(255,255,255,.07);
  --text:#eef0f6; --text-soft:#b7bccb; --text-mute:#8a90a3;
  --accent:#7c83ff; --accent-2:#58e6d9; --danger:#ff7a8a;
  --radius:18px; --ring:0 0 0 3px rgba(124,131,255,.35);
  position:relative; min-height:100dvh; isolation:isolate;
  color:var(--text); font-synthesis:none;
  font-family:'Hanken Grotesk', system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing:antialiased;
  background:radial-gradient(120% 90% at 50% -10%, #1a1d2b 0%, var(--ink-2) 42%, var(--ink) 100%);
}
.df-login *{ box-sizing:border-box; }

.df-login .weave{ position:fixed; inset:0; width:100%; height:100%; display:block; z-index:0; }
.df-login .vignette{ position:fixed; inset:0; z-index:1; pointer-events:none;
  background:
    radial-gradient(80% 60% at 50% 38%, transparent 40%, rgba(6,7,11,.55) 100%),
    linear-gradient(180deg, rgba(6,7,11,.35) 0%, transparent 22%, transparent 70%, rgba(6,7,11,.6) 100%); }
.df-login .grain{ position:fixed; inset:0; z-index:1; pointer-events:none; opacity:.05; mix-blend-mode:overlay;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); }

.df-login .stage{ position:relative; z-index:2; min-height:100dvh; display:grid; place-items:center; padding:28px; }
.df-login .shell{ width:min(1120px,100%); display:grid; grid-template-columns:1.05fr .95fr; gap:clamp(28px,5vw,72px); align-items:center; }

.df-login .brand{ max-width:520px; }
.df-login .eyebrow{ display:inline-flex; align-items:center; gap:10px; font-size:11px; letter-spacing:.28em; text-transform:uppercase; color:var(--text-mute); margin:0 0 22px; }
.df-login .stitch{ display:inline-flex; gap:4px; }
.df-login .stitch i{ width:7px; height:7px; border-radius:2px; display:block; }
.df-login .stitch i:nth-child(1){ background:#ff5a5f; }
.df-login .stitch i:nth-child(2){ background:#ffd23f; }
.df-login .stitch i:nth-child(3){ background:#4ade80; }
.df-login .stitch i:nth-child(4){ background:#60a5fa; }

.df-login .wordmark{ font-family:'Bricolage Grotesque', sans-serif; font-weight:800; font-size:14px; letter-spacing:.34em; color:var(--text-soft); margin:0 0 14px; }
.df-login h1{ font-family:'Bricolage Grotesque', sans-serif; font-weight:800; font-size:clamp(40px,6vw,68px); line-height:.96; letter-spacing:-.02em; margin:0 0 18px;
  background:linear-gradient(180deg,#fff 0%,#c9cee0 100%); -webkit-background-clip:text; background-clip:text; color:transparent; }
.df-login h1 .tint{ background:linear-gradient(110deg,var(--accent-2),var(--accent)); -webkit-background-clip:text; background-clip:text; color:transparent; }
.df-login .lede{ font-size:clamp(15px,1.4vw,17px); line-height:1.6; color:var(--text-soft); margin:0 0 30px; max-width:42ch; }
.df-login .rule{ height:2px; width:84px; border-radius:2px; margin:0 0 30px; background:linear-gradient(90deg,var(--accent-2),var(--accent),transparent); }

.df-login .feats{ display:grid; gap:2px; }
.df-login .feat{ display:flex; gap:14px; align-items:flex-start; padding:14px 4px; border-top:1px solid var(--hairline-2); }
.df-login .feat:last-child{ border-bottom:1px solid var(--hairline-2); }
.df-login .feat .ic{ flex:0 0 auto; width:34px; height:34px; border-radius:10px; display:grid; place-items:center; background:var(--surface-2); border:1px solid var(--hairline); color:var(--accent-2); }
.df-login .feat h3{ margin:0 0 2px; font-size:14.5px; font-weight:600; color:var(--text); }
.df-login .feat p{ margin:0; font-size:13px; color:var(--text-mute); line-height:1.45; }

.df-login .card{ position:relative; background:var(--surface); backdrop-filter:blur(18px) saturate(120%); -webkit-backdrop-filter:blur(18px) saturate(120%);
  border:1px solid var(--hairline); border-radius:var(--radius); padding:34px 32px 30px; box-shadow:0 30px 80px -30px rgba(0,0,0,.8), inset 0 1px 0 rgba(255,255,255,.06); }
.df-login .card::before{ content:""; position:absolute; inset:0; border-radius:inherit; pointer-events:none; background:linear-gradient(180deg, rgba(255,255,255,.05), transparent 30%); }
.df-login .card h2{ font-family:'Bricolage Grotesque', sans-serif; font-weight:700; font-size:27px; letter-spacing:-.01em; margin:0 0 6px; }
.df-login .card .sub{ margin:0 0 24px; font-size:14px; color:var(--text-soft); }
.df-login .back{ display:inline-flex; align-items:center; gap:7px; background:none; border:0; cursor:pointer; color:var(--text-mute); font-family:inherit; font-size:13px; padding:0; margin:0 0 18px; }
.df-login .back:hover{ color:var(--text-soft); }
.df-login .back:focus-visible{ outline:0; box-shadow:var(--ring); border-radius:8px; }

.df-login .field{ margin-bottom:16px; }
.df-login .field label{ display:block; font-size:11px; letter-spacing:.16em; text-transform:uppercase; color:var(--text-mute); margin-bottom:8px; }
.df-login .label-row{ display:flex; justify-content:space-between; align-items:center; }
.df-login .label-row a{ font-size:12px; color:var(--accent); text-decoration:none; letter-spacing:.02em; }
.df-login .label-row a:hover{ text-decoration:underline; }
.df-login .label-row a:focus-visible{ outline:0; box-shadow:var(--ring); border-radius:6px; }

.df-login .input{ position:relative; display:flex; align-items:center; background:rgba(255,255,255,.035); border:1px solid var(--hairline); border-radius:12px;
  transition:border-color .18s ease, box-shadow .18s ease, background .18s ease; }
.df-login .input:focus-within{ border-color:var(--accent); box-shadow:var(--ring); background:rgba(255,255,255,.05); }
.df-login .input .lead{ display:grid; place-items:center; width:44px; height:48px; color:var(--text-mute); flex:0 0 auto; }
.df-login .input input{ flex:1 1 auto; min-width:0; height:48px; border:0; outline:0; background:transparent; color:var(--text); font-size:16px; font-family:inherit; padding:0 6px 0 0; }
.df-login .input input::placeholder{ color:#6b7186; }
.df-login .input .toggle{ flex:0 0 auto; width:44px; height:48px; display:grid; place-items:center; background:transparent; border:0; cursor:pointer; color:var(--text-mute); border-radius:0 12px 12px 0; }
.df-login .input .toggle:hover{ color:var(--text-soft); }
.df-login .input .toggle:focus-visible{ outline:0; box-shadow:var(--ring); border-radius:8px; }
/* Keep autofilled inputs on-theme (Chrome forces a light pill otherwise) */
.df-login .input input:-webkit-autofill,
.df-login .input input:-webkit-autofill:hover,
.df-login .input input:-webkit-autofill:focus{
  -webkit-text-fill-color:var(--text); caret-color:var(--text);
  -webkit-box-shadow:0 0 0 1000px rgba(255,255,255,.035) inset;
  transition:background-color 9999s ease-in-out 0s;
}

.df-login .err{ display:flex; gap:8px; align-items:flex-start; color:var(--danger); font-size:13px; line-height:1.4; margin:-2px 0 14px; }
.df-login .err svg{ flex:0 0 auto; margin-top:1px; }

.df-login .btn{ width:100%; height:50px; border:0; border-radius:12px; cursor:pointer; font-family:inherit; font-size:15px; font-weight:600; letter-spacing:.01em;
  display:inline-flex; align-items:center; justify-content:center; gap:9px; transition:transform .12s ease, box-shadow .2s ease, filter .2s ease; }
.df-login .btn:focus-visible{ outline:0; box-shadow:var(--ring); }
.df-login .btn:disabled{ cursor:default; }
.df-login .btn-primary{ margin-top:8px; color:#0b0c12; background:linear-gradient(110deg, var(--accent-2) 0%, #8b91ff 55%, var(--accent) 100%);
  box-shadow:0 12px 34px -12px rgba(124,131,255,.7), inset 0 1px 0 rgba(255,255,255,.45); }
.df-login .btn-primary:hover{ transform:translateY(-1px); filter:brightness(1.04); box-shadow:0 18px 44px -14px rgba(124,131,255,.85); }
.df-login .btn-primary:active{ transform:translateY(0); }
.df-login .btn-primary .arrow{ transition:transform .18s ease; }
.df-login .btn-primary:hover .arrow{ transform:translateX(4px); }
.df-login .btn-primary.loading{ pointer-events:none; filter:saturate(.7) brightness(.9); }
.df-login .spin{ width:18px; height:18px; border-radius:50%; border:2px solid rgba(11,12,18,.35); border-top-color:#0b0c12; animation:dflSpin .7s linear infinite; }
.df-login .spin-light{ border-color:rgba(255,255,255,.25); border-top-color:var(--text); }
@keyframes dflSpin{ to{ transform:rotate(360deg); } }

.df-login .or{ display:flex; align-items:center; gap:14px; margin:20px 0; color:var(--text-mute); font-size:11px; letter-spacing:.22em; }
.df-login .or::before, .df-login .or::after{ content:""; height:1px; flex:1; background:var(--hairline); }

.df-login .btn-ghost{ background:rgba(255,255,255,.025); color:var(--text); border:1px solid var(--hairline); }
.df-login .btn-ghost:hover{ background:rgba(255,255,255,.06); transform:translateY(-1px); }

.df-login .reset-ok{ display:flex; flex-direction:column; align-items:center; text-align:center; gap:6px; padding:8px 0 0; }
.df-login .reset-ok-ic{ width:46px; height:46px; border-radius:50%; display:grid; place-items:center; color:var(--accent-2); background:rgba(88,230,217,.1); border:1px solid rgba(88,230,217,.25); margin-bottom:6px; }
.df-login .reset-ok-t{ font-weight:600; font-size:15px; margin:0; }
.df-login .reset-ok-s{ font-size:13px; color:var(--text-mute); margin:0 0 14px; }
.df-login .reset-ok-s b{ color:var(--text-soft); }
.df-login .reset-ok .btn{ width:100%; }

.df-login .foot-note{ text-align:center; margin:22px 0 0; font-size:13px; color:var(--text-mute); }
.df-login .foot-note a{ color:var(--accent); text-decoration:none; font-weight:600; }
.df-login .foot-note a:hover{ text-decoration:underline; }
.df-login .foot-note a:focus-visible{ outline:0; box-shadow:var(--ring); border-radius:6px; }

.df-login .page-foot{ position:fixed; left:0; right:0; bottom:18px; z-index:2; text-align:center; font-size:12px; letter-spacing:.04em; color:var(--text-mute); }
.df-login .page-foot b{ color:var(--text-soft); font-weight:600; }

.df-login .reveal{ opacity:0; transform:translateY(14px); animation:dflRise .7s cubic-bezier(.2,.7,.2,1) forwards; }
.df-login .d1{ animation-delay:.05s } .df-login .d2{ animation-delay:.13s } .df-login .d3{ animation-delay:.21s }
.df-login .d4{ animation-delay:.29s } .df-login .d5{ animation-delay:.37s } .df-login .d6{ animation-delay:.45s }
@keyframes dflRise{ to{ opacity:1; transform:none; } }

@media (max-width:900px){
  .df-login .shell{ grid-template-columns:1fr; gap:30px; max-width:440px; }
  .df-login .feats{ display:none; }
  .df-login h1{ font-size:clamp(34px,11vw,46px); }
  .df-login .card{ padding:28px 22px 24px; }
  .df-login .stage{ padding:22px 18px 70px; }
  .df-login .page-foot{ position:static; margin-top:26px; }
}
@media (max-width:380px){ .df-login .lede{ display:none; } }

@media (prefers-reduced-motion: reduce){
  .df-login .reveal{ animation:none; opacity:1; transform:none; }
  .df-login .btn-primary:hover{ transform:none; }
  .df-login .spin{ animation:none; }
}
`}</style>
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
