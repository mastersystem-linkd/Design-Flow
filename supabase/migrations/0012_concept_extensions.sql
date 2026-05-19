-- ============================================================================
-- LinkD FMS — Concept Extensions (brief-style submission + workflow tracking)
-- ============================================================================
-- Extends the `concepts` table so concept submissions have the same shape as
-- briefs (client, designer, assigned_by, priority, file upload). Also adds a
-- "Final Approval" stage + remarks + approved-designs count to model the
-- existing Google Sheets workflow.
--
-- New columns are all nullable / defaulted so existing rows (none yet, post
-- 0011 reset) continue to satisfy NOT NULL constraints.
-- ============================================================================

begin;

alter table public.concepts
  -- Concept Creation block
  add column if not exists start_date          date,
  add column if not exists designer_id         uuid references public.profiles(id) on delete set null,
  add column if not exists client_id           uuid references public.clients(id) on delete set null,
  add column if not exists assigned_by         text,
  add column if not exists priority            task_priority not null default 'normal',
  add column if not exists file_url            text,

  -- Final Approval block (after the existing md_status / designer_actual_date)
  add column if not exists final_approval_planned_date  date,
  add column if not exists final_approval_actual_date   date,
  add column if not exists final_approval_notes         text,
  add column if not exists final_approved_at            timestamptz,

  -- Aggregate + admin metadata
  add column if not exists approved_designs_count       integer,
  add column if not exists remarks                      text;

create index if not exists concepts_designer_id_idx
  on public.concepts(designer_id);

create index if not exists concepts_client_id_idx
  on public.concepts(client_id);

create index if not exists concepts_priority_idx
  on public.concepts(priority);

create index if not exists concepts_start_date_idx
  on public.concepts(start_date desc);

commit;
