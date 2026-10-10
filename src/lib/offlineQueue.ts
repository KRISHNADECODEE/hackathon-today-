import type { SupabaseClient } from '@supabase/supabase-js'
import type { SessionSummary } from './engine'
import { saveSession, supabase, type SessionRow } from './supabase'

export type OfflineSyncStatus = 'pending' | 'syncing' | 'synced' | 'failed'

export interface QueuedSession {
  id: string
  userId: string
  summary: SessionSummary
  status: OfflineSyncStatus
  queuedAt: string
  syncedAt?: string
  lastError?: string
  retryCount: number
}

/** Converts an offline queued session to a SessionRow for local dashboards and analytics */
export function queuedSessionToRow(q: QueuedSession): SessionRow {
  const s = q.summary
  return {
    id: s.id,
    user_id: q.userId,
    exercise: s.exercise,
    exercise_version: s.exerciseVersion,
    mode: s.mode,
    metric_label: s.metricLabel,
    metric_unit: s.metricUnit,
    direction: s.direction,
    side: s.side,
    started_at: s.startedAt,
    ended_at: s.endedAt,
    duration_ms: Math.round(s.durationMs),
    valid_reps: s.validReps,
    incomplete_reps: s.incompleteReps,
    peak_rom_deg: s.peak,
    mean_peak_rom_deg: s.meanPeak,
    tracking_quality: s.trackingQuality,
    torso_calibrated: s.calibrated,
    evidence: s.evidence,
    summary: s.extra ?? {},
    saved_at: q.queuedAt,
    plan_id: s.planId ?? null,
  }
}

const DB_NAME = 'kinectiq_offline_db'
const DB_VERSION = 1
const STORE_NAME = 'queued_sessions'

// In-memory fallback storage for environments without IndexedDB (e.g., node test environments or restricted web contexts)
const memoryStore = new Map<string, QueuedSession>()

function hasIndexedDB(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined'
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('by_user', 'userId', { unique: false })
        store.createIndex('by_status', 'status', { unique: false })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function notifyQueueChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('kinectiq:offline_queue_changed'))
  }
}

/**
 * Enqueue a session record into local IndexedDB storage when offline or saving locally.
 */
export async function enqueueOfflineSession(
  summary: SessionSummary,
  userId: string
): Promise<QueuedSession> {
  const queued: QueuedSession = {
    id: summary.id,
    userId,
    summary,
    status: 'pending',
    queuedAt: new Date().toISOString(),
    retryCount: 0,
  }

  if (!hasIndexedDB()) {
    memoryStore.set(queued.id, queued)
    notifyQueueChanged()
    return queued
  }

  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.put(queued)

    req.onsuccess = () => {
      notifyQueueChanged()
      resolve(queued)
    }
    req.onerror = () => reject(req.error)
  })
}

/**
 * Get all queued sessions, optionally filtered by user ID.
 */
export async function getAllQueuedSessions(userId?: string): Promise<QueuedSession[]> {
  if (!hasIndexedDB()) {
    const list = Array.from(memoryStore.values())
    return userId ? list.filter((s) => s.userId === userId) : list
  }

  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const req = store.getAll()

    req.onsuccess = () => {
      const all: QueuedSession[] = req.result || []
      resolve(userId ? all.filter((s) => s.userId === userId) : all)
    }
    req.onerror = () => reject(req.error)
  })
}

/**
 * Get pending or failed sessions that require synchronization.
 */
export async function getPendingSessions(userId?: string): Promise<QueuedSession[]> {
  const all = await getAllQueuedSessions(userId)
  return all.filter((s) => s.status === 'pending' || s.status === 'failed')
}

/**
 * Update an existing queued session's sync status.
 */
export async function updateQueuedSession(
  id: string,
  updates: Partial<Omit<QueuedSession, 'id'>>
): Promise<QueuedSession | null> {
  if (!hasIndexedDB()) {
    const existing = memoryStore.get(id)
    if (!existing) return null
    const updated = { ...existing, ...updates }
    memoryStore.set(id, updated)
    notifyQueueChanged()
    return updated
  }

  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const getReq = store.get(id)

    getReq.onsuccess = () => {
      const existing: QueuedSession | undefined = getReq.result
      if (!existing) return resolve(null)

      const updated = { ...existing, ...updates }
      const putReq = store.put(updated)
      putReq.onsuccess = () => {
        notifyQueueChanged()
        resolve(updated)
      }
      putReq.onerror = () => reject(putReq.error)
    }
    getReq.onerror = () => reject(getReq.error)
  })
}

