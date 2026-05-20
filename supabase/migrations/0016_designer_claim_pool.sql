-- ============================================================================
-- Allow designers to claim tasks from the pool.
-- The existing RLS policies only let designers update tasks where they are
-- already the assignee or creator. Pool tasks have assigned_to = NULL and
-- were created by coordinators, so designers can't UPDATE them to claim.
-- This policy allows any authenticated user to update a pool task.
-- ============================================================================

drop policy if exists "tasks_claim_from_pool" on public.tasks;
create policy "tasks_claim_from_pool"
  on public.tasks for update
  using (status = 'pool' AND auth.uid() IS NOT NULL)
  with check (auth.uid() IS NOT NULL);
