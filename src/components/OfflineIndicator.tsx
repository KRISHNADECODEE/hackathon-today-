import { useEffect, useState } from 'react'
import { Wifi, WifiOff, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useOfflineSync, verifyMediaPipeOfflineAssets, type MediaPipeOfflineStatus } from '../lib/pwa'
import { useAuth } from '../lib/auth'

export function OfflineIndicator() {
  const { user } = useAuth()
  const { isOnline, stats, isSyncing, triggerSync, lastSyncResult } = useOfflineSync(user?.id)
  const [cvStatus, setCvStatus] = useState<MediaPipeOfflineStatus | null>(null)

  useEffect(() => {
    if (!isOnline) {
      void verifyMediaPipeOfflineAssets().then(setCvStatus)
    }
  }, [isOnline])

  // If online and nothing is queued or syncing, keep UI unobtrusive
  if (isOnline && stats.pending === 0 && stats.failed === 0 && !isSyncing && !lastSyncResult) {
    return null
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={`border-b px-4 py-2 text-xs transition-colors ${
        !isOnline
          ? 'bg-amber-50 text-amber-900 border-amber-200'
          : stats.failed > 0
          ? 'bg-rose-50 text-rose-900 border-rose-200'
          : isSyncing
          ? 'bg-teal-50 text-teal-900 border-teal-200'
          : 'bg-emerald-50 text-emerald-900 border-emerald-200'
      }`}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-medium">
          {!isOnline ? (
            <>
              <WifiOff className="h-4 w-4 text-amber-600 shrink-0" aria-hidden />
              <span>
                <strong>Offline Mode:</strong> Internet disconnected. Completed sessions will queue locally on this device.
              </span>
              {cvStatus && (
                <span className="hidden md:inline text-[11px] text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded ml-2">
                  {cvStatus.isReady ? '✓ Local pose model ready' : '⚠ Vision assets incomplete'}
                </span>
              )}
            </>
          ) : isSyncing ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin text-teal-600 shrink-0" aria-hidden />
              <span>Synchronizing queued offline records…</span>
            </>
          ) : stats.failed > 0 ? (
            <>
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" aria-hidden />
              <span>
                {stats.failed} offline {stats.failed === 1 ? 'record' : 'records'} could not synchronize.
              </span>
            </>
          ) : stats.pending > 0 ? (
            <>
              <Wifi className="h-4 w-4 text-teal-600 shrink-0" aria-hidden />
              <span>
                Online. {stats.pending} offline {stats.pending === 1 ? 'session' : 'sessions'} waiting to synchronize.
              </span>
            </>
          ) : lastSyncResult && lastSyncResult.synced > 0 ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden />
              <span>All queued offline sessions successfully synchronized to history.</span>
            </>
          ) : null}
        </div>

        {isOnline && (stats.pending > 0 || stats.failed > 0) && (
          <button
            onClick={() => void triggerSync()}
            disabled={isSyncing}
            className="inline-flex items-center gap-1.5 rounded bg-white px-2.5 py-1 text-xs font-semibold shadow-xs border border-rule hover:bg-paper transition disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} aria-hidden />
            {isSyncing ? 'Syncing…' : 'Sync now'}
          </button>
        )}
      </div>
    </div>
  )
}
