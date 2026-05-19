import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // Log so the cause is obvious in the browser console, not a silent hang.
  console.error("[supabase] Missing env vars", { url, anonKey });
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.local, fill it in, then restart `npm run dev` so Vite re-reads env files."
  );
}

if (import.meta.env.DEV) {
  // One-line breadcrumb so you can confirm at a glance the right project is wired.
  console.info("[supabase] connected to", url);
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
