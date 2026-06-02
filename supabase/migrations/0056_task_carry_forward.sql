-- ============================================================================
-- 0056_task_carry_forward — hand-off / carry-forward context for tasks
-- ============================================================================
-- When an admin/coordinator reassigns a PARTIALLY-COMPLETED task (e.g. a
-- designer finished 6 of 10 designs but became unavailable) to another
-- designer or back to the open pool, we record WHY + who left it. The task's
-- progress (qty_completed, fabric, planned_deadline, files) is preserved by the
-- mutation itself; these columns only carry the hand-off context so the next
-- designer sees a "Carried forward from {name} — {reason}" banner.
--
-- No RLS changes: existing task UPDATE policies already let admins/coordinators
-- reassign, and any authenticated user may read the task they're working on.
-- ============================================================================

alter table public.tasks
  add column if not exists carry_forward_note text,
  add column if not exists carry_forward_from uuid
    references public.profiles(id) on delete set null,
  add column if not exists carry_forward_at timestamptz;

comment on column public.tasks.carry_forward_note is
  'Reason/instructions captured when an admin hands a partially-done task to another designer or the pool.';
comment on column public.tasks.carry_forward_from is
  'The designer who previously held the task at hand-off time (for the carry-forward banner).';
comment on column public.tasks.carry_forward_at is
  'When the most recent hand-off happened.';
