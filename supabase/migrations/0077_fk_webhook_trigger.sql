-- ═══════════════════════════════════════════════════════════════
-- 0077 — Outbound webhook for Full Kitting events on ERP tasks
--
-- Fires task.fk_added when full_kitting_image_url changes from
-- NULL to non-NULL on a task with external_source set.
-- This tells the Sales ERP that a coordinator has uploaded FK
-- details in Design Flow — the ERP can update its own records.
--
-- Also fires task.fk_completed when the full_kitting_details
-- form_payload is filled (DEO digitization finished).
--
-- Completely inert for non-ERP tasks (external_source IS NULL).
-- ═══════════════════════════════════════════════════════════════

-- ── Trigger function ──

CREATE OR REPLACE FUNCTION enqueue_task_fk_webhook()
RETURNS TRIGGER AS $$
DECLARE
  evt TEXT;
  fk_status TEXT;
BEGIN
  -- Only fire for external tasks with a callback URL
  IF NEW.external_source IS NULL OR NEW.external_callback_url IS NULL THEN
    RETURN NEW;
  END IF;

  -- FK image added (coordinator uploaded form photo)
  IF NEW.full_kitting_image_url IS NOT NULL
     AND (OLD.full_kitting_image_url IS NULL OR OLD.full_kitting_image_url IS DISTINCT FROM NEW.full_kitting_image_url)
  THEN
    evt := 'task.fk_added';

    -- Look up current FK digitization status
    SELECT data_entry_status INTO fk_status
    FROM full_kitting_details
    WHERE task_id = NEW.id
    LIMIT 1;

    INSERT INTO webhook_outbox (event, entity_type, entity_id, ref_id, target_url, payload)
    VALUES (
      evt, 'task', NEW.id, NEW.external_ref_id, NEW.external_callback_url,
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

-- ── Attach to tasks (fires on FK-related column changes) ──

DROP TRIGGER IF EXISTS tasks_enqueue_fk_webhook ON public.tasks;
CREATE TRIGGER tasks_enqueue_fk_webhook
  AFTER UPDATE OF full_kitting_image_url ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION enqueue_task_fk_webhook();


-- ═══════════════════════════════════════════════════════════════
-- FK digitization complete webhook (DEO finished the form)
--
-- Fires on full_kitting_details when form_payload becomes
-- non-NULL and the linked task is an ERP task.
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION enqueue_fk_completed_webhook()
RETURNS TRIGGER AS $$
DECLARE
  t RECORD;
BEGIN
  -- Only care about form_payload becoming non-NULL (digitization done)
  IF NEW.form_payload IS NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.form_payload IS NOT NULL THEN
    RETURN NEW;  -- already had form data, just an edit
  END IF;

  -- Only fire for task-linked FK rows (not sample-linked)
  IF NEW.task_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Look up the parent task — only fire for external tasks
  SELECT id, task_code, status, external_source, external_ref_id, external_callback_url
  INTO t
  FROM tasks
  WHERE id = NEW.task_id;

  IF t.external_source IS NULL OR t.external_callback_url IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO webhook_outbox (event, entity_type, entity_id, ref_id, target_url, payload)
  VALUES (
    'task.fk_completed', 'task', t.id, t.external_ref_id, t.external_callback_url,
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
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS fk_details_enqueue_completed_webhook ON public.full_kitting_details;
CREATE TRIGGER fk_details_enqueue_completed_webhook
  AFTER UPDATE OF form_payload ON public.full_kitting_details
  FOR EACH ROW EXECUTE FUNCTION enqueue_fk_completed_webhook();
