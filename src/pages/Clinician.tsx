import { Loader2, Lock } from 'lucide-react'
import { Card, PageTitle, deg, pct } from '../components/ui'
import { ProgressChart } from '../components/ProgressChart'
import { useUser } from '../lib/auth'
import { useSessions } from '../lib/useSessions'
import { RequireUser } from './History'

export default function Clinician() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <PageTitle eyebrow="Clinician view" title="Exercise evidence dashboard" />
      <Card className="mb-8 flex gap-4 border-amber/40 bg-amber-soft p-5">
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber" aria-hidden />
        <div>
          <h2 className="font-semibold">Patient access is locked in this version</h2>
          <p className="mt-1 text-sm text-[#5c3d0b]">
            Viewing assigned patients needs a consent and authorization model that is not built yet. No other person's records can be
            opened here. The dashboard below shows only the signed-in account's own sessions, to preview the layout.
          </p>
        </div>
      </Card>
      <RequireUser>{(user) => <OwnDashboard user={user} />}</RequireUser>
    </div>
  )
}

function OwnDashboard({ user }: { user: NonNullable<ReturnType<typeof useUser>> }) {
  const { state } = useSessions(user)
  if (state.kind === 'loading') return <Loader2 className="h-5 w-5 animate-spin text-muted" aria-label="Loading" />
  if (state.kind === 'error') return <p role="alert" className="text-danger">Sessions could not load: {state.message}</p>
  const rows = state.data
  const withPeak = rows.filter((r) => r.peak_rom_deg != null)
  const q = rows.filter((r) => r.tracking_quality != null)
  const tiles = [
    ['Sessions saved', String(rows.length)],
    ['Valid reps, all sessions', String(rows.reduce((a, r) => a + r.valid_reps, 0))],
    ['Best peak elevation', withPeak.length ? deg(Math.max(...withPeak.map((r) => r.peak_rom_deg!))) : '—'],
    ['Avg reliable tracking', q.length ? pct(q.reduce((a, r) => a + r.tracking_quality!, 0) / q.length) : '—'],
  ]
  return (
    <>
      <p className="mb-4 text-sm text-muted">Records for <span className="font-medium text-ink">{user.email}</span> (your own account)</p>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-rule bg-rule md:grid-cols-4">
        {tiles.map(([k, v]) => (
          <div key={k} className="bg-white p-5"><dt className="text-sm text-muted">{k}</dt><dd className="mt-1 font-mono text-3xl">{v}</dd></div>
        ))}
      </dl>
      <Card className="mt-6 p-5">
        <h2 className="mb-4 font-display text-lg font-bold">Peak elevation trend</h2>
        <ProgressChart sessions={rows} />
      </Card>
      <Card className="mt-6 p-5">
        <h2 className="font-display text-lg font-bold">Evidence completeness</h2>
        {rows.length === 0 ? <p className="mt-2 text-sm text-muted">No saved sessions yet.</p> : (
          <ul className="mt-3 space-y-2 text-sm">
            {(['complete', 'partial', 'insufficient'] as const).map((k) => {
              const n = rows.filter((r) => r.evidence === k).length
              return (
                <li key={k} className="flex items-center gap-3">
                  <span className="w-24 capitalize">{k}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded bg-paper"><span className={`block h-full ${k === 'complete' ? 'bg-teal' : k === 'partial' ? 'bg-amber' : 'bg-muted'}`} style={{ width: `${(n / rows.length) * 100}%` }} /></span>
                  <span className="w-8 text-right font-mono">{n}</span>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </>
  )
}
