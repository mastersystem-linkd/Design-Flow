// ============================================================================
// /api/transcribe — Vercel serverless function (Node.js runtime)
// ============================================================================
//
// Why this exists:
//   Browser SpeechRecognition (used by <VoiceFeedback>) is unreliable on
//   mobile Chrome — the engine sometimes records audio fine but produces no
//   transcript at all (especially with `lang=hi-IN` on devices that don't
//   have Google Speech Services tuned for that locale). After the audio is
//   uploaded to Supabase Storage, the client POSTs the path here and we run
//   the file through OpenAI Whisper, which auto-detects language and is
//   consistent across devices. Browser SR stays as a "live preview" while
//   recording; this endpoint returns the authoritative transcript.
//
// Request:  { path: string }     storage path inside `sample-files`
// Response: { transcript: string }
//
// Required env vars (Vercel → Project → Settings → Environment Variables):
//   • SUPABASE_URL                — same as VITE_SUPABASE_URL
//   • SUPABASE_ANON_KEY           — same as VITE_SUPABASE_ANON_KEY
//   • SUPABASE_SERVICE_ROLE_KEY   — to download the audio bypassing RLS
//   • OPENAI_API_KEY              — your OpenAI API key (sk-…). If missing,
//                                   the endpoint returns 503 and the client
//                                   silently falls back to "audio only".
// ============================================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "sample-files";
const WHISPER_MODEL = "whisper-1";
const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";
// Whisper hard limit is 25 MB; reject anything obviously larger early so a
// truncated upload doesn't waste an OpenAI call.
const MAX_AUDIO_BYTES = 24 * 1024 * 1024;

interface RequestBody {
  path?: string;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "authorization, x-client-info, apikey, content-type"
  );
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const ANON = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  if (!SUPABASE_URL || !ANON || !SERVICE_ROLE) {
    res.status(500).json({
      error:
        "Server misconfigured: SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY env vars are required.",
    });
    return;
  }

  if (!OPENAI_API_KEY) {
    // Surface a clear, actionable error so the client can present a hint.
    res.status(503).json({
      error:
        "Transcription is not configured on this deployment. Add OPENAI_API_KEY to Vercel env vars to enable.",
    });
    return;
  }

  // ── Verify caller (any authenticated user can transcribe their own audio) ─
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing Authorization header" });
    return;
  }
  const callerJwt = authHeader.slice("Bearer ".length);

  const callerClient = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: `Bearer ${callerJwt}` } },
  });
  const { data: callerUser, error: callerErr } = await callerClient.auth.getUser(
    callerJwt
  );
  if (callerErr || !callerUser?.user) {
    res.status(401).json({ error: "Invalid session" });
    return;
  }

  // ── Parse body ────────────────────────────────────────────────────────
  let body: RequestBody;
  try {
    body =
      typeof req.body === "string"
        ? (JSON.parse(req.body) as RequestBody)
        : ((req.body ?? {}) as RequestBody);
  } catch {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  const path = body.path?.trim();
  if (!path) {
    res.status(400).json({ error: "Missing `path` (storage object path)" });
    return;
  }

  // Defence-in-depth: the path must live under the caller's own folder.
  // Storage RLS already enforces this, but we double-check here so a stolen
  // JWT can't be combined with a guessed admin folder path.
  if (!path.startsWith(`${callerUser.user.id}/`)) {
    res.status(403).json({
      error: "Path does not belong to the authenticated user",
    });
    return;
  }

  // ── Download the audio with the service role (bypasses RLS so we don't
  //    have to deal with the caller's anon-key download quirks) ───────────
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: blob, error: dlErr } = await admin.storage
    .from(BUCKET)
    .download(path);
  if (dlErr || !blob) {
    res.status(404).json({
      error: `Audio file not found at ${BUCKET}/${path}`,
    });
    return;
  }
  if (blob.size > MAX_AUDIO_BYTES) {
    res.status(413).json({
      error: `Audio file too large (${(blob.size / 1024 / 1024).toFixed(1)} MB). Whisper limit is 25 MB.`,
    });
    return;
  }

  // ── Send to OpenAI Whisper ───────────────────────────────────────────
  // FormData is global in Node 18+ (Vercel's default). Whisper sniffs the
  // audio container from the filename extension, so keep the .webm suffix.
  const form = new FormData();
  form.append("file", blob, "audio.webm");
  form.append("model", WHISPER_MODEL);
  // No `language` param — Whisper auto-detects, which is what we want for
  // teams that mix English + Hindi mid-sentence.

  let whisperRes: Response;
  try {
    whisperRes = await fetch(WHISPER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: form,
    });
  } catch (err) {
    res.status(502).json({
      error: `Failed to reach Whisper: ${
        err instanceof Error ? err.message : String(err)
      }`,
    });
    return;
  }

  if (!whisperRes.ok) {
    const errText = await whisperRes.text();
    // Don't leak the raw OpenAI body to the client — log it server-side and
    // return a clean message.
    console.error("[transcribe] Whisper error", whisperRes.status, errText);
    res.status(502).json({
      error: `Whisper failed (HTTP ${whisperRes.status})`,
    });
    return;
  }

  let parsed: { text?: string };
  try {
    parsed = (await whisperRes.json()) as { text?: string };
  } catch {
    res.status(502).json({ error: "Whisper returned malformed JSON" });
    return;
  }

  const transcript = (parsed.text ?? "").trim();
  res.status(200).json({ transcript });
}
