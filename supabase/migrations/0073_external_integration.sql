-- ═══════════════════════════════════════════════════════════════
-- 0073 — External Integration backbone (Sales ERP ↔ Design Flow)
--
-- Adds the tables and columns needed for the Sales ERP to push
-- design-dev tasks into our pool and sample-dev work into our
-- pending samples, and for us to push status callbacks back.
--
-- NO existing data, policies, triggers, or enums are altered.
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════
-- A1. external_integrations — connection config
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.external_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  api_key_hash TEXT NOT NULL,
  api_key_prefix TEXT,
  webhook_url TEXT,
  webhook_secret TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_external_integrations_key
  ON public.external_integrations(api_key_hash);

CREATE TRIGGER external_integrations_touch
  BEFORE UPDATE ON public.external_integrations
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ═══════════════════════════════════════════
-- A2. external_* columns on tasks
-- ═══════════════════════════════════════════
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS external_source TEXT,
  ADD COLUMN IF NOT EXISTS external_ref_id TEXT,
  ADD COLUMN IF NOT EXISTS external_callback_url TEXT,
  ADD COLUMN IF NOT EXISTS external_brief JSONB;

CREATE INDEX IF NOT EXISTS idx_tasks_external_ref
  ON public.tasks(external_source, external_ref_id)
  WHERE external_source IS NOT NULL;

-- ═══════════════════════════════════════════
-- A3. external_* columns on samples
-- ═══════════════════════════════════════════
ALTER TABLE public.samples
  ADD COLUMN IF NOT EXISTS external_source TEXT,
  ADD COLUMN IF NOT EXISTS external_ref_id TEXT,
  ADD COLUMN IF NOT EXISTS external_callback_url TEXT,
  ADD COLUMN IF NOT EXISTS external_brief JSONB;

CREATE INDEX IF NOT EXISTS idx_samples_external_ref
  ON public.samples(external_source, external_ref_id)
  WHERE external_source IS NOT NULL;

-- ═══════════════════════════════════════════
-- A4. webhook_outbox — outbound webhook queue
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.webhook_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  ref_id TEXT,
  target_url TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed')),
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 6,
  last_attempt_at TIMESTAMPTZ,
  last_error TEXT,
  next_retry_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_webhook_outbox_pending
  ON public.webhook_outbox(status, next_retry_at)
  WHERE status = 'pending';

-- ═══════════════════════════════════════════
-- A5. integration_events — inbound + outbound audit log
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.integration_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  direction TEXT NOT NULL,
  event TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  ref_id TEXT,
  status TEXT,
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integration_events_recent
  ON public.integration_events(created_at DESC);

-- ═══════════════════════════════════════════
-- A6. RLS — admin-only reads; Edge Functions use service role
-- ═══════════════════════════════════════════
ALTER TABLE public.external_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "external_integrations_admin"
  ON public.external_integrations FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

CREATE POLICY "webhook_outbox_admin_read"
  ON public.webhook_outbox FOR SELECT
  USING (is_admin());

CREATE POLICY "integration_events_admin_read"
  ON public.integration_events FOR SELECT
  USING (is_admin());
