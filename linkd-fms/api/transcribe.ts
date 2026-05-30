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
//   the file through **OpenAI Whisper**, which auto-detects English / Hindi
//   and is consistent across devices. Browser SR stays as a "live preview"
//   while recording; this endpoint returns the authoritative transcript.
//
//   Provider chain:
//     1. If OPENAI_API_KEY is set → use api.openai.com + whisper-1.
//     2. Else if GROQ_API_KEY is set → use api.groq.com + whisper-large-v3
//        (kept as a free-tier fallback so a missing/expired OpenAI key
//        doesn't take transcription offline).
//     3. Else → 503 with an actionable hint and the client falls back to
//        "audio only".
//   Both providers expose the same Audio Transcriptions request body, so
//   only the URL + model name + auth key swap between them.
//
// Request:  { path: string }     storage path inside `sample-files`
// Response: { transcript: string }
//
// Required env vars (Vercel → Project → Settings → Environment Variables):
//   • SUPABASE_URL                — same as VITE_SUPABASE_URL
//   • SUPABASE_ANON_KEY           — same as VITE_SUPABASE_ANON_KEY
//   • SUPABASE_SERVICE_ROLE_KEY   — to download the audio bypassing RLS
//   • OPENAI_API_KEY              — `sk-…` from platform.openai.com/api-keys.
//                                   Primary provider. Requires an account
//                                   with credit balance (~$5 covers months).
//   • GROQ_API_KEY (optional)     — `gsk_…` from console.groq.com/keys.
//                                   Free fallback; used when OPENAI_API_KEY
//                                   isn't set.
// ============================================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "sample-files";
// Per-provider config. OpenAI is primary; Groq is a free fallback. Both
// expose the same Audio Transcriptions request body so the only differences
// are the host, model name, and which env var holds the auth token.
const OPENAI_WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";
const OPENAI_WHISPER_MODEL = "whisper-1"; // the only Whisper model OpenAI exposes; well-tested + cheapest at $0.006/min
const GROQ_WHISPER_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_WHISPER_MODEL = "whisper-large-v3"; // accuracy-first variant — better than turbo for accented English + Hinglish
// Both providers cap per-request audio at 25 MB. Reject obviously oversized
// blobs before they cost a round trip.
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
  // Provider selection: OpenAI is primary, Groq is the free-tier fallback.
  // We pick at request time so flipping providers is just "add the env var
  // and redeploy" — no code change needed.
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  const provider = OPENAI_API_KEY
    ? { name: "openai" as const, key: OPENAI_API_KEY, url: OPENAI_WHISPER_URL, model: OPENAI_WHISPER_MODEL }
    : GROQ_API_KEY
    ? { name: "groq" as const, key: GROQ_API_KEY, url: GROQ_WHISPER_URL, model: GROQ_WHISPER_MODEL }
    : null;

  if (!SUPABASE_URL || !ANON || !SERVICE_ROLE) {
    res.status(500).json({
      error:
        "Server misconfigured: SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY env vars are required.",
    });
    return;
  }

  if (!provider) {
    // Surface a clear, actionable error so the client can present a hint.
    res.status(503).json({
      error:
        "Transcription is not configured on this deployment. Add OPENAI_API_KEY (sk-…) to Vercel env vars to enable. GROQ_API_KEY (gsk_…) also works as a free fallback.",
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

  // ── Send to Whisper (via the selected provider) ─────────────────────
  // FormData is global in Node 18+ (Vercel's default). Whisper sniffs the
  // audio container from the filename extension, so keep the .webm suffix.
  const form = new FormData();
  form.append("file", blob, "audio.webm");
  form.append("model", provider.model);

  // **Force Romanized (Hinglish) output.** With no `language` param Whisper
  // auto-detects the spoken language and writes Hindi in Devanagari script
  // (मैं बोल रही हूँ), which the team doesn't read. Setting `language=en`
  // tells Whisper "decode as if it's English" — for Hindi audio that means
  // it phonetically Romanizes what it heard ("main bol rahi hu"). Combined
  // with the prompt below it stays accurate for English chunks too, so the
  // common Hinglish mid-sentence switching ("design approve karo") comes
  // out cleanly.
  form.append("language", "en");

  // The prompt parameter primes Whisper's decoder. We seed it with examples
  // of the team's actual vocabulary so domain-specific words stay correct
  // and the style biases toward casual Hinglish rather than formal English.
  // Whisper uses the LAST 224 tokens, so keep this short and dense.
  form.append(
    "prompt",
    "Casual Hinglish conversation about textile design work. Mix of Hindi and English written in Roman script. Words like: concept, design, fabric, party, sample, sampling, kitting, mtr, qty, approve karo, hold karo, theek hai, achha, kal tak, abhi, main bol rahi hu, batao, dekho, banaya hai, complete ho gaya."
  );

  // A bit of temperature variation gives Whisper room to honour the prompt
  // style on borderline calls instead of falling back to its default
  // "translate Hindi to formal English" behaviour. 0.2 is conservative.
  form.append("temperature", "0.2");

  let whisperRes: Response;
  try {
    whisperRes = await fetch(provider.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${provider.key}` },
      body: form,
    });
  } catch (err) {
    res.status(502).json({
      error: `Failed to reach Whisper (${provider.name}): ${
        err instanceof Error ? err.message : String(err)
      }`,
    });
    return;
  }

  if (!whisperRes.ok) {
    const errText = await whisperRes.text();
    // Don't leak the raw provider body to the client — log it server-side
    // and return a clean message.
    console.error(`[transcribe] ${provider.name} error`, whisperRes.status, errText);
    res.status(502).json({
      error: `Whisper failed (HTTP ${whisperRes.status} via ${provider.name})`,
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
