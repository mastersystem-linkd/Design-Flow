-- ═══════════════════════════════════════════════════════════════
-- 0075 — Outbound webhook triggers for ERP-origin tasks/samples
--
-- When a task or sample that came from an external source reaches
-- a notable status, enqueue a row in webhook_outbox so the
-- dispatcher can push the callback to the Sales ERP.
--
-- Only fires for rows with external_source + external_callback_url.
-- In-app tasks/samples are completely unaffected.
-- ═══════════════════════════════════════════════════════════════

-- ── Task webhook trigger ──

CREATE OR REPLACE FUNCTION enqueue_task_webhook()
RETURNS TRIGGER AS $$
DECLARE
  evt TEXT;
BEGIN
  IF NEW.external_source IS NULL OR NEW.external_callback_url IS NULL THEN
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

  INSERT INTO webhook_outbox (event, entity_type, entity_id, ref_id, target_url, payload)
  VALUES (
    evt, 'task', NEW.id, NEW.external_ref_id, NEW.external_callback_url,
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

DROP TRIGGER IF EXISTS tasks_enqueue_webhook ON public.tasks;
CREATE TRIGGER tasks_enqueue_webhook
  AFTER UPDATE OF status ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION enqueue_task_webhook();

-- ── Sample webhook trigger ──

CREATE OR REPLACE FUNCTION enqueue_sample_webhook()
RETURNS TRIGGER AS $$
DECLARE
  evt TEXT;
BEGIN
  IF NEW.external_source IS NULL OR NEW.external_callback_url IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.sample_status = 'completed' AND OLD.sample_status IS DISTINCT FROM 'completed' THEN
    evt := 'sample.completed';
  ELSIF NEW.sample_status = 'in_progress' AND OLD.sample_status IS DISTINCT FROM 'in_progress' THEN
    evt := 'sample.in_progress';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO webhook_outbox (event, entity_type, entity_id, ref_id, target_url, payload)
  VALUES (
    evt, 'sample', NEW.id, NEW.external_ref_id, NEW.external_callback_url,
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

DROP TRIGGER IF EXISTS samples_enqueue_webhook ON public.samples;
CREATE TRIGGER samples_enqueue_webhook
  AFTER UPDATE OF sample_status ON public.samples
  FOR EACH ROW EXECUTE FUNCTION enqueue_sample_webhook();
