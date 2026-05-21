import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Profile, UserRole } from "@/types/database";

// ============================================================================
// Context shape
// ============================================================================

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: UserRole | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /**
   * True when the user is signed in but no row in `profiles` matches their
   * auth.uid(). Caller should send them to `/onboarding`.
   */
  needsOnboarding: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  /** Manually refetch the current profile row. */
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const DEBUG = import.meta.env.DEV;
const log = (...args: unknown[]) => {
  if (DEBUG) console.info("[auth]", ...args);
};

// ============================================================================
// Provider
// ============================================================================

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [profileChecked, setProfileChecked] = useState(false);
  // Track the currently-loaded profile's user id so we can skip duplicate
  // fetches on TOKEN_REFRESHED and StrictMode double-runs.
  const lastFetchedUserId = useRef<string | null>(null);

  const fetchProfile = useCallback(
    async (userId: string): Promise<Profile | null> => {
      log("fetchProfile start", userId);
      // Race the Supabase call against a 10s watchdog so a hung fetch can't
      // wedge the UI in "Loading…" forever — it'll throw with a clear error.
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("fetchProfile timed out after 10s")),
          10_000
        )
      );
      try {
        const result = await Promise.race([
          supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
          timeout,
        ]);
        const { data, error } = result;
        if (error) {
          console.error("[auth] fetchProfile error", error);
          return null;
        }
        log("fetchProfile done", { found: !!data });
        return data;
      } catch (e) {
        console.error("[auth] fetchProfile threw", e);
        return null;
      }
    },
    []
  );

  // Single bootstrap + subscribe effect. Two design choices that make this
  // robust to React 18 StrictMode and to Supabase quirks:
  //   1. Call getSession() explicitly for the initial state — don't rely on
  //      INITIAL_SESSION firing through the subscription.
  //   2. Use a "generation" counter as the cancellation token. Every effect
  //      run gets its own generation; stale awaits short-circuit.
  useEffect(() => {
    const myGen = ++currentGen.current;
    const isStale = () => currentGen.current !== myGen;

    log(`bootstrap (gen=${myGen})`);

    (async () => {
      try {
        const { data: { session: initial } } = await supabase.auth.getSession();
        if (isStale()) return;
        log("getSession resolved", { hasSession: !!initial });
        setSession(initial);
        if (initial?.user) {
          const p = await fetchProfile(initial.user.id);
          if (isStale()) return;
          setProfile(p);
          lastFetchedUserId.current = initial.user.id;
        }
        setProfileChecked(true);
        setIsLoading(false);
      } catch (e) {
        console.error("[auth] bootstrap failed", e);
        if (!isStale()) setIsLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (isStale()) return;
        log(`event=${event}`, { hasSession: !!newSession });

        if (event === "SIGNED_OUT") {
          setSession(null);
          setProfile(null);
          setProfileChecked(true);
          setIsLoading(false);
          lastFetchedUserId.current = null;
          return;
        }

        if (event === "TOKEN_REFRESHED") {
          setSession(newSession);
          return;
        }

        // INITIAL_SESSION, SIGNED_IN, USER_UPDATED
        setSession(newSession);
        setIsLoading(false);

        const newUserId = newSession?.user?.id ?? null;
        if (!newUserId) {
          setProfile(null);
          setProfileChecked(true);
          lastFetchedUserId.current = null;
          return;
        }

        // Skip a duplicate fetch if we've already looked this user up.
        //
        // Supabase's auth client re-fires SIGNED_IN whenever the tab regains
        // visibility (and on TOKEN_REFRESHED in some versions). We only want
        // to skeleton + refetch when the *user* genuinely changed, so the
        // dedup key is the user id, not the freshness of the `profile` state.
        //
        // (Earlier we also checked `&& profile`, but `profile` was captured
        // from the closure of the *first* effect run — always `null` — so the
        // check could never short-circuit and every tab-focus flashed the
        // AppShellSkeleton.)
        if (newUserId === lastFetchedUserId.current) {
          setProfileChecked(true);
          return;
        }

        setProfileChecked(false);
        const p = await fetchProfile(newUserId);
        if (isStale()) return;
        setProfile(p);
        setProfileChecked(true);
        lastFetchedUserId.current = newUserId;
      }
    );

    return () => {
      log(`teardown (gen=${myGen})`);
      sub.subscription.unsubscribe();
    };
    // fetchProfile is stable (useCallback with []). profile is intentionally
    // not in deps — we capture latest via state in the handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchProfile]);

  // ------------------------------------------------------------------------
  // Public actions
  // ------------------------------------------------------------------------
  const signIn = useCallback(
    async (email: string, password: string) => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return { error: error?.message ?? null };
    },
    []
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    lastFetchedUserId.current = null;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!session?.user) return;
    const p = await fetchProfile(session.user.id);
    setProfile(p);
    setProfileChecked(true);
  }, [session, fetchProfile]);

  const user = session?.user ?? null;
  const isAuthenticated = !!user;
  // Expose `isLoading=true` whenever we're between "user is signed in" and
  // "we've finished looking up their profile row" — otherwise consumers see a
  // momentary intermediate state where isAuthenticated is true but profile is
  // still null and needsOnboarding hasn't decided yet, which causes blank UI.
  const effectiveLoading = isLoading || (isAuthenticated && !profileChecked);

  const value: AuthContextValue = {
    user,
    session,
    profile,
    role: profile?.role ?? null,
    isLoading: effectiveLoading,
    isAuthenticated,
    needsOnboarding: !!user && profileChecked && !profile,
    signIn,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Module-level "generation" counter — each AuthProvider effect run bumps it,
// so the latest-mounted effect always wins. Safe because there's exactly one
// AuthProvider in the tree.
const currentGen = { current: 0 };

// ============================================================================
// Hook
// ============================================================================

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth() must be called inside <AuthProvider>");
  }
  return ctx;
}
