// Verifies owner-only RLS against your Supabase project with two throwaway users.
// Requires "Confirm email" turned off. Usage: node --env-file=.env scripts/rls-check.mjs
import { createClient } from '@supabase/supabase-js'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY
assert(url && key, 'Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY')

async function user() {
  const c = createClient(url, key, { auth: { persistSession: false } })
  const { data, error } = await c.auth.signUp({ email: `rls-${randomUUID()}@example.com`, password: randomUUID() })
  assert(!error && data.session, `sign-up failed (is email confirmation off?): ${error?.message}`)
  return c
}

const a = await user()
const b = await user()
const id = randomUUID()
const now = new Date().toISOString()
const payload = {
  id, exercise: 'shoulder_abduction', side: 'right', started_at: now, ended_at: now, duration_ms: 1000, valid_reps: 1,
  incomplete_reps: 0, peak_rom_deg: 95, mean_peak_rom_deg: 95, tracking_quality: 0.9, torso_calibrated: true, evidence: 'complete',
  reps: [{ rep_index: 1, peak_rom_deg: 95, duration_ms: 1000, max_torso_deviation_deg: 2, tracking_quality: 0.9, recorded_at: now }],
  events: [{ event_type: 'torso_lean', occurred_at: now, deviation_deg: 12, metadata: {} }],
}
const { error: saveErr } = await a.rpc('save_session', { payload })
assert(!saveErr, `owner save failed: ${saveErr?.message}`)

const again = await a.rpc('save_session', { payload })
assert(!again.error, `owner retry of a saved session must succeed: ${again.error?.message}`)
const steal = await b.rpc('save_session', { payload })
assert(steal.error, 'other user must not save under an existing session id')

const own = await a.from('rep_metrics').select('id').eq('session_id', id)
assert.equal(own.data?.length, 1, 'owner can read own reps')

for (const t of ['exercise_sessions', 'rep_metrics', 'form_events']) {
  const { data } = await b.from(t).select('*').eq(t === 'exercise_sessions' ? 'id' : 'session_id', id)
  assert.equal(data?.length ?? 0, 0, `other user must not read ${t}`)
}
const ins = await b.from('rep_metrics').insert({ session_id: id, rep_index: 2, peak_rom_deg: 50, recorded_at: now })
assert(ins.error, 'other user must not insert reps into a foreign session')
const del = await b.from('exercise_sessions').delete().eq('id', id).select()
assert.equal(del.data?.length ?? 0, 0, 'other user must not delete a foreign session')
const anon = createClient(url, key, { auth: { persistSession: false } })
assert.equal((await anon.from('exercise_sessions').select('*').eq('id', id)).data?.length ?? 0, 0, 'anonymous must not read sessions')

await a.from('exercise_sessions').delete().eq('id', id)
console.log('RLS checks passed')
