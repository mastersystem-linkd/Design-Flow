-- ════════════════════════════════════════════════════════════════════════
-- ERP COMPLETION-WEBHOOK FIX — RUNBOOK
--
-- Symptom : Sales-ERP tasks complete in Design Flow but the ERP still shows
--           them "pending" — the task.completed callback never arrives.
-- Cause   : Outbound webhook triggers short-circuit when a row's
--           external_callback_url IS NULL. That column is only set at create
--           time (body.callback_url || integration.webhook_url). If the ERP
--           didn't send a per-request callback_url and the integration's
--           webhook_url was unset, the column is NULL → completion never
--           enqueues → ERP never notified. (Dispatcher is healthy; it just
--           has nothing to send.)
-- Fix     : migration 0079 makes the triggers fall back to the integration's
--           webhook_url at fire-time. Then set webhook_url, backfill, re-fire.
--
-- RUN ORDER IS MANDATORY:  0079  →  STEP 1  →  STEP 2  →  STEP 3  →  STEP 4
-- (STEPs 2-4 call resolve_external_callback(), which only exists after 0079.)
-- Run STEP 0 first to confirm the cause before changing anything.
-- ════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════
-- STEP 0 — DIAGNOSE (read-only; run these first, change nothing)
-- ════════════════════════════════════════════════════════════════════════

-- 0a. Do ERP tasks have a callback URL?  (the smoking gun: has_callback = false)
SELECT task_code, external_ref_id, status,
       (external_callback_url IS NOT NULL) AS has_callback,
       external_callback_url, completed_at, created_at
FROM tasks
WHERE external_source = 'sales_erp'
ORDER BY created_at DESC
LIMIT 20;

-- 0b. Is the integration's global webhook_url set?  (how many active rows?)
SELECT id, name, is_active,
       (webhook_url IS NOT NULL)    AS has_webhook_url,    webhook_url,
       (webhook_secret IS NOT NULL) AS has_webhook_secret, last_used_at
FROM external_integrations
ORDER BY created_at;

-- 0c. Is there anything in the outbox?  (empty = never enqueued = confirms cause)
SELECT event, status, attempts, max_attempts, last_error,
       target_url, created_at, sent_at
FROM webhook_outbox
ORDER BY created_at DESC
LIMIT 30;

-- 0d. Were any callbacks ever sent or dead-lettered?
SELECT direction, event, status, ref_id, detail, created_at
FROM integration_events
WHERE direction = 'outbound'
ORDER BY created_at DESC
LIMIT 30;

-- 0e. Does the enqueue trigger actually exist?  (false = 0075 was never applied;
--     0079 recreates it, so applying 0079 also fixes that case.)
SELECT EXISTS (
  SELECT 1 FROM information_schema.triggers
  WHERE trigger_name = 'tasks_enqueue_webhook'
    AND event_object_table = 'tasks'
) AS trigger_exists;

-- INTERPRETATION
--   has_callback=false + outbox empty            → confirmed: NULL callback (the fix below).
--   outbox row exists, status='failed'           → delivery failed; read last_error
--                                                   (HTTP 401 = ERP signature/secret mismatch;
--                                                    connect error = wrong/unreachable URL).
--   outbox row status='sent' but ERP pending     → we delivered; the ERP isn't processing it
--                                                   (ERP-side bug — share the payload with their dev).
--   trigger_exists=false                         → 0075 never deployed; 0079 (below) recreates it.


-- ════════════════════════════════════════════════════════════════════════
-- STEP 1 — APPLY MIGRATION 0079
--   Apply supabase/migrations/0079_webhook_callback_fallback.sql through your
--   normal migration path (Supabase SQL editor / CLI). It adds
--   resolve_external_callback() and updates the 4 trigger functions +
--   (re)asserts the 5 triggers. Do NOT run STEP 2-4 until this is applied.
-- ════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════
-- STEP 2 — SET THE GLOBAL CALLBACK URL  (the one piece only you can supply)
--   This is the ERP's inbound callback endpoint — get it from the ERP dev.
--   Pin the UPDATE to the exact integration id (from STEP 0b) so it can never
--   clobber another integration row.
-- ════════════════════════════════════════════════════════════════════════

