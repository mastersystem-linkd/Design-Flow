-- ============================================================================
-- LinkD FMS — Add `design_coordinator` to user_role enum
-- ============================================================================
-- Postgres requires new enum values to be committed before they can be
-- referenced. So this migration ONLY adds the value. Everything that uses
-- it (helper function, RLS rewrites) lives in 0009 and must be run AFTER
-- this one commits.
-- ============================================================================

alter type user_role add value if not exists 'design_coordinator';
