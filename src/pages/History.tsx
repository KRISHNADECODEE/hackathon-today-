import { useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Calendar, ChevronRight, Filter, Loader2 } from 'lucide-react'
import { Badge, Button, Card, LinkButton, PageTitle, fmt, evidenceLabel, evidenceTone, mmss } from '../components/ui'
import { ProgressChart } from '../components/ProgressChart'
import { useUser } from '../lib/auth'
import { exerciseById } from '../lib/exercises'
import { supabase, SUPABASE_MISSING } from '../lib/supabase'
import { useSessions } from '../lib/useSessions'
import { useOfflineSync } from '../lib/pwa'
import { HardDrive, RefreshCw } from 'lucide-react'

/** Renders children only for a signed-in user; otherwise explains what to do. */
export function RequireUser({ children }: { children: (user: NonNullable<ReturnType<typeof useUser>>) => React.ReactNode }) {
  const user = useUser()
  const { pathname } = useLocation()
  if (!supabase) return <Notice title="Saved sessions are unavailable" body={SUPABASE_MISSING} />
  if (user === undefined) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted" aria-label="Loading" /></div>
  if (user === null) return <Notice title="Sign in to see your sessions" body="Saved sessions are private to the account that recorded them." action={<LinkButton to={`/auth?next=${pathname}`}>Sign in</LinkButton>} />
  return <>{children(user)}</>
}

export function Notice({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-20">
      <PageTitle title={title}>{body}</PageTitle>
      {action}
    </div>
  )
}

export default function History() {
  return <RequireUser>{(user) => <HistoryList user={user} />}</RequireUser>
}

