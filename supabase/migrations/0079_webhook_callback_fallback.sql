-- ═══════════════════════════════════════════════════════════════
-- 0079 — Outbound webhook callback-URL fallback (fixes ERP status sync)
--
-- PROBLEM
--   Every outbound webhook trigger (0075 task/sample, 0077 FK, 0078
--   sample-FK) short-circuits when the row's `external_callback_url`
--   IS NULL:
--       IF NEW.external_source IS NULL OR NEW.external_callback_url IS NULL
--         THEN RETURN NEW;  -- nothing enqueued, ERP never notified
--   That column is only populated at create time as
--       body.callback_url || integration.webhook_url || null
--   so an ERP task created without a per-request callback_url AND with
--   no global webhook_url configured ends up with a NULL callback. When
--   it later reaches `completed`, the trigger silently skips — the ERP
--   keeps showing the task as pending. (Confirmed: dispatcher healthy,
--   outbox empty — the event was never enqueued.)
--
-- FIX
--   Resolve the target URL at TRIGGER-FIRE time, not just create time:
--   fall back to the active integration's `webhook_url` whenever the
--   row's own `external_callback_url` is NULL. Then a single global
--   webhook_url makes EVERY ERP task/sample notify — including rows that
--   were already created without a per-request callback.
--
-- SAFETY
--   • In-app (non-ERP) rows: external_source IS NULL → still skip. Untouched.
--   • ERP rows WITH a per-request callback_url: that URL still wins
--     (COALESCE first arg) — existing behaviour preserved.
--   • ERP rows WITHOUT a callback and with NO webhook_url configured:
--     still skip (target resolves NULL) — same as today, never errors.
--   • Pure CREATE OR REPLACE FUNCTION — triggers themselves are unchanged
--     (they already reference these functions by name). Idempotent.
--   • No enum, table, column, RLS, or workflow change. The in-app task /
--     sample / FK pipelines are completely unaffected.
-- ═══════════════════════════════════════════════════════════════

