import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  enqueueOfflineSession,
  getAllQueuedSessions,
  getPendingSessions,
  syncPendingSessions,
  clearOfflineQueueForUser,
} from '../lib/offlineQueue'
import { SessionTracker, summarize, type SessionSummary } from '../lib/engine'
import { exerciseById } from '../lib/exercises'
import type { SupabaseClient } from '@supabase/supabase-js'

describe('End-to-End Offline Exercise Flow & Exactly-Once Sync', () => {
  const TEST_USER = 'patient-offline-test'

  beforeEach(async () => {
    await clearOfflineQueueForUser(TEST_USER)
  })

  it('runs complete offline lifecycle: track -> queue offline -> reconnect -> sync exactly once', async () => {
    // 1. User starts an exercise session while online
    const ex = exerciseById('biceps_curl')!
    expect(ex).toBeDefined()
    const tracker = new SessionTracker(ex.track!, 'right', ex.view)

    // Simulate exercise movement
    const startTime = new Date('2026-10-10T02:00:00Z')
    const endTime = new Date('2026-10-10T02:02:30Z')
    const sessionId = 'session-offline-flow-1'

    const summary: SessionSummary = {
      ...summarize(
        tracker,
        { id: sessionId, exercise: ex.id, version: ex.version, sided: ex.sided },
        startTime,
        endTime,
        150000
      ),
      planId: null,
    }

    // 2. Network disconnects (user goes offline)
    Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true })
    expect(navigator.onLine).toBe(false)

    // 3. User finishes session offline: queued into local IndexedDB storage
    const queuedRecord = await enqueueOfflineSession(summary, TEST_USER)
    expect(queuedRecord.id).toBe(sessionId)
    expect(queuedRecord.status).toBe('pending')

    // Verify backend is NOT called while offline
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    const mockClient = { rpc: mockRpc } as unknown as SupabaseClient

    const offlineAttempt = await syncPendingSessions(mockClient, TEST_USER)
    expect(offlineAttempt.syncedCount).toBe(0)
    expect(offlineAttempt.errors).toContain('Device is offline. Connect to internet to sync.')
    expect(mockRpc).not.toHaveBeenCalled()

    // Verify record is preserved in pending queue
    const pendingBeforeReconnect = await getPendingSessions(TEST_USER)
    expect(pendingBeforeReconnect).toHaveLength(1)
    expect(pendingBeforeReconnect[0].id).toBe(sessionId)
    expect(pendingBeforeReconnect[0].status).toBe('pending')

    // 4. Connectivity is restored (network reconnects)
    Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true })
    expect(navigator.onLine).toBe(true)

    // 5. Automatic synchronization fires upon reconnection
    const syncResult = await syncPendingSessions(mockClient, TEST_USER)
    expect(syncResult.syncedCount).toBe(1)
    expect(syncResult.failedCount).toBe(0)

    // Verify exactly one RPC call made to backend with full session payload
    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc).toHaveBeenCalledWith('save_session', {
      payload: expect.objectContaining({
        id: sessionId,
        exercise: 'biceps_curl',
        duration_ms: 150000,
      }),
    })

    // 6. Verify status in local store transitioned to 'synced'
    const allRecords = await getAllQueuedSessions(TEST_USER)
    expect(allRecords).toHaveLength(1)
    expect(allRecords[0].status).toBe('synced')
    expect(allRecords[0].syncedAt).toBeDefined()

    // 7. Verify pending queue is now completely clear
    const pendingAfterSync = await getPendingSessions(TEST_USER)
    expect(pendingAfterSync).toHaveLength(0)

    // 8. Subsequent sync attempts do NOT re-submit or duplicate the record
    const secondSyncResult = await syncPendingSessions(mockClient, TEST_USER)
    expect(secondSyncResult.syncedCount).toBe(0)
    expect(mockRpc).toHaveBeenCalledTimes(1) // Still exactly 1 call
  })
})
