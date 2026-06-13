-- ════════════════════════════════════════════════════════════════════════
-- ERP WEBHOOK — EMPTY X-Signature FIX — RUNBOOK
--
-- Symptom : The Sales ERP receives our task.completed webhooks but every one
--           arrives with  X-Signature: ""  (empty). Their endpoint is healthy
--           (verify_jwt off; their own signed test POSTs verify fine).
-- Cause   : webhook-dispatcher computes the signature as
--               const secret = integration?.webhook_secret || "";
--               const signature = secret ? hmacSign(secret, body) : "";   ← "" branch
--           An empty X-Signature is reached ONLY when `secret` is falsy, i.e.
--           external_integrations.webhook_secret is NULL/empty on the active
--           row the dispatcher reads (its query was also unordered, so with >1
--           active row it could read a secret-less one).
-- Fix     : (a) store the ERP's exact whsec_… in webhook_secret (STEP 1),
--           (b) deploy the hardened dispatcher (deterministic query + refuse to
--               send unsigned) — code change already in the repo, just redeploy,
--           (c) re-drive the dead-lettered deliveries (STEP 3).
--
-- RUN ORDER:  STEP 0 (diagnose) → STEP 1 (secret) → deploy dispatcher → STEP 3
--             (re-drive) → STEP 4 (verify). Do NOT re-drive before 1 + deploy,
--             or the rows just 401 and dead-letter again.
-- ════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════
-- STEP 0 — DIAGNOSE (read-only)
-- ════════════════════════════════════════════════════════════════════════

-- 0a. The smoking gun: is the secret present, and how many active rows are there?
--     has_secret=false (or secret_len=0)  → confirmed cause.
--     >1 active row                       → note the id of the OLDEST active row
--                                            that HAS a secret; that's STEP 1's target.
SELECT id, name, is_active,
       (webhook_secret IS NOT NULL) AS has_secret,
       length(webhook_secret)       AS secret_len,
       left(webhook_secret, 12)     AS secret_prefix,
       webhook_url
FROM external_integrations
ORDER BY created_at;

-- 0b. What's sitting in the outbox for the proof event (and overall)?
SELECT event, status, attempts, max_attempts, last_error, target_url, created_at, sent_at
FROM webhook_outbox
WHERE event = 'task.completed'
ORDER BY created_at DESC
LIMIT 30;

-- 0c. (optional) Capture the prior secret value for rollback before STEP 1.
SELECT id, webhook_secret FROM external_integrations WHERE is_active = true;

-- → Before changing anything, run scripts/verify-webhook-signature.mjs to confirm
--   the ERP's whsec_… reproduces 82df4305… for ref_id 9560806a… (see file header).


-- ════════════════════════════════════════════════════════════════════════
-- STEP 1 — STORE THE ERP'S EXACT SECRET
--   Paste the EXACT whsec_… the ERP has in its DESIGNFLOW_WEBHOOK_SECRET
--   (include the whsec_ prefix — our sender keys with the full stored string,
--   which produces the 82df4305… form the ERP accepts). Pin to the id from 0a.
-- ════════════════════════════════════════════════════════════════════════

UPDATE external_integrations
SET    webhook_secret = 'whsec_REPLACE_WITH_ERP_VALUE'   -- ← exact value from the ERP
WHERE  id = 'REPLACE_WITH_INTEGRATION_UUID'              -- ← from STEP 0a
  AND  is_active = true;

-- Verify exactly one active row with the expected prefix/length:
SELECT id, name, is_active, left(webhook_secret, 12) AS prefix, length(webhook_secret) AS len
FROM external_integrations WHERE is_active = true;

-- If 0a showed >1 active row, deactivate the strays so the dispatcher reads this one:
--   UPDATE external_integrations SET is_active = false WHERE id = 'STRAY_UUID';


-- ════════════════════════════════════════════════════════════════════════
-- (between STEP 1 and STEP 3) — DEPLOY THE HARDENED DISPATCHER
--   The code change is already in the repo (deterministic integration query +
--   refuse-to-send-unsigned guard). Redeploy it now:
--     supabase functions deploy webhook-dispatcher
--   or Dashboard → Edge Functions → webhook-dispatcher → paste index.standalone.ts
-- ════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════
-- STEP 3 — RE-DRIVE the dead-lettered / failed deliveries
--   Only after STEP 1 + deploy are live. Resets failed rows so the dispatcher
--   resends them WITH a valid signature. Idempotent; safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

-- 3a. Test with ONE first — the proof event — and confirm it flips to 'sent':
UPDATE webhook_outbox
SET    status='pending', attempts=0, next_retry_at=now(), last_error=NULL
WHERE  status='failed' AND event='task.completed'
  AND  ref_id='9560806a-e7bc-4c5d-b7e6-9c4236bb9d69';

-- 3b. Then re-drive everything else still dead-lettered:
UPDATE webhook_outbox
SET    status='pending', attempts=0, next_retry_at=now(), last_error=NULL
WHERE  status='failed';

-- (UI alternative: Settings → Integrations → Webhook Queue → "Retry Failed".)


-- ════════════════════════════════════════════════════════════════════════
-- STEP 4 — VERIFY  (re-run after the next dispatcher tick / manual invoke)
-- ════════════════════════════════════════════════════════════════════════

SELECT event, status, attempts, last_error, target_url, created_at, sent_at
FROM webhook_outbox
WHERE event = 'task.completed'
ORDER BY created_at DESC
LIMIT 20;
--   status='sent'                         → ERP notified with a signed payload. ✅
--   status='pending'                      → wait for the next dispatcher tick.
--   status='failed' + last_error 'HTTP 401' → ERP still rejecting; re-check the
--                                            secret matches both sides (STEP 0b script).

-- Also confirm no "dispatch_skipped" errors remain (means secret is now set):
SELECT event, status, detail, created_at
FROM integration_events
WHERE direction='outbound' AND event='webhook.dispatch_skipped'
ORDER BY created_at DESC LIMIT 5;