-- Replace <integration-uuid> (from STEP 0b) and the URL, then run:
UPDATE external_integrations
SET    webhook_url = 'https://YOUR-ERP-CALLBACK-ENDPOINT'   -- ← from the ERP dev
WHERE  id = '<integration-uuid>'                            -- ← from STEP 0b
  AND  is_active = true;

-- Verify exactly one row updated and the URL is correct:
SELECT id, name, webhook_url, is_active FROM external_integrations WHERE is_active = true;


-- ════════════════════════════════════════════════════════════════════════
-- STEP 3 — BACKFILL existing ERP rows that were created without a callback
--   Safe: external_callback_url is NOT a trigger column, so this UPDATE does
--   not fire any webhook. (0079's fallback would also cover these at fire-time,
--   but backfilling makes the stored data explicit and the re-fire below exact.)
-- ════════════════════════════════════════════════════════════════════════

UPDATE tasks
SET    external_callback_url = resolve_external_callback(NULL)
WHERE  external_source = 'sales_erp'
  AND  external_callback_url IS NULL
  AND  resolve_external_callback(NULL) IS NOT NULL;

UPDATE samples
SET    external_callback_url = resolve_external_callback(NULL)
WHERE  external_source = 'sales_erp'
  AND  external_callback_url IS NULL
  AND  resolve_external_callback(NULL) IS NOT NULL;


-- ════════════════════════════════════════════════════════════════════════
-- STEP 4 — RE-FIRE the missed completions (idempotent)
--   Enqueues a task.completed for every completed ERP task that has no
--   task.completed outbox row yet (ANY status — so re-running never duplicates).
--   The dispatcher picks them up within ~1 minute.
-- ════════════════════════════════════════════════════════════════════════

INSERT INTO webhook_outbox (event, entity_type, entity_id, ref_id, target_url, payload)
SELECT
  'task.completed', 'task', t.id, t.external_ref_id,
  resolve_external_callback(t.external_callback_url),
  jsonb_build_object(
    'event',            'task.completed',
    'ref_id',           t.external_ref_id,
    'design_flow_id',   t.id,
    'design_flow_code', t.task_code,
    'status',           t.status,
    'qty',              t.qty,
    'qty_completed',    t.qty_completed,
    'completed_at',     COALESCE(t.completed_at, now()),
    'fabric',           t.completion_fabric,
    'details', jsonb_build_object(
      'delay_days',         t.delay_days,
      'sampling_required',  COALESCE(t.sampling_required, false)
    )
  )
FROM tasks t
WHERE t.external_source = 'sales_erp'
  AND t.status = 'completed'
  AND resolve_external_callback(t.external_callback_url) IS NOT NULL
  AND NOT EXISTS (                       -- idempotent: ANY existing task.completed row blocks re-insert
    SELECT 1 FROM webhook_outbox w
    WHERE w.entity_id = t.id
      AND w.event = 'task.completed'
  );


-- ════════════════════════════════════════════════════════════════════════
-- STEP 5 — VERIFY DELIVERY  (re-run after ~1-2 minutes)
-- ════════════════════════════════════════════════════════════════════════

SELECT event, status, attempts, last_error, target_url, created_at, sent_at
FROM webhook_outbox
WHERE event = 'task.completed'
ORDER BY created_at DESC
LIMIT 20;
--   status='sent'   → ERP was notified. ✅  (the ERP should flip to completed)
--   status='pending'→ wait for the next dispatcher tick.
--   status='failed' + last_error 'HTTP 401' → ERP rejected the signature: the
--      ERP's DESIGNFLOW_WEBHOOK_SECRET must equal external_integrations.webhook_secret
--      (see SALES_ERP_INTEGRATION_GUIDE §6). Fix the secret, then re-run STEP 4.
