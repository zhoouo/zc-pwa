-- Add custom_tags column to profiles table for individual tag ordering
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS custom_tags text[] DEFAULT array[]::text[];
