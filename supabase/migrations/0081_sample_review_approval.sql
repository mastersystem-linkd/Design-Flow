-- ═══════════════════════════════════════════════════════════════════════════
-- 0081 — Sample review/approval metadata + extensible history log
--
-- Supports the Reviewer→Approve intake gate for ERP sample requests: a reviewer
-- verifies the ERP-supplied (pre-filled) details, edits if wrong, then explicitly
-- Approves to push the sample into development. We reuse the existing
-- sample_status lifecycle (pending → in_progress) and just add who/when approval
-- happened plus a JSONB audit log.
--
-- `sample_history` is the reusable hook the deferred QC / Resample / Discard /
-- Drop completion flow (Part C) will append to per round (mirrors the
-- completion_history pattern used by concepts).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.samples
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS sample_history jsonb NOT NULL DEFAULT '[]'::jsonb;

-- PostgREST caches the schema; reload so the new columns are immediately usable
-- by the SPA (see the §32.3 schema-cache gotcha).
NOTIFY pgrst, 'reload schema';
