-- ═══════════════════════════════════════════════════════════════════════════
-- 0082 — QC completion flow for ERP-originated samples
--
-- ERP samples (source='sales_erp') can only be completed via a mandatory QC
-- form (CRR_SAMPLE_DEV_WORKFLOW.md §3). Manual samples are unaffected.
--   QC Pass            → sample_status='completed' (existing sample.completed webhook)
--   QC Fail → Resample → stays in_progress, new attempt (loop; same ref_id)
--   QC Fail → Discard/Drop → sample_status='dropped' (NEW sample.dropped webhook)
--
-- Per-round QC data lives in a dedicated, queryable table (sample_qc_rounds).
-- A few denormalized fields on `samples` (drop_reason/notes, qc_summary) let the
-- existing AFTER-UPDATE-OF-sample_status webhook trigger build its payload from
-- NEW without a subquery.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Extend the sample_status enum with a terminal 'dropped' state ─────────
-- The 0069 inline CHECK is auto-named samples_sample_status_check.
ALTER TABLE public.samples DROP CONSTRAINT IF EXISTS samples_sample_status_check;
ALTER TABLE public.samples
  ADD CONSTRAINT samples_sample_status_check
  CHECK (sample_status IN ('pending', 'in_progress', 'completed', 'dropped'));

-- ── 2. Denormalized fields read by the webhook trigger ──────────────────────
ALTER TABLE public.samples
  ADD COLUMN IF NOT EXISTS drop_reason text,
  ADD COLUMN IF NOT EXISTS drop_notes  text,
  ADD COLUMN IF NOT EXISTS qc_summary  jsonb;

-- ── 3. Per-round QC records ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sample_qc_rounds (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id         uuid NOT NULL REFERENCES public.samples(id) ON DELETE CASCADE,
  attempt_no        int  NOT NULL,
  passed            boolean NOT NULL,
  print_quality     text CHECK (print_quality  IN ('good', 'bad')),
  fusing_quality    text CHECK (fusing_quality IN ('good', 'bad')),
  done_date         date,
  printing_operator text,
  fusing_operator   text,
  outcome           text NOT NULL CHECK (outcome IN ('pass', 'resample', 'discard', 'drop')),
  failure_reasons   text[] NOT NULL DEFAULT '{}',
  reinspect_date    date,
  notes             text,
  inspected_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sample_qc_attempt
  ON public.sample_qc_rounds (sample_id, attempt_no);
CREATE INDEX IF NOT EXISTS idx_sample_qc_rounds_sample
  ON public.sample_qc_rounds (sample_id);

-- ── 4. RLS: read any authed; write admin/coordinator (matches samples policy) ─
ALTER TABLE public.sample_qc_rounds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sample_qc_rounds_read ON public.sample_qc_rounds;
CREATE POLICY sample_qc_rounds_read
  ON public.sample_qc_rounds FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS sample_qc_rounds_write ON public.sample_qc_rounds;
CREATE POLICY sample_qc_rounds_write
  ON public.sample_qc_rounds FOR ALL
  USING (is_admin_or_coordinator())
  WITH CHECK (is_admin_or_coordinator());

-- ── 5. Extend enqueue_sample_webhook() with the dropped event ───────────────
-- Reproduces the 0079 body, adding the 'dropped' branch + reason/notes/qc in the
-- payload. The trigger (samples_enqueue_webhook, AFTER UPDATE OF sample_status)
-- is unchanged.
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
  ELSIF NEW.sample_status = 'dropped' AND OLD.sample_status IS DISTINCT FROM 'dropped' THEN
    evt := 'sample.dropped';
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
      'is_completed', NEW.is_completed,
      'reason', NEW.drop_reason,
      'notes', NEW.drop_notes,
      'qc', NEW.qc_summary
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 6. Reload PostgREST schema cache (new columns + table) ──────────────────
NOTIFY pgrst, 'reload schema';
