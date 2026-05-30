-- ============================================================================
-- LinkD FMS — let design coordinators manage lookup data
-- ============================================================================
-- Concept categories, fabrics, and the Assigned By roster were admin-only CRUD
-- (migrations 0011 + 0045). Design coordinators now manage these dropdowns too
-- (they run the briefing/sampling workflows), so widen the write policies from
-- is_admin() → is_admin_or_coordinator(). Read stays open to any authed user.
-- ============================================================================

begin;

-- concept_categories ---------------------------------------------------------
drop policy if exists "concept_categories_admin_all" on public.concept_categories;
create policy "concept_categories_admin_all"
  on public.concept_categories for all
  using (public.is_admin_or_coordinator())
  with check (public.is_admin_or_coordinator());

-- fabrics --------------------------------------------------------------------
drop policy if exists "fabrics_admin_all" on public.fabrics;
create policy "fabrics_admin_all"
  on public.fabrics for all
  using (public.is_admin_or_coordinator())
  with check (public.is_admin_or_coordinator());

-- assigned_by_options --------------------------------------------------------
drop policy if exists "assigned_by_options_admin_all" on public.assigned_by_options;
create policy "assigned_by_options_admin_all"
  on public.assigned_by_options for all
  using (public.is_admin_or_coordinator())
  with check (public.is_admin_or_coordinator());

commit;
