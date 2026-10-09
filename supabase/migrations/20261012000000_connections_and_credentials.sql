-- KinectIQ 2.0 - Phase 3: Clinician Credentials, Verification & Scoped Patient Connections
-- Non-destructive & additive. Idempotent.

-- 1. Professional Credentials Table
create table if not exists public.professional_credentials (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.profiles(id) on delete cascade,
  full_name text not null check (char_length(full_name) <= 120),
  title text not null check (char_length(title) <= 100),
  license_number text not null check (char_length(license_number) <= 100),
  license_jurisdiction text not null check (char_length(license_jurisdiction) <= 120),
  organization text check (organization is null or char_length(organization) <= 150),
  document_reference text check (document_reference is null or char_length(document_reference) <= 255),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists professional_credentials_prof_idx on public.professional_credentials (professional_id);

-- Prevent regular users from tampering with credential status or approval
create or replace function public.protect_credential_status() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Prevent client setting status to approved directly on insert or update
  if (tg_op = 'INSERT') then
    if (new.status <> 'pending') and (auth.role() is distinct from 'service_role' and current_user is distinct from 'postgres') then
      new.status := 'pending';
    end if;
  elsif (tg_op = 'UPDATE') then
    if (new.status is distinct from old.status or new.reviewed_at is distinct from old.reviewed_at) then
      if (auth.role() is distinct from 'service_role' and current_user is distinct from 'postgres') then
        raise exception 'Cannot modify credential review status without administrator authorization'
          using errcode = '42501';
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists check_credential_status on public.professional_credentials;
create trigger check_credential_status
  before insert or update on public.professional_credentials
  for each row execute function public.protect_credential_status();

-- RLS on professional_credentials
alter table public.professional_credentials enable row level security;

drop policy if exists "own credentials read" on public.professional_credentials;
create policy "own credentials read" on public.professional_credentials
  for select to authenticated using (professional_id = (select auth.uid()));

drop policy if exists "own credentials insert" on public.professional_credentials;
create policy "own credentials insert" on public.professional_credentials
  for insert to authenticated with check (
    professional_id = (select auth.uid()) and
    exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'professional')
  );

-- 2. Patient Connections Table
create table if not exists public.patient_connections (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles(id) on delete cascade,
  professional_id uuid not null references public.profiles(id) on delete cascade,
  initiated_by text not null default 'professional' check (initiated_by in ('professional', 'patient')),
  status text not null default 'pending' check (status in ('pending', 'active', 'rejected', 'revoked')),
  consent_scope jsonb not null default '{
    "share_recent_sessions": true,
    "share_rom_metrics": true,
    "share_all_history": false,
    "allow_plan_assignment": true
  }'::jsonb,
  patient_notes text check (patient_notes is null or char_length(patient_notes) <= 500),
  professional_notes text check (professional_notes is null or char_length(professional_notes) <= 500),
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (patient_id, professional_id)
);

create index if not exists patient_connections_patient_idx on public.patient_connections (patient_id, status);
create index if not exists patient_connections_prof_idx on public.patient_connections (professional_id, status);

