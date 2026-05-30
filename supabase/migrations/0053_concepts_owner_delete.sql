-- ============================================================================
-- Let designers delete their OWN concepts
-- ============================================================================
-- The concepts delete policy was admin-only (concepts_delete_admin → is_admin()).
-- Widen it so admins/coordinators OR the concept's owner can delete. "Owner" =
-- the submitter or the assigned designer (mirrors the app's isOwner() and the
-- existing edit/update gating). FK cascade still cleans up concept_files.
--
-- Idempotent: drops both the old and new policy names before re-creating.
-- ============================================================================

begin;

drop policy if exists "concepts_delete_admin" on concepts;
drop policy if exists "concepts_delete_owner_or_admin" on concepts;

create policy "concepts_delete_owner_or_admin"
  on concepts for delete
  using (
    is_admin_or_coordinator()
    or submitted_by = auth.uid()
    or designer_id = auth.uid()
  );

commit;