/**
 * Remove a queued session by ID (e.g. after successful sync or explicit dismissal).
 */
export async function deleteQueuedSession(id: string): Promise<void> {
  if (!hasIndexedDB()) {
    memoryStore.delete(id)
    notifyQueueChanged()
    return
  }

  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.delete(id)
    req.onsuccess = () => {
      notifyQueueChanged()
      resolve()
    }
    req.onerror = () => reject(req.error)
  })
}

/**
 * Clear all offline records for a specific user.
 * Preserves shared-device privacy when a user signs out.
 */
export async function clearOfflineQueueForUser(userId: string): Promise<void> {
  if (!hasIndexedDB()) {
    for (const [id, s] of memoryStore.entries()) {
      if (s.userId === userId) memoryStore.delete(id)
    }
    notifyQueueChanged()
    return
  }

  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.getAll()

    req.onsuccess = () => {
      const all: QueuedSession[] = req.result || []
      for (const item of all) {
        if (item.userId === userId) {
          store.delete(item.id)
        }
      }
      notifyQueueChanged()
      resolve()
    }
    req.onerror = () => reject(req.error)
  })
}

/**
 * Concurrency guard to prevent parallel overlapping synchronizations.
 */
let syncInProgress = false

export interface SyncResult {
  syncedCount: number
  failedCount: number
  errors: string[]
}

/**
 * Synchronize all pending offline sessions for the currently authenticated user.
 * Ensures strict exactly-once semantics and prevents cross-user credential pollution.
 */
export async function syncPendingSessions(
  client: SupabaseClient | null = supabase,
  currentUserId: string
): Promise<SyncResult> {
  if (syncInProgress) {
    return { syncedCount: 0, failedCount: 0, errors: ['Sync already in progress'] }
  }

  if (!client || !currentUserId) {
    return {
      syncedCount: 0,
      failedCount: 0,
      errors: ['Valid client and authenticated user required to synchronize'],
    }
  }

  // Prevent sync attempts when offline
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      syncedCount: 0,
      failedCount: 0,
      errors: ['Device is offline. Connect to internet to sync.'],
    }
  }

  syncInProgress = true
  const result: SyncResult = { syncedCount: 0, failedCount: 0, errors: [] }

  try {
    const pending = await getPendingSessions(currentUserId)
    if (pending.length === 0) {
      return result
    }

    for (const item of pending) {
      // Security check: Never upload data belonging to another user on shared device
      if (item.userId !== currentUserId) {
        continue
      }

      await updateQueuedSession(item.id, { status: 'syncing' })

      try {
        await saveSession(item.summary, client)
        await updateQueuedSession(item.id, {
          status: 'synced',
          syncedAt: new Date().toISOString(),
          lastError: undefined,
        })
        result.syncedCount++
      } catch (err: unknown) {
        const message = (err as Error)?.message ?? 'Sync failed'
        const isDuplicate =
          message.toLowerCase().includes('duplicate') ||
          message.toLowerCase().includes('already exists') ||
          message.includes('23505')

        if (isDuplicate) {
          // If already recorded on backend, mark synced to avoid duplicate retries
          await updateQueuedSession(item.id, {
            status: 'synced',
            syncedAt: new Date().toISOString(),
            lastError: undefined,
          })
          result.syncedCount++
        } else {
          const isAuthError =
            message.toLowerCase().includes('unauthorized') ||
            message.toLowerCase().includes('auth') ||
            message.includes('401') ||
            message.includes('403')

          const friendlyError = isAuthError
            ? 'Authentication expired or invalid. Please sign in again.'
            : message

          await updateQueuedSession(item.id, {
            status: 'failed',
            lastError: friendlyError,
            retryCount: item.retryCount + 1,
          })
          result.failedCount++
          result.errors.push(`${item.id}: ${friendlyError}`)
        }
      }
    }
  } finally {
    syncInProgress = false
    notifyQueueChanged()
  }

  return result
}

/**
 * Returns overall queue statistics for display.
 */
export async function getQueueStats(userId?: string) {
  const all = await getAllQueuedSessions(userId)
  return {
    total: all.length,
    pending: all.filter((s) => s.status === 'pending').length,
    syncing: all.filter((s) => s.status === 'syncing').length,
    synced: all.filter((s) => s.status === 'synced').length,
    failed: all.filter((s) => s.status === 'failed').length,
  }
}
