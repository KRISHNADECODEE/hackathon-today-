-- KinectIQ 2.0: Optional Wellness Profile Storage
-- Adds optional wellness_profile jsonb column to public.profiles.
-- Idempotent, non-destructive, and strictly protected by existing profile RLS.

alter table public.profiles
  add column if not exists wellness_profile jsonb default null;

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
