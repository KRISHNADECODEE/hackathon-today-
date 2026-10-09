-- Multi-exercise support. Non-destructive and idempotent: only widens checks and adds columns.
-- Existing shoulder_abduction rows stay valid (defaults match their meaning).

-- Sessions: any registry exercise id, bilateral sessions, and per-exercise metric metadata.
alter table public.exercise_sessions drop constraint if exists exercise_sessions_exercise_check;
alter table public.exercise_sessions add constraint exercise_sessions_exercise_check check (exercise ~ '^[a-z0-9_]{1,64}$');
alter table public.exercise_sessions drop constraint if exists exercise_sessions_side_check;
alter table public.exercise_sessions add constraint exercise_sessions_side_check check (side in ('left', 'right', 'both'));

-- peak_rom_deg / mean_peak_rom_deg now hold the exercise's best metric value in metric_unit.
alter table public.exercise_sessions drop constraint if exists exercise_sessions_peak_rom_deg_check;
alter table public.exercise_sessions drop constraint if exists exercise_sessions_mean_peak_rom_deg_check;
alter table public.exercise_sessions add constraint exercise_sessions_peak_rom_deg_check check (peak_rom_deg >= 0);
alter table public.exercise_sessions add constraint exercise_sessions_mean_peak_rom_deg_check check (mean_peak_rom_deg >= 0);

alter table public.exercise_sessions add column if not exists exercise_version integer not null default 1 check (exercise_version > 0);
alter table public.exercise_sessions add column if not exists mode text not null default 'reps' check (mode in ('reps', 'hold', 'monitor'));
alter table public.exercise_sessions add column if not exists metric_label text not null default 'Shoulder elevation' check (char_length(metric_label) <= 60);
alter table public.exercise_sessions add column if not exists metric_unit text not null default 'deg' check (metric_unit in ('deg', 'pct', 's'));
alter table public.exercise_sessions add column if not exists direction text check (direction in ('up', 'down'));
alter table public.exercise_sessions add column if not exists summary jsonb not null default '{}'::jsonb;
update public.exercise_sessions set direction = 'up' where exercise = 'shoulder_abduction' and direction is null;

create index if not exists exercise_sessions_user_exercise_idx on public.exercise_sessions (user_id, exercise, started_at desc);

-- Reps: holds have no peak value; quality indicators per rep.
alter table public.rep_metrics alter column peak_rom_deg drop not null;
alter table public.rep_metrics drop constraint if exists rep_metrics_peak_rom_deg_check;
alter table public.rep_metrics add constraint rep_metrics_peak_rom_deg_check check (peak_rom_deg >= 0);
alter table public.rep_metrics add column if not exists quality jsonb not null default '{}'::jsonb;

-- Form events: any check id from the registry.
alter table public.form_events drop constraint if exists form_events_event_type_check;
alter table public.form_events add constraint form_events_event_type_check check (event_type ~ '^[a-z0-9_]{1,40}$');

-- save_session: same signature (payload jsonb), extended fields. Still SECURITY INVOKER, owner = caller.
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

  insert into public.exercise_sessions (id, user_id, exercise, exercise_version, mode, metric_label, metric_unit, direction,
    side, started_at, ended_at, duration_ms, valid_reps, incomplete_reps, peak_rom_deg, mean_peak_rom_deg,
    tracking_quality, torso_calibrated, evidence, summary)
  values (sid, uid, payload ->> 'exercise', coalesce((payload ->> 'exercise_version')::int, 1),
    coalesce(payload ->> 'mode', 'reps'), coalesce(payload ->> 'metric_label', ''), coalesce(payload ->> 'metric_unit', 'deg'),
    payload ->> 'direction', payload ->> 'side', (payload ->> 'started_at')::timestamptz, (payload ->> 'ended_at')::timestamptz,
    (payload ->> 'duration_ms')::int, (payload ->> 'valid_reps')::int, (payload ->> 'incomplete_reps')::int,
    (payload ->> 'peak_rom_deg')::real, (payload ->> 'mean_peak_rom_deg')::real, (payload ->> 'tracking_quality')::real,
    (payload ->> 'torso_calibrated')::boolean, payload ->> 'evidence', coalesce(payload -> 'summary', '{}'::jsonb))
  on conflict (id) do nothing;

  if not found then
    -- RLS hides other users' rows, so this only matches the caller's own earlier save.
    if exists (select 1 from public.exercise_sessions where id = sid) then
      return sid;
    end if;
    raise exception 'Session id already in use' using errcode = '23505';
  end if;

  insert into public.rep_metrics (session_id, rep_index, peak_rom_deg, duration_ms, max_torso_deviation_deg, tracking_quality, quality, recorded_at)
  select sid, (r ->> 'rep_index')::int, (r ->> 'peak_rom_deg')::real, (r ->> 'duration_ms')::int,
    (r ->> 'max_torso_deviation_deg')::real, (r ->> 'tracking_quality')::real, coalesce(r -> 'quality', '{}'::jsonb),
    (r ->> 'recorded_at')::timestamptz
  from jsonb_array_elements(coalesce(payload -> 'reps', '[]'::jsonb)) r;

  insert into public.form_events (session_id, event_type, occurred_at, deviation_deg, metadata)
  select sid, e ->> 'event_type', (e ->> 'occurred_at')::timestamptz, (e ->> 'deviation_deg')::real, coalesce(e -> 'metadata', '{}'::jsonb)
  from jsonb_array_elements(coalesce(payload -> 'events', '[]'::jsonb)) e;

  return sid;
end $$;

revoke execute on function public.save_session(jsonb) from public, anon;
grant execute on function public.save_session(jsonb) to authenticated;

notify pgrst, 'reload schema';