-- Trigger to guard connection status transitions:
-- 1. When inserting, status MUST be 'pending' (cannot initiate directly as 'active').
-- 2. A professional CANNOT accept their own connection request (only patient can transition from pending -> active or rejected).
-- 3. Only patient can update consent_scope.
-- 4. Either patient or professional can revoke an active connection.
create or replace function public.protect_connection_transition() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  caller_uid uuid := auth.uid();
begin
  if (caller_uid is null and auth.role() is distinct from 'service_role' and current_user is distinct from 'postgres') then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  if (tg_op = 'INSERT') then
    -- Cannot self-activate
    if (new.status is distinct from 'pending') and (auth.role() is distinct from 'service_role' and current_user is distinct from 'postgres') then
      new.status := 'pending';
    end if;
    -- Patient cannot connect to self
    if (new.patient_id = new.professional_id) then
      raise exception 'Cannot create a connection to yourself' using errcode = '22023';
    end if;
  elsif (tg_op = 'UPDATE') then
    -- If caller is regular authenticated user:
    if (auth.role() is distinct from 'service_role' and current_user is distinct from 'postgres') then
      -- Transitioning to 'active': only patient can accept
      if (old.status = 'pending' and new.status = 'active') then
        if (caller_uid is distinct from old.patient_id) then
          raise exception 'Only the patient can explicitly accept a connection request' using errcode = '42501';
        end if;
        new.responded_at := now();
      end if;

      -- Transitioning to 'rejected': only patient can reject
      if (old.status = 'pending' and new.status = 'rejected') then
        if (caller_uid is distinct from old.patient_id) then
          raise exception 'Only the patient can reject a connection request' using errcode = '42501';
        end if;
        new.responded_at := now();
      end if;

      -- Transitioning to 'revoked': either party can revoke
      if (new.status = 'revoked' and old.status is distinct from 'revoked') then
        if (caller_uid is distinct from old.patient_id and caller_uid is distinct from old.professional_id) then
          raise exception 'Unauthorized to revoke this connection' using errcode = '42501';
        end if;
        new.revoked_at := now();
      end if;

      -- Changing consent scope: only patient can modify
      if (new.consent_scope is distinct from old.consent_scope) then
        if (caller_uid is distinct from old.patient_id) then
          raise exception 'Only the patient can modify shared consent scope' using errcode = '42501';
        end if;
      end if;
    end if;
  end if;

  new.updated_at := now();
  return new;
end $$;

drop trigger if exists check_connection_transition on public.patient_connections;
create trigger check_connection_transition
  before insert or update on public.patient_connections
  for each row execute function public.protect_connection_transition();

-- RLS on patient_connections
alter table public.patient_connections enable row level security;

drop policy if exists "connections read" on public.patient_connections;
create policy "connections read" on public.patient_connections
  for select to authenticated using (
    patient_id = (select auth.uid()) or professional_id = (select auth.uid())
  );

drop policy if exists "connections insert" on public.patient_connections;
create policy "connections insert" on public.patient_connections
  for insert to authenticated with check (
    -- Caller must be either the professional or the patient creating the request
    (professional_id = (select auth.uid()) or patient_id = (select auth.uid()))
  );

drop policy if exists "connections update" on public.patient_connections;
create policy "connections update" on public.patient_connections
  for update to authenticated using (
    patient_id = (select auth.uid()) or professional_id = (select auth.uid())
  );

-- 3. Scoped Session Access for Verified Professionals with Active Consent
-- Unverified professionals get 0 rows! Revoked connections get 0 rows!
-- Historical access is bounded to last 30 days unless patient explicitly enabled share_all_history!
drop policy if exists "connected professional sessions read" on public.exercise_sessions;
create policy "connected professional sessions read" on public.exercise_sessions
  for select to authenticated using (
    exists (
      select 1 from public.patient_connections c
      join public.profiles prof on prof.id = c.professional_id
      where c.patient_id = exercise_sessions.user_id
        and c.professional_id = (select auth.uid())
        and c.status = 'active'
        and prof.is_verified_professional = true
        and (
          (coalesce((c.consent_scope->>'share_all_history')::boolean, false) = true)
          or (
            coalesce((c.consent_scope->>'share_recent_sessions')::boolean, false) = true
            and exercise_sessions.started_at >= (now() - interval '30 days')
          )
        )
    )
  );

-- Also allow child table access (rep_metrics, form_events) for verified professionals with active consent
drop policy if exists "connected professional reps read" on public.rep_metrics;
create policy "connected professional reps read" on public.rep_metrics
  for select to authenticated using (
    exists (
      select 1 from public.exercise_sessions s
      where s.id = rep_metrics.session_id
    )
  );

drop policy if exists "connected professional events read" on public.form_events;
create policy "connected professional events read" on public.form_events
  for select to authenticated using (
    exists (
      select 1 from public.exercise_sessions s
      where s.id = form_events.session_id
    )
  );

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
