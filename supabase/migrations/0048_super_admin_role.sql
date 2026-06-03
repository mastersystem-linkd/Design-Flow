-- Add super_admin to the user_role enum.
-- super_admin has all admin powers + exclusive Danger Zone access.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin' BEFORE 'admin';

-- Update is_admin() to include super_admin.
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT auth_role() IN ('super_admin', 'admin');
$$;

-- Update is_admin_or_coordinator() to include super_admin.
CREATE OR REPLACE FUNCTION is_admin_or_coordinator()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT auth_role() IN ('super_admin', 'admin', 'design_coordinator');
$$;
