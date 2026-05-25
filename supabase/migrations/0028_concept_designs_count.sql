-- ============================================================================
-- 0028_concept_designs_count.sql
-- ----------------------------------------------------------------------------
-- Captures how many designs the designer submitted in a concept so MD has
-- a denominator at final approval ("X of Y approved"). Without this, the
-- existing `approved_designs_count` was a floating numerator with nothing
-- to compare against.
--
-- Nullable so historical rows that pre-date this column stay valid; the
-- submit form will require it on new submissions going forward.
-- ============================================================================

ALTER TABLE concepts
  ADD COLUMN IF NOT EXISTS designs_count integer
    CHECK (designs_count IS NULL OR designs_count >= 1);

COMMENT ON COLUMN concepts.designs_count IS
  'Number of designs the designer submitted in this concept (denominator for approved_designs_count at final approval).';
