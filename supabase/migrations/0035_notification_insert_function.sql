-- ============================================================================
-- Secure notification insert via RPC
-- ============================================================================
-- RLS INSERT policies on notifications have proven unreliable for cross-user
-- inserts (designer inserting a row for admin/coordinator). The recommended
-- Supabase pattern is a SECURITY DEFINER function that bypasses RLS.
-- The function still requires the caller to be authenticated (auth.uid()).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.notify_user(
  p_user_id   uuid,
  p_title     text,
  p_message   text,
  p_type      text DEFAULT 'info',
  p_link      text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Only authenticated users can call this
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type, link)
  VALUES (p_user_id, p_title, p_message, p_type, p_link)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Batch version: inserts the same notification for multiple users
CREATE OR REPLACE FUNCTION public.notify_users_batch(
  p_user_ids  uuid[],
  p_title     text,
  p_message   text,
  p_type      text DEFAULT 'info',
  p_link      text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.notifications (user_id, title, message, type, link)
  SELECT unnest(p_user_ids), p_title, p_message, p_type, p_link;
END;
$$;

-- Grant execute to authenticated users (anon can't call it)
GRANT EXECUTE ON FUNCTION public.notify_user TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_users_batch TO authenticated;
