import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { saveSession, toPayload } from '../lib/supabase'
import type { SessionSummary } from '../lib/engine'

const summary: SessionSummary = {
  id: '00000000-0000-4000-8000-000000000001', exercise: 'squat', exerciseVersion: 1, mode: 'reps',
  metricLabel: 'Knee angle', metricUnit: 'deg', direction: 'down', side: 'left',
  startedAt: '2026-10-10T10:00:00.000Z', endedAt: '2026-10-10T10:01:00.000Z', durationMs: 60000.4,
  validReps: 1, incompleteReps: 1, peak: 98.2, meanPeak: 98.2, trackingQuality: 0.93, calibrated: true, evidence: 'complete',
  reps: [{ index: 1, peak: 98.2, durationMs: 2100, startOffsetMs: 5000, trackingQuality: 1, flags: ['trunk_lean'], maxCheck: { trunk_lean: 47 } }],
  events: [{ type: 'trunk_lean', label: 'Trunk lean', offsetMs: 6000, value: 47, threshold: 45, unit: 'deg', repIndex: 1 }],
  extra: {},
}

const client = (rpc: ReturnType<typeof vi.fn>) => ({ rpc }) as unknown as SupabaseClient

describe('session saving', () => {
  it('maps the summary to the RPC payload with absolute timestamps', () => {
    const p = toPayload(summary)
    expect(p).toMatchObject({ exercise: 'squat', side: 'left', direction: 'down', duration_ms: 60000, peak_rom_deg: 98.2 })
    expect(p.reps[0]).toMatchObject({ rep_index: 1, max_torso_deviation_deg: 47, recorded_at: '2026-10-10T10:00:05.000Z', quality: { flags: ['trunk_lean'] } })
    expect(p.events[0]).toMatchObject({ event_type: 'trunk_lean', occurred_at: '2026-10-10T10:00:06.000Z', deviation_deg: 47 })
    expect(JSON.stringify(p)).not.toMatch(/data:image|base64|blob:/) // numbers only
  })

  it('reports the real database error and succeeds on retry with the same id', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ error: { message: 'new row violates check constraint', code: '23514' } })
      .mockResolvedValueOnce({ error: null })
    await expect(saveSession(summary, client(rpc))).rejects.toThrow('new row violates check constraint (23514)')
    await expect(saveSession(summary, client(rpc))).resolves.toBeUndefined()
    expect(rpc.mock.calls[0][1].payload.id).toBe(rpc.mock.calls[1][1].payload.id) // idempotent retry
  })

  it('refuses to pretend it saved without a configured client', async () => {
    await expect(saveSession(summary, null)).rejects.toThrow(/not configured/)
  })
})