-- ── Shared resolver: per-row callback, else the active integration's default ──
-- SECURITY DEFINER so it can read external_integrations (admin-RLS) from
-- inside the SECURITY DEFINER trigger functions.
CREATE OR REPLACE FUNCTION resolve_external_callback(p_callback TEXT)
RETURNS TEXT AS $$
  SELECT COALESCE(
    p_callback,
    (SELECT webhook_url
       FROM public.external_integrations
      WHERE is_active = true
        AND webhook_url IS NOT NULL
      ORDER BY created_at ASC
      LIMIT 1)
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- 1. enqueue_task_webhook (replaces 0075) — task status callbacks
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION enqueue_task_webhook()
RETURNS TRIGGER AS $$
DECLARE
  evt    TEXT;
  target TEXT;
BEGIN
  IF NEW.external_source IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
    evt := 'task.completed';
  ELSIF NEW.status = 'done' AND OLD.status IS DISTINCT FROM 'done' THEN
    evt := 'task.progress';
  ELSIF NEW.status = 'in_progress' AND OLD.status = 'pool' THEN
    evt := 'task.claimed';
  ELSIF NEW.status = 'pool' AND OLD.status IN ('in_progress', 'done') THEN
    evt := 'task.returned';
  ELSE
    RETURN NEW;
  END IF;

  target := resolve_external_callback(NEW.external_callback_url);
  IF target IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO webhook_outbox (event, entity_type, entity_id, ref_id, target_url, payload)
  VALUES (
    evt, 'task', NEW.id, NEW.external_ref_id, target,
    jsonb_build_object(
      'event', evt,
      'ref_id', NEW.external_ref_id,
      'design_flow_id', NEW.id,
      'design_flow_code', NEW.task_code,
      'status', NEW.status,
      'qty', NEW.qty,
      'qty_completed', NEW.qty_completed,
      'completed_at', NEW.completed_at,
      'fabric', NEW.completion_fabric,
      'details', jsonb_build_object(
        'delay_days', NEW.delay_days,
        'sampling_required', COALESCE(NEW.sampling_required, false)
      )
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- 2. enqueue_sample_webhook (replaces 0075) — sample status callbacks
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION enqueue_sample_webhook()
RETURNS TRIGGER AS $$
DECLARE
  evt    TEXT;
  target TEXT;
BEGIN
  IF NEW.external_source IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.sample_status = 'completed' AND OLD.sample_status IS DISTINCT FROM 'completed' THEN
    evt := 'sample.completed';
  ELSIF NEW.sample_status = 'in_progress' AND OLD.sample_status IS DISTINCT FROM 'in_progress' THEN
    evt := 'sample.in_progress';
  ELSE
    RETURN NEW;
  END IF;

  target := resolve_external_callback(NEW.external_callback_url);
  IF target IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO webhook_outbox (event, entity_type, entity_id, ref_id, target_url, payload)
  VALUES (
    evt, 'sample', NEW.id, NEW.external_ref_id, target,
    jsonb_build_object(
      'event', evt,
      'ref_id', NEW.external_ref_id,
      'design_flow_id', NEW.id,
      'uid', NEW.uid,
      'status', NEW.sample_status,
      'party_name', NEW.party_name,
      'fabric', NEW.quality,
      'is_completed', NEW.is_completed
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- 3. enqueue_task_fk_webhook (replaces 0077) — FK image added
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION enqueue_task_fk_webhook()
RETURNS TRIGGER AS $$
DECLARE
  evt       TEXT;
  fk_status TEXT;
  target    TEXT;
BEGIN
  IF NEW.external_source IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.full_kitting_image_url IS NOT NULL
     AND (OLD.full_kitting_image_url IS NULL
          OR OLD.full_kitting_image_url IS DISTINCT FROM NEW.full_kitting_image_url)
  THEN
    target := resolve_external_callback(NEW.external_callback_url);
    IF target IS NULL THEN
      RETURN NEW;
    END IF;

    evt := 'task.fk_added';

    SELECT data_entry_status INTO fk_status
    FROM full_kitting_details
    WHERE task_id = NEW.id
    LIMIT 1;

    INSERT INTO webhook_outbox (event, entity_type, entity_id, ref_id, target_url, payload)
    VALUES (
      evt, 'task', NEW.id, NEW.external_ref_id, target,
      jsonb_build_object(
        'event', evt,
        'ref_id', NEW.external_ref_id,
        'design_flow_id', NEW.id,
        'design_flow_code', NEW.task_code,
        'status', NEW.status,
        'full_kitting', jsonb_build_object(
          'image_uploaded', true,
          'data_entry_status', COALESCE(fk_status, 'pending_deo'),
          'requires_full_kitting', NEW.requires_full_kitting
        )
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- 4. enqueue_fk_completed_webhook (replaces 0078) — FK/dev form filled
--    Handles BOTH task-linked and sample-linked full_kitting_details.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION enqueue_fk_completed_webhook()
RETURNS TRIGGER AS $$
DECLARE
  t      RECORD;
  s      RECORD;
  target TEXT;
BEGIN
  IF NEW.form_payload IS NULL THEN
    RETURN NEW;
  END IF;

  -- ── Task-linked FK row ──
  IF NEW.task_id IS NOT NULL THEN
    IF OLD.form_payload IS NOT NULL THEN
      RETURN NEW;  -- already had form data; just an edit
    END IF;

    SELECT id, task_code, status, external_source, external_ref_id, external_callback_url
    INTO t
    FROM tasks
    WHERE id = NEW.task_id;

    IF t.external_source IS NULL THEN
      RETURN NEW;
    END IF;

    target := resolve_external_callback(t.external_callback_url);
    IF target IS NULL THEN
      RETURN NEW;
    END IF;

    INSERT INTO webhook_outbox (event, entity_type, entity_id, ref_id, target_url, payload)
    VALUES (
      'task.fk_completed', 'task', t.id, t.external_ref_id, target,
      jsonb_build_object(
        'event', 'task.fk_completed',
        'ref_id', t.external_ref_id,
        'design_flow_id', t.id,
        'design_flow_code', t.task_code,
        'status', t.status,
        'full_kitting', jsonb_build_object(
          'data_entry_status', 'completed',
          'completed_at', COALESCE(NEW.completed_at, now()),
          'form_data_available', true
        )
      )
    );
    RETURN NEW;
  END IF;

  -- ── Sample-linked FK row ──
  IF NEW.sample_id IS NOT NULL THEN
    SELECT id, uid, sample_status, party_name, external_source,
           external_ref_id, external_callback_url
    INTO s
    FROM samples
    WHERE id = NEW.sample_id;

    IF s.external_source IS NULL THEN
      RETURN NEW;
    END IF;

    target := resolve_external_callback(s.external_callback_url);
    IF target IS NULL THEN
      RETURN NEW;
    END IF;

    INSERT INTO webhook_outbox (event, entity_type, entity_id, ref_id, target_url, payload)
    VALUES (
      'sample.development_saved', 'sample', s.id, s.external_ref_id, target,
      jsonb_build_object(
        'event', 'sample.development_saved',
        'ref_id', s.external_ref_id,
        'design_flow_id', s.id,
        'design_flow_uid', s.uid,
        'status', s.sample_status,
        'development', jsonb_build_object(
          'data_entry_status', NEW.data_entry_status,
          'saved_at', COALESCE(NEW.completed_at, now()),
          'form_payload', NEW.form_payload
        )
      )
    );
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════
-- 5. (Re)assert the triggers — idempotent + self-sufficient
--
--   0079 only does CREATE OR REPLACE FUNCTION; if the triggers from
--   0075/0077/0078 were never applied to this database, replacing the
--   functions alone would fix nothing (no trigger calls them). Recreating
--   them here (DROP IF EXISTS + CREATE) guarantees that applying 0079 puts
--   BOTH the functions and their bindings in place, regardless of whether
--   the earlier migrations ran. Safe + idempotent — same definitions as
--   0075/0077/0078, no behavioural change.
-- ═══════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS tasks_enqueue_webhook ON public.tasks;
CREATE TRIGGER tasks_enqueue_webhook
  AFTER UPDATE OF status ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION enqueue_task_webhook();

DROP TRIGGER IF EXISTS samples_enqueue_webhook ON public.samples;
CREATE TRIGGER samples_enqueue_webhook
  AFTER UPDATE OF sample_status ON public.samples
  FOR EACH ROW EXECUTE FUNCTION enqueue_sample_webhook();

DROP TRIGGER IF EXISTS tasks_enqueue_fk_webhook ON public.tasks;
CREATE TRIGGER tasks_enqueue_fk_webhook
  AFTER UPDATE OF full_kitting_image_url ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION enqueue_task_fk_webhook();

DROP TRIGGER IF EXISTS fk_details_enqueue_completed_webhook ON public.full_kitting_details;
CREATE TRIGGER fk_details_enqueue_completed_webhook
  AFTER UPDATE OF form_payload ON public.full_kitting_details
  FOR EACH ROW EXECUTE FUNCTION enqueue_fk_completed_webhook();

DROP TRIGGER IF EXISTS fk_details_enqueue_completed_webhook_insert ON public.full_kitting_details;
CREATE TRIGGER fk_details_enqueue_completed_webhook_insert
  AFTER INSERT ON public.full_kitting_details
  FOR EACH ROW
  WHEN (NEW.form_payload IS NOT NULL AND NEW.sample_id IS NOT NULL)
  EXECUTE FUNCTION enqueue_fk_completed_webhook();

-- ── Reload PostgREST schema cache (new function exposed) ──
NOTIFY pgrst, 'reload schema';
