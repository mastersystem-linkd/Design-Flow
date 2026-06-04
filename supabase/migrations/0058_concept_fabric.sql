-- Add an optional fabric field to concepts (the fabric the concept is designed
-- for). Backed by the existing Settings → Fabrics managed lookup. Nullable —
-- old concepts and concepts submitted without a fabric just stay NULL.
ALTER TABLE public.concepts
  ADD COLUMN IF NOT EXISTS fabric text;
