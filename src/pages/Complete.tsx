import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, CloudOff, HardDrive, Loader2 } from 'lucide-react'
import { Badge, Button, Card, LinkButton, PageTitle, fmt, evidenceLabel, evidenceTone, mmss, pct } from '../components/ui'
import type { SessionSummary } from '../lib/engine'
import { exerciseById } from '../lib/exercises'
import { useUser } from '../lib/auth'
import { saveSession, supabase, SUPABASE_MISSING } from '../lib/supabase'
import { enqueueOfflineSession, syncPendingSessions } from '../lib/offlineQueue'
import { PENDING_KEY } from './Workspace'

type Save =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'queued'; message: string }
  | { kind: 'error'; message: string }

function readPending(): SessionSummary | null {
  try { return JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? 'null') } catch { return null }
}

export default function Complete() {
  const user = useUser()
  const [summary] = useState(readPending)
  const [save, setSave] = useState<Save>({ kind: 'idle' })

  const inFlight = useRef(false) // StrictMode runs effects twice; never send two saves at once
  const doSave = useCallback(async () => {
    if (!summary || inFlight.current) return
    inFlight.current = true
    setSave({ kind: 'saving' })

    // If offline and signed in, queue in IndexedDB immediately
    if (!navigator.onLine && user) {
      try {
        await enqueueOfflineSession(summary, user.id)
        sessionStorage.removeItem(PENDING_KEY)
        setSave({
          kind: 'queued',
          message: 'Offline: session safely queued on this device. It will automatically synchronize once reconnected.',
        })
      } catch (e) {
        setSave({ kind: 'error', message: `Could not save offline: ${(e as Error).message}` })
      } finally {
        inFlight.current = false
      }
      return
    }

    try {
      await saveSession(summary)
      sessionStorage.removeItem(PENDING_KEY) // only discard local copy once backend confirmed
      setSave({ kind: 'saved' })

      // Also trigger any previously queued sessions if online
      if (user) {
        void syncPendingSessions(supabase, user.id)
      }
    } catch (e) {
      if (!navigator.onLine && user) {
        try {
          await enqueueOfflineSession(summary, user.id)
          sessionStorage.removeItem(PENDING_KEY)
          setSave({
            kind: 'queued',
            message: 'Network offline: session queued in local storage. Will auto-sync when online.',
          })
          return
        } catch {
          // Fall through to error
        }
      }
      setSave({
        kind: 'error',
        message: navigator.onLine
          ? (e as Error).message
          : 'You appear to be offline. Your result is kept on this device; retry when connected.',
      })
    } finally {
      inFlight.current = false
    }
  }, [summary, user])

  // Save automatically once a signed-in user is known.
  useEffect(() => {
    if (user && summary && save.kind === 'idle') void doSave()
  }, [user, summary, save.kind, doSave])

  if (!summary)
    return (
      <div className="mx-auto max-w-xl px-4 py-20">
        <PageTitle title="No finished session here">Completed sessions appear on this screen right after you end an exercise.</PageTitle>
        <LinkButton to="/exercise">Start an exercise</LinkButton>
      </div>
    )

  const ex = exerciseById(summary.exercise)
  const isHold = summary.mode === 'hold'
  const stats = [
    ['Active duration', mmss(summary.durationMs)],
    [isHold ? 'Holds completed' : 'Valid reps', String(summary.validReps)],
    [isHold ? 'Aborted holds' : 'Not counted', String(summary.incompleteReps)],
    [summary.metricLabel ? `Best ${summary.metricLabel.toLowerCase()}` : 'Best peak', fmt(summary.peak, summary.metricUnit)],
    [isHold ? 'Target hold' : 'Mean peak per rep', isHold ? fmt((summary.extra?.target_hold_ms ?? 0) / 1000, 's') : fmt(summary.meanPeak, summary.metricUnit)],
    ['Reliable tracking', pct(summary.trackingQuality)],
  ]

  const title = `${ex?.name ?? summary.exercise}${summary.side === 'both' ? '' : ` · ${summary.side} side`}`

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <PageTitle eyebrow="Session complete" title={title}>
        {new Date(summary.startedAt).toLocaleString()} · measured values from this session only.
      </PageTitle>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge tone={evidenceTone(summary.evidence)}>{evidenceLabel[summary.evidence]}</Badge>
        {!summary.calibrated && <Badge tone="amber">Posture was never calibrated — no form check</Badge>}
        {save.kind === 'queued' && <Badge tone="amber">Pending Sync (Offline)</Badge>}
        {save.kind === 'saved' && <Badge tone="teal">Synchronized to Cloud</Badge>}
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-rule bg-rule md:grid-cols-3">
        {stats.map(([k, v]) => (
          <div key={k} className="bg-white p-5">
            <dt className="text-sm text-muted">{k}</dt>
            <dd className="mt-1 font-mono text-3xl">{v}</dd>
          </div>
        ))}
      </dl>

      <Card className="mt-6 p-5">
        <h2 className="font-display text-lg font-bold">Form warnings</h2>
        {summary.events.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{summary.calibrated ? 'No form warnings were detected.' : 'Not evaluated: posture calibration did not finish.'}</p>
        ) : (
          <ul className="mt-2 divide-y divide-rule text-sm">
            {summary.events.map((e, i) => (
              <li key={i} className="flex justify-between py-2">
                <span>{e.label}{e.repIndex ? ` during rep ${e.repIndex}` : ''} at {mmss(e.offsetMs)}</span>
                <span className="font-mono">{fmt(e.value, e.unit ?? 'deg')}{e.threshold != null ? ` (limit ${fmt(e.threshold, e.unit ?? 'deg')})` : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-6 flex flex-wrap items-center gap-4 p-5" >
        <div className="flex-1" aria-live="polite">
          {!supabase ? (
            <p className="flex items-center gap-2 text-sm text-danger"><CloudOff className="h-4 w-4" aria-hidden /> Not saved. {SUPABASE_MISSING}</p>
          ) : user === null ? (
            <p className="text-sm">Not saved yet. Sign in to save this session to your private history — it stays on this device until then.</p>
          ) : user === undefined ? null : save.kind === 'saving' ? (
            <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Saving to your history…</p>
          ) : save.kind === 'saved' ? (
            <p className="flex items-center gap-2 text-sm text-[#0e6457]"><CheckCircle2 className="h-4 w-4" aria-hidden /> Saved to {user.email}'s history.</p>
          ) : save.kind === 'queued' ? (
            <p className="flex items-center gap-2 text-sm text-amber-700"><HardDrive className="h-4 w-4" aria-hidden /> {save.message}</p>
          ) : save.kind === 'error' ? (
            <p className="text-sm text-danger">Not saved: {save.message}</p>
          ) : null}
        </div>
        {supabase && user === null && <LinkButton to="/auth?next=/complete">Sign in to save</LinkButton>}
        {save.kind === 'queued' && navigator.onLine && <Button onClick={doSave}>Sync now</Button>}
        {save.kind === 'error' && <Button onClick={doSave}>Retry save</Button>}
        <LinkButton to="/history" variant="ghost">Go to history</LinkButton>
      </Card>
      <p className="mt-4 text-xs text-muted">Saved data: timings, rep count, angles and form warnings. No video or images. <Link className="underline" to="/exercise">Start another session</Link></p>
    </div>
  )
}
