-- ═══════════════════════════════════════════════════════════════════════════
-- 0080 — Distinct UID / task_code prefix for ERP-originated records
--
-- Goal: make Sales-ERP records instantly distinguishable by their identifier.
--   • Samples from the ERP (source='sales_erp')        → ESMP-YYYY-NNNN
--   • Tasks   from the ERP (external_source='sales_erp')→ EORD-YYYY-NNNN
--   • Everything else stays SMP-/ORD- exactly as before.
--
-- Both identifiers are stamped by BEFORE INSERT triggers that already see the
-- origin flag, so this is a pure trigger/generator change — no Edge Function or
-- client change. ERP records are inserted server-side (ext-create-*) and skip
-- the client-side "DF NN-X####" relettering, and isPoolCode() never matches an
-- EORD- code, so the prefix survives the pool-claim reletter untouched.
--
-- The per-year counters (sample_counters / task_counters) are SHARED across
-- prefixes: ESMP/SMP draw from the same sequence, EORD/ORD from the same one —
-- numbers are unique but not contiguous per prefix. The prefix is the
-- differentiator; contiguous per-stream numbering is not required.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Samples: prefix-aware UID generator ──────────────────────────────────────
-- Drop the 0-arg version first so the new defaulted signature isn't ambiguous
-- with a no-arg call.
DROP FUNCTION IF EXISTS public.next_sample_uid();

CREATE OR REPLACE FUNCTION public.next_sample_uid(p_prefix text DEFAULT 'SMP')
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  y int := extract(year from now())::int;
  n int;
begin
  insert into public.sample_counters (year, last_num)
    values (y, 1)
    on conflict (year)
    do update set last_num = public.sample_counters.last_num + 1
    returning last_num into n;
  return p_prefix || '-' || y::text || '-' || lpad(n::text, 4, '0');
end;
$$;

CREATE OR REPLACE FUNCTION public.samples_set_uid()
RETURNS trigger
LANGUAGE plpgsql
AS $$
begin
  if new.uid is null or new.uid = '' then
    new.uid := public.next_sample_uid(
      case when coalesce(new.source, 'manual') = 'sales_erp' then 'ESMP' else 'SMP' end
    );
  end if;
  return new;
end;
$$;

-- (trigger samples_set_uid_trg from 0032 already points at this function)

-- ── Tasks: prefix-aware code generator ───────────────────────────────────────
DROP FUNCTION IF EXISTS public.next_task_code();

CREATE OR REPLACE FUNCTION public.next_task_code(p_prefix text DEFAULT 'ORD')
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  y int := extract(year from now())::int;
  n int;
begin
  insert into public.task_counters (year, last_num)
    values (y, 1)
    on conflict (year)
    do update set last_num = public.task_counters.last_num + 1
    returning last_num into n;
  return p_prefix || '-' || y::text || '-' || lpad(n::text, 4, '0');
end;
$$;

-- Re-create tasks_before_save() faithfully (it also stamps status-transition
-- timestamps) — only the INSERT task_code line changes to pick the ERP prefix.
CREATE OR REPLACE FUNCTION public.tasks_before_save()
RETURNS trigger
LANGUAGE plpgsql
AS $$
begin
  if tg_op = 'INSERT' then
    if new.task_code is null or new.task_code = '' then
      new.task_code := public.next_task_code(
        case when new.external_source = 'sales_erp' then 'EORD' else 'ORD' end
      );
    end if;
    if new.status = 'in_progress' and new.started_at is null then
      new.started_at := now();
    end if;
    if new.status = 'full_kitting' and new.kitted_at is null then
      new.kitted_at := now();
    end if;
    return new;
  end if;

  -- UPDATE: stamp on transition
  if old.status is distinct from new.status then
    if new.status = 'in_progress' and new.started_at is null then
      new.started_at := now();
    end if;
    if new.status = 'full_kitting' and new.kitted_at is null then
      new.kitted_at := now();
    end if;
  end if;
  return new;
end;
$$;

-- (trigger tasks_before_save_trg from 0001 already points at this function)

-- ── Optional backfill — re-prefix existing Sales-ERP records ─────────────────
-- Safe: external_ref_id (not our code) is the ERP cross-key, and re-prefixing
-- never re-fires webhooks. Integration is new (~handful of rows). Review before
-- running on prod; comment out if you'd rather leave historical codes as-is.
UPDATE public.samples
SET    uid = 'ESMP-' || substring(uid from 5)   -- 'SMP-…' → 'ESMP-…'
WHERE  source = 'sales_erp'
  AND  uid LIKE 'SMP-%';

UPDATE public.tasks
SET    task_code = 'EORD-' || substring(task_code from 5)   -- 'ORD-…' → 'EORD-…'
WHERE  external_source = 'sales_erp'
  AND  task_code LIKE 'ORD-%';
