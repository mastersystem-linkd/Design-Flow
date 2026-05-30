-- ============================================================================
-- 0036_task_whatsapp_received.sql
-- ----------------------------------------------------------------------------
-- Capture WHEN the coordinator received the brief on WhatsApp (separate from
-- when the task was logged in the system). Used to track end-to-end response
-- time: WhatsApp message → brief filed → task assigned → designer starts.
--
-- Two columns rather than one timestamptz so each can be filled independently
-- (coordinators sometimes remember only the date, especially when filing the
-- brief later in the day). Both nullable; pre-existing rows stay NULL.
-- ============================================================================

alter table public.tasks
  add column if not exists whatsapp_received_date date,
  add column if not exists whatsapp_received_time time without time zone;

-- Optional index for "messages received in the last N days" lookups; cheap on
-- a tasks table this size and immediately useful for the upcoming response-
-- time analytics. Keep partial so we don't index NULL rows.
create index if not exists tasks_whatsapp_received_date_idx
  on public.tasks (whatsapp_received_date)
  where whatsapp_received_date is not null;
