-- Add table density preference to user_preferences (comfortable | compact).
ALTER TABLE public.user_preferences
ADD COLUMN IF NOT EXISTS table_density text NOT NULL DEFAULT 'comfortable';
