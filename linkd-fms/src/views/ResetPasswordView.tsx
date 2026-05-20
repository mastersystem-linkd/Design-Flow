import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Check, Eye, EyeOff, KeyRound } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Input, Label, LoadingButton, toast } from "@/components/ui";
import { ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

const MIN_PASSWORD_LENGTH = 8;

export function ResetPasswordView() {
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit =
    password.length >= MIN_PASSWORD_LENGTH &&
    password === confirm &&
    !submitting &&
    !success;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setErrorMsg(null);
    setSubmitting(true);

    const { error } = await supabase.auth.updateUser({ password });

    setSubmitting(false);

    if (error) {
      setErrorMsg(error.message);
      toast.error(error.message);
      return;
    }

    setSuccess(true);
    toast.success("Password updated successfully");
    setTimeout(() => navigate(ROUTES.login, { replace: true }), 2000);
  }

  return (
    <div className="flex min-h-screen">
      {/* ═══════════════ LEFT — BRAND ═══════════════ */}
      <aside className="relative hidden w-[45%] flex-col items-center justify-center overflow-hidden bg-sidebar lg:flex">
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgb(var(--primary)) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--primary)) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div
          className="absolute bottom-0 left-0 right-0 h-1/2"
          style={{
            background:
              "linear-gradient(to top, rgb(var(--primary) / 0.08), transparent)",
          }}
        />

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

        <div className="flex flex-1 items-center justify-center px-6 py-12">
          <div className="w-full max-w-[380px]">
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <KeyRound className="h-6 w-6 text-primary" />
            </div>

            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              Set new password
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose a strong password for your account.
            </p>

            {success ? (
              <div className="mt-6 flex flex-col items-center rounded-xl border border-success/30 bg-success/5 p-6 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
                  <Check className="h-6 w-6 text-success" strokeWidth={3} />
                </div>
                <h3 className="mt-3 text-sm font-semibold text-foreground">
                  Password updated!
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Redirecting to sign in…
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
                {/* New password */}
                <div className="space-y-1.5">
                  <Label htmlFor="new-password" className="text-sm font-medium">
                    New password
                  </Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      disabled={submitting}
                      className={cn(
                        "h-11 rounded-lg pr-10 transition-all",
                        "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20",
                        tooShort && "border-warning/60"
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      disabled={submitting}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {/* Requirements */}
                  <p
                    className={cn(
                      "text-xs",
                      password.length === 0
                        ? "text-muted-foreground"
                        : tooShort
                          ? "text-warning"
                          : "text-success"
                    )}
                  >
                    {tooShort
                      ? `${MIN_PASSWORD_LENGTH - password.length} more character${MIN_PASSWORD_LENGTH - password.length > 1 ? "s" : ""} needed`
                      : password.length > 0
                        ? "Password length OK"
                        : `Minimum ${MIN_PASSWORD_LENGTH} characters`}
                  </p>
                </div>

                {/* Confirm password */}
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password" className="text-sm font-medium">
                    Confirm password
                  </Label>
                  <div className="relative">
                    <Input
                      id="confirm-password"
                      type={showConfirm ? "text" : "password"}
                      autoComplete="new-password"
                      required
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="••••••••"
                      disabled={submitting}
                      className={cn(
                        "h-11 rounded-lg pr-10 transition-all",
                        "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20",
                        mismatch && "border-destructive/60"
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((s) => !s)}
                      disabled={submitting}
                      aria-label={showConfirm ? "Hide password" : "Show password"}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                    >
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {mismatch && (
                    <p className="text-xs text-destructive">
                      Passwords don't match
                    </p>
                  )}
                </div>

                {/* Error */}
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

                {/* Submit */}
                <LoadingButton
                  type="submit"
                  size="lg"
                  loading={submitting}
                  loadingText="Updating…"
                  disabled={!canSubmit}
                  className={cn(
                    "w-full h-11 rounded-lg font-medium transition-all",
                    "hover:shadow-md hover:shadow-primary/20 active:scale-[0.98]"
                  )}
                >
                  Update password
                </LoadingButton>
              </form>
            )}

            <p className="mt-8 text-center text-xs text-muted-foreground">
              Need help? Contact your administrator.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
