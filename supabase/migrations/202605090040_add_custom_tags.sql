-- Add custom_tags column to couples table
ALTER TABLE public.couples ADD COLUMN IF NOT EXISTS custom_tags text[] DEFAULT array[]::text[];
