import { useCallback, useEffect, useState } from 'react'
import { syncPendingSessions, getQueueStats, type QueuedSession, getAllQueuedSessions } from './offlineQueue'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase'

export interface MediaPipeOfflineStatus {
  isChecking: boolean
  isReady: boolean
  missingAssets: string[]
}

const REQUIRED_OFFLINE_CV_ASSETS = [
  '/mediapipe/pose_landmarker_lite.task',
  '/mediapipe/wasm/vision_wasm_internal.wasm',
  '/mediapipe/wasm/vision_wasm_internal.js',
]

/**
 * Register Service Worker for PWA shell and offline asset caching.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null
  }

  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    return reg
  } catch (err) {
    console.warn('[PWA] Service worker registration failed:', err)
    return null
  }
}

/**
 * Verifies that all required MediaPipe model and WASM binaries are available locally,
 * either in the browser CacheStorage or responding with HTTP 200 locally.
 * Must be verified before claiming camera-based exercise tracking works offline.
 */
export async function verifyMediaPipeOfflineAssets(): Promise<MediaPipeOfflineStatus> {
  const missingAssets: string[] = []

  // Check CacheStorage first if available
  let mpCache: Cache | null = null
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      mpCache = await caches.open('kinectiq-mediapipe-v1')
    } catch {
      mpCache = null
    }
  }

  for (const assetPath of REQUIRED_OFFLINE_CV_ASSETS) {
    let available = false
    if (mpCache) {
      const match = await mpCache.match(assetPath)
      if (match && match.status === 200) {
        available = true
      }
    }

    if (!available && typeof fetch !== 'undefined') {
      try {
        const headRes = await fetch(assetPath, { method: 'HEAD' })
        if (headRes.ok) {
          available = true
        }
      } catch {
        available = false
      }
    }

    if (!available) {
      missingAssets.push(assetPath)
    }
  }

  return {
    isChecking: false,
    isReady: missingAssets.length === 0,
    missingAssets,
  }
}

/**
 * React hook to observe offline status, pending sync count, and trigger auto-sync on reconnect.
 */
export function useOfflineSync(userId?: string, client: SupabaseClient | null = supabase) {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean' ? navigator.onLine : true
  )
  const [stats, setStats] = useState({ total: 0, pending: 0, syncing: 0, synced: 0, failed: 0 })
  const [queuedItems, setQueuedItems] = useState<QueuedSession[]>([])
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastSyncResult, setLastSyncResult] = useState<{ synced: number; failed: number } | null>(null)

  const refreshQueue = useCallback(async () => {
    try {
      const currentStats = await getQueueStats(userId)
      const items = await getAllQueuedSessions(userId)
      setStats(currentStats)
      setQueuedItems(items)
    } catch {
      // Ignored if storage is restricted
    }
  }, [userId])

  const triggerSync = useCallback(async () => {
    if (!userId || !isOnline || isSyncing) return
    setIsSyncing(true)
    try {
      const result = await syncPendingSessions(client, userId)
      setLastSyncResult({ synced: result.syncedCount, failed: result.failedCount })
      await refreshQueue()
    } finally {
      setIsSyncing(false)
    }
  }, [userId, isOnline, isSyncing, client, refreshQueue])

  useEffect(() => {
    void refreshQueue()

    const handleOnline = () => {
      setIsOnline(true)
      if (userId) {
        void triggerSync()
      }
    }

    const handleOffline = () => {
      setIsOnline(false)
    }

    const handleQueueChange = () => {
      void refreshQueue()
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('kinectiq:offline_queue_changed', handleQueueChange)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('kinectiq:offline_queue_changed', handleQueueChange)
    }
  }, [userId, isOnline, refreshQueue, triggerSync])

  return {
    isOnline,
    stats,
    queuedItems,
    isSyncing,
    lastSyncResult,
    triggerSync,
    refreshQueue,
  }
}
