-- KinectIQ 2.0: Roles and Profile Permissions
-- Idempotent and non-destructive: adds role and verification status to profiles.

-- 1. Add role and verification columns to public.profiles
alter table public.profiles
  add column if not exists role text not null default 'patient' check (role in ('patient', 'professional', 'wellness'));

alter table public.profiles
  add column if not exists is_verified_professional boolean not null default false;

-- 2. Prevent self-elevation of is_verified_professional via ordinary user client updates
create or replace function public.protect_profile_elevation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Only allow is_verified_professional modification if caller is service_role or postgres
  if (new.is_verified_professional is distinct from old.is_verified_professional) then
    if (auth.role() is distinct from 'service_role' and current_user is distinct from 'postgres') then
      raise exception 'Cannot self-verify professional status without administrator review'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists check_profile_elevation on public.profiles;
create trigger check_profile_elevation
  before update on public.profiles
  for each row execute function public.protect_profile_elevation();

-- 3. Update handle_new_user trigger to populate role from user metadata
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  raw_role text := coalesce(new.raw_user_meta_data ->> 'role', 'patient');
  safe_role text := case when raw_role in ('patient', 'professional', 'wellness') then raw_role else 'patient' end;
begin
  insert into public.profiles (id, display_name, role, is_verified_professional)
  values (
    new.id,
    new.raw_user_meta_data ->> 'display_name',
    safe_role,
    false -- Verification requires administrative or credential verification
  )
  on conflict (id) do update set
    display_name = coalesce(excluded.display_name, public.profiles.display_name);
  return new;
end $$;

-- 4. Reload PostgREST schema cache
notify pgrst, 'reload schema';
