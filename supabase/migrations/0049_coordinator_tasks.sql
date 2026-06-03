-- Coordinator task tracking — logs design/photo search requests
-- assigned to the Design Coordinator by team members.

CREATE TABLE IF NOT EXISTS public.coordinator_tasks (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_name  TEXT        NOT NULL,
  description     TEXT        NOT NULL,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_completed    BOOLEAN     NOT NULL DEFAULT false,
  completed_at    TIMESTAMPTZ,
  notes           TEXT,
  created_by      UUID        NOT NULL REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.coordinator_tasks ENABLE ROW LEVEL SECURITY;

-- Admin + coordinator + super_admin full access
CREATE POLICY "coordinator_tasks_admin_all"
  ON public.coordinator_tasks FOR ALL
  USING (public.is_admin_or_coordinator())
  WITH CHECK (public.is_admin_or_coordinator());

-- Auto-touch updated_at
CREATE TRIGGER coordinator_tasks_touch_updated_at
  BEFORE UPDATE ON public.coordinator_tasks
  FOR EACH ROW EXECUTE PROCEDURE public.touch_updated_at();

-- Indexes
CREATE INDEX IF NOT EXISTS coordinator_tasks_created_at_idx
  ON public.coordinator_tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS coordinator_tasks_requester_idx
  ON public.coordinator_tasks(requester_name);
CREATE INDEX IF NOT EXISTS coordinator_tasks_completed_idx
  ON public.coordinator_tasks(is_completed);
