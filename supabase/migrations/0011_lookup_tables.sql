-- ============================================================================
-- LinkD FMS — Lookup tables for Briefing form dropdowns
-- ============================================================================
-- Two new admin-managed lookup tables that back the Concept + Fabric pickers
-- in the brief-creation flow. Each row is a single dropdown option.
--
-- Naming:
--   `concept_categories` — the design-style taxonomy (e.g. "Block print",
--      "Damask"). The existing `concepts` table is for concept *submissions*
--      and is unrelated; that name collision is why this is plural-suffixed.
--   `fabrics`           — fabric types used on briefs (e.g. "Cotton Voile").
--
-- RLS: read for any authenticated user; CRUD restricted to admin (strictly,
-- not widened to coordinator — lookup taxonomy is owner-managed).
-- ============================================================================

begin;

-- ============================================================================
-- concept_categories
-- ============================================================================

create table if not exists public.concept_categories (
  id          uuid          primary key default gen_random_uuid(),
  name        text          not null unique,
  sort_order  integer,
  is_active   boolean       not null default true,
  created_at  timestamptz   not null default now(),
  updated_at  timestamptz   not null default now()
);

create trigger concept_categories_touch_updated_at
  before update on public.concept_categories
  for each row execute procedure public.touch_updated_at();

create index if not exists concept_categories_active_idx
  on public.concept_categories(is_active);

create index if not exists concept_categories_name_lower_idx
  on public.concept_categories(lower(name));

alter table public.concept_categories enable row level security;

-- Anyone authenticated can read.
drop policy if exists "concept_categories_read" on public.concept_categories;
create policy "concept_categories_read"
  on public.concept_categories for select
  using (auth.uid() is not null);

-- Admin-only CRUD. Coordinators do NOT manage lookup taxonomy.
drop policy if exists "concept_categories_admin_all" on public.concept_categories;
create policy "concept_categories_admin_all"
  on public.concept_categories for all
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================================
-- fabrics
-- ============================================================================

create table if not exists public.fabrics (
  id          uuid          primary key default gen_random_uuid(),
  name        text          not null unique,
  sort_order  integer,
  is_active   boolean       not null default true,
  created_at  timestamptz   not null default now(),
  updated_at  timestamptz   not null default now()
);

create trigger fabrics_touch_updated_at
  before update on public.fabrics
  for each row execute procedure public.touch_updated_at();

create index if not exists fabrics_active_idx
  on public.fabrics(is_active);

create index if not exists fabrics_name_lower_idx
  on public.fabrics(lower(name));

alter table public.fabrics enable row level security;

drop policy if exists "fabrics_read" on public.fabrics;
create policy "fabrics_read"
  on public.fabrics for select
  using (auth.uid() is not null);

drop policy if exists "fabrics_admin_all" on public.fabrics;
create policy "fabrics_admin_all"
  on public.fabrics for all
  using (public.is_admin())
  with check (public.is_admin());

commit;
