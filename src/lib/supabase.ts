import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { SessionSummary } from './engine'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/** Null when env vars are missing; the camera and movement engine still work without it. */
export const supabase = url && key ? createClient(url, key) : null

export const SUPABASE_MISSING = 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env and restart the dev server.'

export type SessionRow = {
  id: string
  user_id: string
  exercise: string
  exercise_version: number
  mode: 'reps' | 'hold' | 'monitor'
  metric_label: string
  metric_unit: 'deg' | 'pct' | 's'
  direction: 'up' | 'down' | null
  side: string
  started_at: string
  ended_at: string
  duration_ms: number
  valid_reps: number
  incomplete_reps: number
  peak_rom_deg: number | null // best metric value, in metric_unit (legacy column name)
  mean_peak_rom_deg: number | null
  tracking_quality: number | null
  torso_calibrated: boolean
  evidence: 'complete' | 'partial' | 'insufficient'
  summary: Record<string, number | null>
  saved_at: string
}
export type RepRow = {
  rep_index: number; peak_rom_deg: number | null; duration_ms: number | null; max_torso_deviation_deg: number | null
  tracking_quality: number | null; quality: { flags?: string[]; max_check?: Record<string, number> }; recorded_at: string
}
export type EventRow = { id: number; event_type: string; occurred_at: string; deviation_deg: number | null; metadata: Record<string, unknown> }

const at = (startedAt: string, offsetMs: number) => new Date(new Date(startedAt).getTime() + offsetMs).toISOString()
const num = (v: number | null) => (v === null || !Number.isFinite(v) ? null : v)

/** Maps a local session summary to the save_session RPC payload. Numbers only, never images. */
export function toPayload(s: SessionSummary) {
  return {
    id: s.id, exercise: s.exercise, exercise_version: s.exerciseVersion, mode: s.mode,
    metric_label: s.metricLabel, metric_unit: s.metricUnit, direction: s.direction, side: s.side,
    started_at: s.startedAt, ended_at: s.endedAt, duration_ms: Math.round(s.durationMs),
    valid_reps: s.validReps, incomplete_reps: s.incompleteReps,
    peak_rom_deg: num(s.peak), mean_peak_rom_deg: num(s.meanPeak), tracking_quality: num(s.trackingQuality),
    torso_calibrated: s.calibrated, evidence: s.evidence, summary: s.extra,
    reps: s.reps.map((r) => ({
      rep_index: r.index, peak_rom_deg: num(r.peak), duration_ms: Math.round(r.durationMs),
      max_torso_deviation_deg: r.maxCheck.trunk_lean ?? null, tracking_quality: r.trackingQuality,
      quality: { flags: r.flags, max_check: r.maxCheck },
      recorded_at: at(s.startedAt, r.startOffsetMs),
    })),
    events: s.events.map((e) => ({
      event_type: e.type, occurred_at: at(s.startedAt, e.offsetMs), deviation_deg: e.value === null ? null : Math.abs(e.value),
      metadata: { label: e.label, threshold: e.threshold, unit: e.unit, rep_index: e.repIndex, offset_ms: Math.round(e.offsetMs) },
    })),
  }
}

/** Saves summary + reps + events atomically via the save_session RPC. Throws the real database error. */
export async function saveSession(s: SessionSummary, client: SupabaseClient | null = supabase) {
  if (!client) throw new Error(SUPABASE_MISSING)
  const { error } = await client.rpc('save_session', { payload: toPayload(s) })
  if (error) throw new Error(error.code ? `${error.message} (${error.code})` : error.message)
}
