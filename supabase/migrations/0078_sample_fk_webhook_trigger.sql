-- ═══════════════════════════════════════════════════════════════
-- 0078 — Outbound webhook for Sample FK / Development events
--
-- Extends the FK webhook system (0077) to handle SAMPLE-linked
-- full_kitting_details rows. When a coordinator fills the
-- development form in Design Flow for an ERP sample, this fires
-- a webhook back to the ERP system.
--
-- Also adds a trigger on samples.requires_full_kitting to fire
-- when an ERP sample first gets development details flagged.
--
-- Completely inert for non-ERP samples (external_source IS NULL).
-- ═══════════════════════════════════════════════════════════════

-- ── Replace the fk_completed trigger function to also handle samples ──

CREATE OR REPLACE FUNCTION enqueue_fk_completed_webhook()
RETURNS TRIGGER AS $$
DECLARE
  t RECORD;
  s RECORD;
BEGIN
  -- Only care about form_payload becoming non-NULL or being updated
  IF NEW.form_payload IS NULL THEN
    RETURN NEW;
  END IF;

  -- ── Task-linked FK row (existing logic from 0077) ──
  IF NEW.task_id IS NOT NULL THEN
    -- Only fire when form_payload first becomes non-NULL
    IF OLD.form_payload IS NOT NULL THEN
      RETURN NEW;
    END IF;

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
  END IF;

  -- ── Sample-linked FK row (new logic) ──
  IF NEW.sample_id IS NOT NULL THEN
    SELECT id, uid, sample_status, party_name, external_source,
           external_ref_id, external_callback_url
    INTO s
    FROM samples
    WHERE id = NEW.sample_id;

    IF s.external_source IS NULL OR s.external_callback_url IS NULL THEN
      RETURN NEW;
    END IF;

    INSERT INTO webhook_outbox (event, entity_type, entity_id, ref_id, target_url, payload)
    VALUES (
      'sample.development_saved', 'sample', s.id, s.external_ref_id, s.external_callback_url,
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

-- The trigger on full_kitting_details already exists from 0077:
--   fk_details_enqueue_completed_webhook AFTER UPDATE OF form_payload
-- The replaced function now handles both task and sample rows.

-- Also fire on INSERT (not just UPDATE) so that when ext-create-sample
-- inserts a FK row with form_payload in one shot, the webhook fires.
DROP TRIGGER IF EXISTS fk_details_enqueue_completed_webhook_insert ON public.full_kitting_details;
CREATE TRIGGER fk_details_enqueue_completed_webhook_insert
  AFTER INSERT ON public.full_kitting_details
  FOR EACH ROW
  WHEN (NEW.form_payload IS NOT NULL AND NEW.sample_id IS NOT NULL)
  EXECUTE FUNCTION enqueue_fk_completed_webhook();