function HistoryList({ user }: { user: NonNullable<ReturnType<typeof useUser>> }) {
  const { state, reload } = useSessions(user)
  const { queuedItems, isSyncing, triggerSync, isOnline } = useOfflineSync(user.id)
  const [selectedEx, setSelectedEx] = useState<string>('all')
  const [dateRange, setDateRange] = useState<'all' | '7d' | '30d'>('all')

  const pendingOffline = queuedItems.filter((q) => q.status !== 'synced')

  const rawSessions = state.kind === 'ok' ? state.data : undefined

  // Extract distinct exercises present in user's history
  const recordedExercises = useMemo(() => {
    if (!rawSessions) return []
    const ids = new Set<string>()
    rawSessions.forEach((s) => ids.add(s.exercise))
    return Array.from(ids).map((id) => ({
      id,
      name: exerciseById(id)?.name ?? id,
    }))
  }, [rawSessions])

  const [now] = useState(() => Date.now())

  // Filter sessions by exercise and date range
  const filteredSessions = useMemo(() => {
    if (!rawSessions) return []
    const cutoff =
      dateRange === '7d'
        ? 7 * 24 * 60 * 60 * 1000
        : dateRange === '30d'
        ? 30 * 24 * 60 * 60 * 1000
        : 0

    return rawSessions.filter((s) => {
      if (selectedEx !== 'all' && s.exercise !== selectedEx) return false
      if (cutoff > 0 && now - new Date(s.started_at).getTime() > cutoff) return false
      return true
    })
  }, [rawSessions, selectedEx, dateRange, now])

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <PageTitle eyebrow="Your records" title="Session History & Progress">
        Signed in as <span className="font-medium text-ink">{user.email}</span>. Only this account can read these sessions.
      </PageTitle>

      {state.kind === 'loading' && (
        <p className="flex items-center gap-2 text-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading sessions…
        </p>
      )}

      {state.kind === 'error' && (
        <Card className="p-5 mb-6">
          <p role="alert" className="text-danger">
            {state.auth
              ? 'Your sign-in has expired. Sign in again to see your sessions.'
              : `Sessions could not load: ${state.message}`}
          </p>
          <div className="mt-4">
            {state.auth ? <LinkButton to="/auth?next=/history">Sign in again</LinkButton> : <Button onClick={reload}>Retry</Button>}
          </div>
        </Card>
      )}

      {pendingOffline.length > 0 && (
        <Card className="mb-6 border-amber-300 bg-amber-50/40 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 text-amber-900 font-semibold text-sm">
              <HardDrive className="h-4 w-4 text-amber-600" />
              <span>Offline Sessions Stored on This Device ({pendingOffline.length})</span>
            </div>
            {isOnline && (
              <Button
                onClick={() => void triggerSync()}
                disabled={isSyncing}
                className="text-xs"
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Syncing...' : 'Sync to Cloud'}
              </Button>
            )}
          </div>
          <p className="text-xs text-amber-800 mb-3">
            These records were completed while offline. They are safely preserved in local IndexedDB storage and will automatically synchronize.
          </p>
          <ul className="divide-y divide-amber-200/60 rounded border border-amber-200 bg-white">
            {pendingOffline.map((item) => {
              const ex = exerciseById(item.summary.exercise)
              return (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs">
                  <div>
                    <span className="font-semibold text-ink">{ex?.name ?? item.summary.exercise}</span>
                    <span className="text-muted ml-2">({new Date(item.summary.startedAt).toLocaleString()})</span>
                    {item.lastError && (
                      <p className="text-rose-600 text-[11px] mt-0.5">{item.lastError}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{item.summary.validReps} reps</span>
                    <Badge tone={item.status === 'syncing' ? 'teal' : item.status === 'failed' ? 'danger' : 'amber'}>
                      {item.status === 'syncing' ? 'Syncing…' : item.status === 'failed' ? 'Sync Failed' : 'Pending Sync'}
                    </Badge>
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      {state.kind === 'ok' && state.data.length === 0 && (
        <Card className="p-8 text-center">
          <p className="font-display text-lg font-bold">No saved sessions yet</p>
          <p className="mt-1 text-sm text-muted">Complete an exercise set and it will appear here.</p>
          <LinkButton to="/exercises" className="mt-5">Explore Exercises</LinkButton>
        </Card>
      )}

      {state.kind === 'ok' && state.data.length > 0 && (
        <>
          {/* Filter Bar */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-rule bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5 text-muted" aria-hidden />
                <span className="font-semibold text-ink">Exercise:</span>
                <select
                  value={selectedEx}
                  onChange={(e) => setSelectedEx(e.target.value)}
                  className="rounded border border-rule bg-paper px-2.5 py-1.5 text-xs outline-none focus:border-teal"
                >
                  <option value="all">All Exercises ({state.data.length})</option>
                  {recordedExercises.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-muted" aria-hidden />
                <span className="font-semibold text-ink">Date range:</span>
                <select
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value as 'all' | '7d' | '30d')}
                  className="rounded border border-rule bg-paper px-2.5 py-1.5 text-xs outline-none focus:border-teal"
                >
                  <option value="all">All time</option>
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                </select>
              </div>
            </div>

            {(selectedEx !== 'all' || dateRange !== 'all') && (
              <button
                onClick={() => { setSelectedEx('all'); setDateRange('all') }}
                className="text-xs text-teal underline hover:text-ink"
              >
                Reset filters
              </button>
            )}
          </div>

          {/* Progress Chart */}
          <Card className="mb-6 p-5">
            <h2 className="mb-4 font-display text-lg font-bold text-ink">
              {selectedEx === 'all'
                ? 'Peak range of motion over time'
                : `${exerciseById(selectedEx)?.name ?? selectedEx} progress trend`}
            </h2>
            <ProgressChart
              sessions={filteredSessions}
              exerciseId={selectedEx !== 'all' ? selectedEx : undefined}
            />
          </Card>

          {/* Session Cards List */}
          <Card>
            {filteredSessions.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted">
                No sessions match the selected exercise and date filter.
              </div>
            ) : (
              <ul className="divide-y divide-rule">
                {filteredSessions.map((s) => {
                  const ex = exerciseById(s.exercise)
                  const unit = s.metric_unit ?? 'deg'
                  return (
                    <li key={s.id}>
                      <Link
                        to={`/history/${s.id}`}
                        className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 transition hover:bg-paper"
                      >
                        <div className="min-w-48 flex-1">
                          <p className="font-medium text-ink">
                            {ex?.name ?? s.exercise}
                            {s.side !== 'both' ? ` · ${s.side} side` : ''}
                          </p>
                          <p className="text-xs text-muted">
                            {new Date(s.started_at).toLocaleDateString()} at{' '}
                            {new Date(s.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>

                        <span className="font-mono text-xs">{s.valid_reps} reps</span>
                        <span className="font-mono text-xs">
                          {s.peak_rom_deg != null ? `peak ${fmt(s.peak_rom_deg, unit)}` : 'no peak'}
                        </span>
                        <span className="font-mono text-xs text-muted">{mmss(s.duration_ms)}</span>
                        <Badge tone={evidenceTone(s.evidence)}>{evidenceLabel[s.evidence]}</Badge>
                        <ChevronRight className="h-4 w-4 text-muted" aria-hidden />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
