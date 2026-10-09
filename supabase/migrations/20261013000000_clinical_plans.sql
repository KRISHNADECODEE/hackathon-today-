-- KinectIQ 2.0 - Phase 4: Clinical Exercise Plan Creation and Assignment
-- Non-destructive and idempotent.

-- 1. Clinical Exercise Plans Table
create table if not exists public.clinical_plans (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.profiles(id) on delete cascade,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  connection_id uuid references public.patient_connections(id) on delete set null,
  title text not null check (char_length(title) between 3 and 120),
  instructions text check (instructions is null or char_length(instructions) <= 2000),
  frequency text not null default 'Daily' check (char_length(frequency) <= 60),
  status text not null default 'active' check (status in ('active', 'completed', 'paused', 'archived')),
  version integer not null default 1 check (version >= 1),
  start_date date not null default current_date,
  end_date date not null check (end_date >= start_date),
  exercises jsonb not null default '[]'::jsonb,
  last_change_summary text check (last_change_summary is null or char_length(last_change_summary) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clinical_plans_patient_idx on public.clinical_plans(patient_id, status);
create index if not exists clinical_plans_prof_idx on public.clinical_plans(professional_id, status);

-- 2. Plan Audit Events Table
create table if not exists public.plan_audit_events (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.clinical_plans(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in ('created', 'version_updated', 'status_changed', 'consent_revoked')),
  change_summary text not null,
  previous_version integer,
  new_version integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists plan_audit_events_plan_idx on public.plan_audit_events(plan_id, created_at desc);

-- 3. Add plan_id to exercise_sessions for tracking completion against prescribed plans
alter table public.exercise_sessions
  add column if not exists plan_id uuid references public.clinical_plans(id) on delete set null;

create index if not exists exercise_sessions_plan_idx on public.exercise_sessions(plan_id);

-- 4. Database Trigger: Protect plan authorization, verify clinician credentials & patient consent
create or replace function public.protect_clinical_plan_authorization() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  caller_uid uuid := auth.uid();
  prof_verified boolean;
  conn_status text;
  plan_consent boolean;
begin
  -- Bypass check if caller is internal service_role or postgres superuser
  if (auth.role() = 'service_role' or current_user = 'postgres') then
    new.updated_at := now();
    return new;
  end if;

  if (caller_uid is null) then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if (tg_op = 'INSERT') then
    -- Caller must be the professional
    if (new.professional_id <> caller_uid) then
      raise exception 'Cannot create a clinical plan on behalf of another practitioner' using errcode = '42501';
    end if;

    -- 1. Check if clinician is verified
    select is_verified_professional into prof_verified
    from public.profiles
    where id = new.professional_id;

    if (prof_verified is distinct from true) then
      raise exception 'Only verified practitioners may create and assign exercise plans' using errcode = '42501';
    end if;

    -- 2. Check if active patient connection exists with allow_plan_assignment consent
    select status, coalesce((consent_scope->>'allow_plan_assignment')::boolean, false)
    into conn_status, plan_consent
    from public.patient_connections
    where patient_id = new.patient_id and professional_id = new.professional_id;

    if (conn_status is distinct from 'active') then
      raise exception 'An active patient connection is required to assign an exercise plan' using errcode = '42501';
    end if;

    if (plan_consent is distinct from true) then
      raise exception 'Patient has not granted consent for clinical plan assignment' using errcode = '42501';
    end if;

    new.version := 1;
    new.created_at := now();
    new.updated_at := now();

  elsif (tg_op = 'UPDATE') then
    -- Allowed actors: professional who created it, or patient updating plan status (e.g. marking completed)
    if (caller_uid = old.patient_id) then
      -- Patient can only update status
      if (new.title is distinct from old.title or
          new.instructions is distinct from old.instructions or
          new.exercises is distinct from old.exercises or
          new.professional_id is distinct from old.professional_id or
          new.patient_id is distinct from old.patient_id or
          new.version is distinct from old.version) then
        raise exception 'Patients may only update the status of their assigned plan' using errcode = '42501';
      end if;
    elsif (caller_uid = old.professional_id) then
      -- Verify professional is still verified
      select is_verified_professional into prof_verified
      from public.profiles
      where id = caller_uid;

      if (prof_verified is distinct from true) then
        raise exception 'Clinician verification is required to edit exercise plans' using errcode = '42501';
      end if;

      -- Verify connection is still active and consent has not been revoked
      select status, coalesce((consent_scope->>'allow_plan_assignment')::boolean, false)
      into conn_status, plan_consent
      from public.patient_connections
      where patient_id = old.patient_id and professional_id = old.professional_id;

      if (conn_status is distinct from 'active' or plan_consent is distinct from true) then
        raise exception 'Cannot edit plan: active patient connection and consent required' using errcode = '42501';
      end if;

      -- If exercises, instructions, or title changed, bump version and record audit
      if (new.exercises is distinct from old.exercises or
          new.instructions is distinct from old.instructions or
          new.title is distinct from old.title) then
        new.version := old.version + 1;
      end if;
    else
      raise exception 'Unauthorized to update this clinical plan' using errcode = '42501';
    end if;

    new.updated_at := now();
  end if;

  return new;
end $$;

drop trigger if exists check_clinical_plan_authorization on public.clinical_plans;
create trigger check_clinical_plan_authorization
  before insert or update on public.clinical_plans
  for each row execute function public.protect_clinical_plan_authorization();

-- 5. Trigger to automatically record audit event on clinical plan modification
create or replace function public.log_clinical_plan_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.plan_audit_events (
      plan_id, actor_id, event_type, change_summary, previous_version, new_version, metadata
    ) values (
      new.id, new.professional_id, 'created', 'Initial plan assignment', null, 1,
      jsonb_build_object('title', new.title, 'exercises_count', jsonb_array_length(new.exercises))
    );
  elsif (tg_op = 'UPDATE') then
    if (new.version > old.version) then
      insert into public.plan_audit_events (
        plan_id, actor_id, event_type, change_summary, previous_version, new_version, metadata
      ) values (
        new.id, auth.uid(), 'version_updated',
        coalesce(new.last_change_summary, 'Updated plan exercises or instructions'),
        old.version, new.version,
        jsonb_build_object('title', new.title, 'exercises_count', jsonb_array_length(new.exercises))
      );
    elsif (new.status is distinct from old.status) then
      insert into public.plan_audit_events (
        plan_id, actor_id, event_type, change_summary, previous_version, new_version, metadata
      ) values (
        new.id, auth.uid(), 'status_changed',
        'Status changed from ' || old.status || ' to ' || new.status,
        old.version, new.version,
        jsonb_build_object('old_status', old.status, 'new_status', new.status)
      );
    end if;
  end if;
  return new;
end $$;

drop trigger if exists on_clinical_plan_audit on public.clinical_plans;
create trigger on_clinical_plan_audit
  after insert or update on public.clinical_plans
  for each row execute function public.log_clinical_plan_audit();

-- 6. Row Level Security on clinical_plans and plan_audit_events
alter table public.clinical_plans enable row level security;
alter table public.plan_audit_events enable row level security;

drop policy if exists "clinical plans read" on public.clinical_plans;
create policy "clinical plans read" on public.clinical_plans
  for select to authenticated using (
    patient_id = (select auth.uid()) or professional_id = (select auth.uid())
  );

drop policy if exists "clinical plans insert" on public.clinical_plans;
create policy "clinical plans insert" on public.clinical_plans
  for insert to authenticated with check (
    professional_id = (select auth.uid())
  );

drop policy if exists "clinical plans update" on public.clinical_plans;
create policy "clinical plans update" on public.clinical_plans
  for update to authenticated using (
    patient_id = (select auth.uid()) or professional_id = (select auth.uid())
  );

drop policy if exists "clinical plans delete" on public.clinical_plans;
create policy "clinical plans delete" on public.clinical_plans
  for delete to authenticated using (
    professional_id = (select auth.uid())
  );

drop policy if exists "plan audit read" on public.plan_audit_events;
create policy "plan audit read" on public.plan_audit_events
  for select to authenticated using (
    exists (
      select 1 from public.clinical_plans p
      where p.id = plan_audit_events.plan_id
        and (p.patient_id = (select auth.uid()) or p.professional_id = (select auth.uid()))
    )
  );

-- 7. Update save_session function to support optional plan_id
create or replace function public.save_session(payload jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid := auth.uid();
  sid uuid := (payload ->> 'id')::uuid;
  pid uuid := null;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if sid is null then
    raise exception 'Session id is required' using errcode = '22023';
  end if;

  if (payload ? 'plan_id' and (payload ->> 'plan_id') is not null and (payload ->> 'plan_id') <> '') then
    pid := (payload ->> 'plan_id')::uuid;
  end if;

  insert into public.exercise_sessions (
    id, user_id, exercise, exercise_version, mode, metric_label, metric_unit, direction,
    side, started_at, ended_at, duration_ms, valid_reps, incomplete_reps, peak_rom_deg, mean_peak_rom_deg,
    tracking_quality, torso_calibrated, evidence, summary, plan_id
  )
  values (
    sid, uid, payload ->> 'exercise', coalesce((payload ->> 'exercise_version')::int, 1),
    coalesce(payload ->> 'mode', 'reps'), coalesce(payload ->> 'metric_label', ''), coalesce(payload ->> 'metric_unit', 'deg'),
    payload ->> 'direction', payload ->> 'side', (payload ->> 'started_at')::timestamptz, (payload ->> 'ended_at')::timestamptz,
    (payload ->> 'duration_ms')::int, (payload ->> 'valid_reps')::int, (payload ->> 'incomplete_reps')::int,
    (payload ->> 'peak_rom_deg')::real, (payload ->> 'mean_peak_rom_deg')::real, (payload ->> 'tracking_quality')::real,
    (payload ->> 'torso_calibrated')::boolean, payload ->> 'evidence', coalesce(payload -> 'summary', '{}'::jsonb), pid
  )
  on conflict (id) do nothing;

  -- Insert reps
  if (payload ? 'reps' and jsonb_typeof(payload -> 'reps') = 'array') then
    insert into public.rep_metrics (session_id, rep_index, peak_rom_deg, duration_ms, max_torso_deviation_deg, tracking_quality, quality, recorded_at)
    select sid,
      (r ->> 'rep_index')::int,
      (r ->> 'peak_rom_deg')::real,
      (r ->> 'duration_ms')::int,
      (r ->> 'max_torso_deviation_deg')::real,
      (r ->> 'tracking_quality')::real,
      coalesce(r -> 'quality', '{}'::jsonb),
      (r ->> 'recorded_at')::timestamptz
    from jsonb_array_elements(payload -> 'reps') as r
    on conflict (session_id, rep_index) do nothing;
  end if;

  -- Insert events
  if (payload ? 'events' and jsonb_typeof(payload -> 'events') = 'array') then
    insert into public.form_events (session_id, event_type, occurred_at, deviation_deg, metadata)
    select sid,
      (e ->> 'event_type')::text,
      (e ->> 'occurred_at')::timestamptz,
      (e ->> 'deviation_deg')::real,
      coalesce(e -> 'metadata', '{}'::jsonb)
    from jsonb_array_elements(payload -> 'events') as e;
  end if;

  return sid;
end $$;

-- 8. Reload schema cache
notify pgrst, 'reload schema';
