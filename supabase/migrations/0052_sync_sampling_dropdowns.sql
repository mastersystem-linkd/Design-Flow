-- ============================================================================
-- Sync sampling_dropdowns to scripts/Sampling Dropdowns.csv (updated)
-- ============================================================================
-- Reconciles the three Sampling field lists to exactly match the CSV:
--   • Requirement      — dropped 11x12, 11x13, 11x14, 11x15, 11x16
--   • Fusing Operator  — dropped Monu
--   • Sampling Done By — unchanged
-- Deletes only the removed options (safe — saved sample rows keep their text
-- values), then re-inserts the CSV set idempotently. Assigned By is managed
-- separately and intentionally left untouched.
-- ============================================================================

begin;

-- ── Remove options no longer in the CSV ────────────────────────────────────
delete from public.sampling_dropdowns
 where field = 'requirement'
   and name not in (
     '3 Fold Card', '6x4', '6x6', '8x8', '9x9', '10x10', '11x11',
     'Blanket', 'Booklet', 'Concept', 'Curtains', 'Master Folder',
     'Panel', 'Placement', 'Yardage'
   );

delete from public.sampling_dropdowns
 where field = 'sampling_done_by'
   and name not in ('Nandu Sir', 'Supriya Sonawane');

delete from public.sampling_dropdowns
 where field = 'fusing_operator'
   and name not in (
     'Kailash / Pradeep', 'Kailash / Shubham', 'Satyandra',
     'Satyandra / Pradeep', 'Shubham / Satyandra'
   );

-- ── Ensure the full CSV set is present (idempotent) ─────────────────────────
insert into public.sampling_dropdowns (field, name, sort_order) values
  ('requirement', '3 Fold Card', 1),
  ('requirement', '6x4', 2),
  ('requirement', '6x6', 3),
  ('requirement', '8x8', 4),
  ('requirement', '9x9', 5),
  ('requirement', '10x10', 6),
  ('requirement', '11x11', 7),
  ('requirement', 'Blanket', 8),
  ('requirement', 'Booklet', 9),
  ('requirement', 'Concept', 10),
  ('requirement', 'Curtains', 11),
  ('requirement', 'Master Folder', 12),
  ('requirement', 'Panel', 13),
  ('requirement', 'Placement', 14),
  ('requirement', 'Yardage', 15),
  ('sampling_done_by', 'Nandu Sir', 1),
  ('sampling_done_by', 'Supriya Sonawane', 2),
  ('fusing_operator', 'Kailash / Pradeep', 1),
  ('fusing_operator', 'Kailash / Shubham', 2),
  ('fusing_operator', 'Satyandra', 3),
  ('fusing_operator', 'Satyandra / Pradeep', 4),
  ('fusing_operator', 'Shubham / Satyandra', 5)
on conflict (name, field) do nothing;

commit;
