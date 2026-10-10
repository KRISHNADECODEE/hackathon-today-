import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  enqueueOfflineSession,
  getAllQueuedSessions,
  getPendingSessions,
  syncPendingSessions,
  clearOfflineQueueForUser,
  deleteQueuedSession,
  getQueueStats,
  updateQueuedSession,
} from '../lib/offlineQueue'
import { verifyMediaPipeOfflineAssets } from '../lib/pwa'
import type { SessionSummary } from '../lib/engine'
import type { SupabaseClient } from '@supabase/supabase-js'

function makeMockSummary(id = 'sess-1', exercise = 'biceps_curl', reps = 10): SessionSummary {
  return {
    id,
    exercise,
    exerciseVersion: 1,
    mode: 'reps',
    metricLabel: 'Angle',
    metricUnit: 'deg',
    direction: 'down',
    side: 'right',
    startedAt: '2026-10-10T02:00:00.000Z',
    endedAt: '2026-10-10T02:02:00.000Z',
    durationMs: 120000,
    validReps: reps,
    incompleteReps: 1,
    peak: 72,
    meanPeak: 74,
    trackingQuality: 0.98,
    calibrated: true,
    evidence: 'complete',
    extra: {},
    reps: [],
    events: [],
  }
}

describe('Offline Queue & Synchronization Engine', () => {
  beforeEach(async () => {
    // Clear test queue before each test
    await clearOfflineQueueForUser('user-alpha')
    await clearOfflineQueueForUser('user-beta')
    await clearOfflineQueueForUser('user-expired')
  })

  it('enqueues completed sessions into local offline storage with pending status', async () => {
    const s1 = makeMockSummary('sess-101', 'shoulder_abduction', 8)
    const queued = await enqueueOfflineSession(s1, 'user-alpha')

    expect(queued.id).toBe('sess-101')
    expect(queued.userId).toBe('user-alpha')
    expect(queued.status).toBe('pending')
    expect(queued.retryCount).toBe(0)
    expect(queued.summary.validReps).toBe(8)

    const pending = await getPendingSessions('user-alpha')
    expect(pending).toHaveLength(1)
    expect(pending[0].id).toBe('sess-101')
  })

  it('synchronizes pending records to backend exactly once and marks status synced', async () => {
    const s1 = makeMockSummary('sess-201', 'biceps_curl', 12)
    await enqueueOfflineSession(s1, 'user-alpha')

    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    const mockClient = { rpc: mockRpc } as unknown as SupabaseClient

    const result = await syncPendingSessions(mockClient, 'user-alpha')
    expect(result.syncedCount).toBe(1)
    expect(result.failedCount).toBe(0)
    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc).toHaveBeenCalledWith('save_session', expect.objectContaining({
      payload: expect.objectContaining({ id: 'sess-201', exercise: 'biceps_curl' }),
    }))

    // Verify session status is updated to 'synced'
    const all = await getAllQueuedSessions('user-alpha')
    expect(all).toHaveLength(1)
    expect(all[0].status).toBe('synced')
    expect(all[0].syncedAt).toBeDefined()

    // Subsequent sync attempts should not re-save already synced sessions
    const secondSync = await syncPendingSessions(mockClient, 'user-alpha')
    expect(secondSync.syncedCount).toBe(0)
    expect(mockRpc).toHaveBeenCalledTimes(1) // Still 1, not called again
  })

  it('handles backend duplicate primary key violations safely without failing or infinite retries', async () => {
    const s1 = makeMockSummary('sess-duplicate-1', 'sit_to_stand', 15)
    await enqueueOfflineSession(s1, 'user-alpha')

    // Simulate database returning duplicate key error (code 23505)
    const mockRpc = vi.fn().mockResolvedValue({
      error: { code: '23505', message: 'duplicate key value violates unique constraint "exercise_sessions_pkey"' },
    })
    const mockClient = { rpc: mockRpc } as unknown as SupabaseClient

    const result = await syncPendingSessions(mockClient, 'user-alpha')
    // Should safely treat as successfully synchronized
    expect(result.syncedCount).toBe(1)
    expect(result.failedCount).toBe(0)

    const all = await getAllQueuedSessions('user-alpha')
    expect(all[0].status).toBe('synced')
  })

  it('isolates user sessions on shared devices so user-alpha cannot sync user-beta records', async () => {
    await enqueueOfflineSession(makeMockSummary('sess-alpha-1'), 'user-alpha')
    await enqueueOfflineSession(makeMockSummary('sess-beta-1'), 'user-beta')

    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    const mockClient = { rpc: mockRpc } as unknown as SupabaseClient

    // Sync only as user-alpha
    const result = await syncPendingSessions(mockClient, 'user-alpha')
    expect(result.syncedCount).toBe(1)
    expect(mockRpc).toHaveBeenCalledWith('save_session', expect.objectContaining({
      payload: expect.objectContaining({ id: 'sess-alpha-1' }),
    }))

    // user-beta record remains pending and unsynced
    const betaPending = await getPendingSessions('user-beta')
    expect(betaPending).toHaveLength(1)
    expect(betaPending[0].id).toBe('sess-beta-1')
    expect(betaPending[0].status).toBe('pending')
  })

  it('clears offline records for a specific user upon sign-out to preserve privacy', async () => {
    await enqueueOfflineSession(makeMockSummary('sess-alpha-1'), 'user-alpha')
    await enqueueOfflineSession(makeMockSummary('sess-beta-1'), 'user-beta')

    await clearOfflineQueueForUser('user-alpha')

    const alphaRemaining = await getAllQueuedSessions('user-alpha')
    expect(alphaRemaining).toHaveLength(0)

    const betaRemaining = await getAllQueuedSessions('user-beta')
    expect(betaRemaining).toHaveLength(1)
    expect(betaRemaining[0].id).toBe('sess-beta-1')
  })

  it('handles expired auth sessions gracefully and reports descriptive error', async () => {
    await enqueueOfflineSession(makeMockSummary('sess-exp-1'), 'user-expired')

    // Simulate 401 Unauthorized
    const mockRpc = vi.fn().mockResolvedValue({
      error: { code: '401', message: 'JWT expired' },
    })
    const mockClient = { rpc: mockRpc } as unknown as SupabaseClient

    const result = await syncPendingSessions(mockClient, 'user-expired')
    expect(result.syncedCount).toBe(0)
    expect(result.failedCount).toBe(1)
    expect(result.errors[0]).toContain('Authentication expired or invalid')

    const all = await getAllQueuedSessions('user-expired')
    expect(all[0].status).toBe('failed')
    expect(all[0].lastError).toContain('Authentication expired')
    expect(all[0].retryCount).toBe(1)
  })

  it('computes accurate queue stats across statuses', async () => {
    await enqueueOfflineSession(makeMockSummary('s1'), 'user-alpha')
    await enqueueOfflineSession(makeMockSummary('s2'), 'user-alpha')
    await updateQueuedSession('s2', { status: 'failed' })

    const stats = await getQueueStats('user-alpha')
    expect(stats.total).toBe(2)
    expect(stats.pending).toBe(1)
    expect(stats.failed).toBe(1)
    expect(stats.synced).toBe(0)

    await deleteQueuedSession('s2')
    const statsAfter = await getQueueStats('user-alpha')
    expect(statsAfter.total).toBe(1)
  })

  it('verifies that MediaPipe assets are available locally before claiming offline CV readiness', async () => {
    // Mock global fetch to simulate present assets
    const originalFetch = globalThis.fetch
    try {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/mediapipe/')) {
          return Promise.resolve({ ok: true, status: 200 })
        }
        return Promise.resolve({ ok: false, status: 404 })
      })

      const status = await verifyMediaPipeOfflineAssets()
      expect(status.isReady).toBe(true)
      expect(status.missingAssets).toHaveLength(0)

      // Test when an asset is missing
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('pose_landmarker_lite.task')) {
          return Promise.resolve({ ok: false, status: 404 })
        }
        return Promise.resolve({ ok: true, status: 200 })
      })

      const failureStatus = await verifyMediaPipeOfflineAssets()
      expect(failureStatus.isReady).toBe(false)
      expect(failureStatus.missingAssets).toContain('/mediapipe/pose_landmarker_lite.task')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
