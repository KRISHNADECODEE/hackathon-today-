-- KinectIQ MVP schema. Stores numerical session data only: no video, frames or images.
-- Idempotent: safe to run again in the SQL Editor if a previous run was partial.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  created_at timestamptz not null default now()
);

create table if not exists public.exercise_sessions (
  id uuid primary key,  -- generated client-side so a retried save is idempotent
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  exercise text not null check (exercise in ('shoulder_abduction')),
  side text not null check (side in ('left', 'right')),
  started_at timestamptz not null,
  ended_at timestamptz not null check (ended_at >= started_at),
  duration_ms integer not null check (duration_ms >= 0),
  valid_reps integer not null check (valid_reps >= 0),
  incomplete_reps integer not null default 0 check (incomplete_reps >= 0),
  peak_rom_deg real check (peak_rom_deg between 0 and 180),
  mean_peak_rom_deg real check (mean_peak_rom_deg between 0 and 180),
  tracking_quality real check (tracking_quality between 0 and 1),
  torso_calibrated boolean not null default false,
  evidence text not null check (evidence in ('complete', 'partial', 'insufficient')),
  saved_at timestamptz not null default now()
);
create index if not exists exercise_sessions_user_started_idx on public.exercise_sessions (user_id, started_at desc);

create table if not exists public.rep_metrics (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.exercise_sessions (id) on delete cascade,
  rep_index integer not null check (rep_index > 0),
  peak_rom_deg real not null check (peak_rom_deg between 0 and 180),
  duration_ms integer check (duration_ms >= 0),
  max_torso_deviation_deg real check (max_torso_deviation_deg >= 0),
  tracking_quality real check (tracking_quality between 0 and 1),
  recorded_at timestamptz not null,
  unique (session_id, rep_index)
);

create table if not exists public.form_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.exercise_sessions (id) on delete cascade,
  event_type text not null check (event_type in ('torso_lean')),
  occurred_at timestamptz not null,
  deviation_deg real check (deviation_deg >= 0),
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists form_events_session_idx on public.form_events (session_id);

-- Row Level Security: every row is reachable only through its owner.
alter table public.profiles enable row level security;
alter table public.exercise_sessions enable row level security;
alter table public.rep_metrics enable row level security;
alter table public.form_events enable row level security;

drop policy if exists "own profile read" on public.profiles;
drop policy if exists "own profile update" on public.profiles;
drop policy if exists "own sessions read" on public.exercise_sessions;
drop policy if exists "own sessions insert" on public.exercise_sessions;
drop policy if exists "own sessions delete" on public.exercise_sessions;
drop policy if exists "own reps read" on public.rep_metrics;
drop policy if exists "own reps insert" on public.rep_metrics;
drop policy if exists "own events read" on public.form_events;
drop policy if exists "own events insert" on public.form_events;

create policy "own profile read" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "own profile update" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "own sessions read" on public.exercise_sessions for select to authenticated using (user_id = (select auth.uid()));
create policy "own sessions insert" on public.exercise_sessions for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own sessions delete" on public.exercise_sessions for delete to authenticated using (user_id = (select auth.uid()));

-- Child rows are authorized through the parent session's owner.
create policy "own reps read" on public.rep_metrics for select to authenticated
  using (exists (select 1 from public.exercise_sessions s where s.id = session_id and s.user_id = (select auth.uid())));
create policy "own reps insert" on public.rep_metrics for insert to authenticated
  with check (exists (select 1 from public.exercise_sessions s where s.id = session_id and s.user_id = (select auth.uid())));
create policy "own events read" on public.form_events for select to authenticated
  using (exists (select 1 from public.exercise_sessions s where s.id = session_id and s.user_id = (select auth.uid())));
create policy "own events insert" on public.form_events for insert to authenticated
  with check (exists (select 1 from public.exercise_sessions s where s.id = session_id and s.user_id = (select auth.uid())));

-- Create a profile row for each new auth user.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name) values (new.id, new.raw_user_meta_data ->> 'display_name')
  on conflict (id) do nothing;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Save a session with its reps and events in one transaction (all or nothing).
-- SECURITY INVOKER: RLS still applies to every insert, and user_id is always the caller.
-- Re-saving an id the caller already owns returns success, so concurrent or repeated retries are safe.
create or replace function public.save_session(payload jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  uid uuid := auth.uid();
  sid uuid := (payload ->> 'id')::uuid;
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;
  if sid is null then
    raise exception 'Session id is required' using errcode = '22023';
  end if;

  insert into public.exercise_sessions (id, user_id, exercise, side, started_at, ended_at, duration_ms, valid_reps,
    incomplete_reps, peak_rom_deg, mean_peak_rom_deg, tracking_quality, torso_calibrated, evidence)
  values (sid, uid, payload ->> 'exercise', payload ->> 'side', (payload ->> 'started_at')::timestamptz,
    (payload ->> 'ended_at')::timestamptz, (payload ->> 'duration_ms')::int, (payload ->> 'valid_reps')::int,
    (payload ->> 'incomplete_reps')::int, (payload ->> 'peak_rom_deg')::real, (payload ->> 'mean_peak_rom_deg')::real,
    (payload ->> 'tracking_quality')::real, (payload ->> 'torso_calibrated')::boolean, payload ->> 'evidence')
  on conflict (id) do nothing;

  if not found then
    -- RLS hides other users' rows, so this only matches the caller's own earlier save.
    if exists (select 1 from public.exercise_sessions where id = sid) then
      return sid;
    end if;
    raise exception 'Session id already in use' using errcode = '23505';
  end if;

  insert into public.rep_metrics (session_id, rep_index, peak_rom_deg, duration_ms, max_torso_deviation_deg, tracking_quality, recorded_at)
  select sid, (r ->> 'rep_index')::int, (r ->> 'peak_rom_deg')::real, (r ->> 'duration_ms')::int,
    (r ->> 'max_torso_deviation_deg')::real, (r ->> 'tracking_quality')::real, (r ->> 'recorded_at')::timestamptz
  from jsonb_array_elements(coalesce(payload -> 'reps', '[]'::jsonb)) r;

  insert into public.form_events (session_id, event_type, occurred_at, deviation_deg, metadata)
  select sid, e ->> 'event_type', (e ->> 'occurred_at')::timestamptz, (e ->> 'deviation_deg')::real, coalesce(e -> 'metadata', '{}'::jsonb)
  from jsonb_array_elements(coalesce(payload -> 'events', '[]'::jsonb)) e;

  return sid;
end $$;

revoke execute on function public.save_session(jsonb) from public, anon;
grant execute on function public.save_session(jsonb) to authenticated;

-- Make the new tables and function visible to the API immediately.
notify pgrst, 'reload schema';
