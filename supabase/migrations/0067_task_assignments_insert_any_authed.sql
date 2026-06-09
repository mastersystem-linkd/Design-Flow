-- Allow any authenticated user to insert task_assignments.
-- Previously only admins/coordinators and self-inserts were allowed,
-- which blocked designers from using Team Split in the brief form
-- (they couldn't insert rows for other designers).

DROP POLICY IF EXISTS "task_assignments_insert_designer_self" ON task_assignments;

DROP POLICY IF EXISTS "task_assignments_insert_authenticated" ON task_assignments;
CREATE POLICY "task_assignments_insert_authenticated"
  ON task_assignments FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
