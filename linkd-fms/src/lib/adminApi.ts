// ============================================================================
// adminApi — thin wrapper around the Vercel /api/* admin endpoints
// ============================================================================
//
// These endpoints hold the Supabase service-role key server-side and proxy
// privileged operations (editing emails/passwords, listing auth.users) after
// verifying the caller is admin/coordinator. The browser never sees the
// service-role key.
//
// `callAdminApi("admin-update-user", { ... })` returns `{ data, error }` in
// the same shape supabase.functions.invoke() does, so the call sites read
// identically whether we go via Supabase Edge or Vercel API.
// ============================================================================

import { supabase } from "./supabase";

export interface AdminApiResult<T> {
  data: T | null;
  error: { message: string; status?: number } | null;
}

/** POST JSON to /api/<route> with the current user's JWT in Authorization. */
export async function callAdminApi<T = unknown>(
  route: string,
  body: Record<string, unknown>
): Promise<AdminApiResult<T>> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    return { data: null, error: { message: "Not signed in" } };
  }

  let res: Response;
  try {
    res = await fetch(`/api/${route}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return {
      data: null,
      error: {
        message:
          err instanceof Error
            ? `Network error reaching /api/${route}: ${err.message}`
            : `Network error reaching /api/${route}`,
      },
    };
  }

  // Vercel returns the SPA index.html for any unmatched path. If we see HTML
  // back, the route file doesn't exist on the deploy — surface that clearly
  // instead of failing with a confusing "Unexpected token <" JSON parse error.
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const text = await res.text();
    const looksLikeHtml = text.trim().startsWith("<");
    return {
      data: null,
      error: {
        message: looksLikeHtml
          ? `/api/${route} is not deployed (server returned HTML, not JSON). Push the latest code to Vercel and check that linkd-fms/api/${route}.ts exists in the deployed build.`
          : `Unexpected response from /api/${route}: ${text.slice(0, 200)}`,
        status: res.status,
      },
    };
  }

  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    return {
      data: null,
      error: { message: `Couldn't parse /api/${route} response`, status: res.status },
    };
  }

  if (!res.ok) {
    const payload = parsed as { error?: string; message?: string };
    return {
      data: null,
      error: {
        message: payload.error ?? payload.message ?? `HTTP ${res.status}`,
        status: res.status,
      },
    };
  }

  return { data: parsed as T, error: null };
}
