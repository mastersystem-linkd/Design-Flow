-- ============================================================================
-- Fix: Allow any authenticated user to insert notifications
-- ============================================================================
-- The original policy restricted inserts to admin/coordinator only, which
-- meant designer-triggered notifications (task complete, concept submit, etc.)
-- were silently rejected by RLS.
-- ============================================================================

DROP POLICY IF EXISTS "notifications_insert_admin_coordinator" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_authenticated" ON public.notifications;

CREATE POLICY "notifications_insert_authenticated"
  ON public.notifications FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
