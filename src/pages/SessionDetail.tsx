import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Loader2 } from 'lucide-react'
import { Badge, Button, Card, LinkButton, PageTitle, deg, fmt, evidenceLabel, evidenceTone, mmss, pct } from '../components/ui'
import { exerciseById } from '../lib/exercises'
import { supabase, type EventRow, type RepRow, type SessionRow } from '../lib/supabase'
import type { Load } from '../lib/useSessions'
import { RequireUser } from './History'

type Detail = { session: SessionRow; reps: RepRow[]; events: EventRow[] } | null

export default function SessionDetail() {
  return <RequireUser>{() => <DetailView />}</RequireUser>
}

function DetailView() {
  const { id = '' } = useParams()
  const [state, setState] = useState<Load<Detail>>({ kind: 'loading' })
  const load = useCallback(async () => {
    setState({ kind: 'loading' })
    const [s, r, e] = await Promise.all([
      supabase!.from('exercise_sessions').select('*').eq('id', id).maybeSingle(),
      supabase!.from('rep_metrics').select('*').eq('session_id', id).order('rep_index'),
      supabase!.from('form_events').select('*').eq('session_id', id).order('occurred_at'),
    ])
    const err = s.error ?? r.error ?? e.error
    if (err) return setState({ kind: 'error', message: err.message })
    setState({ kind: 'ok', data: s.data ? { session: s.data as SessionRow, reps: (r.data ?? []) as RepRow[], events: (e.data ?? []) as EventRow[] } : null })
  }, [id])
  useEffect(() => { void load() }, [load])

  if (state.kind === 'loading') return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted" aria-label="Loading" /></div>
  if (state.kind === 'error')
    return <div className="mx-auto max-w-xl px-4 py-20"><p role="alert" className="text-danger">Session could not load: {state.message}</p><Button className="mt-4" onClick={load}>Retry</Button></div>
  // RLS returns no row for sessions owned by someone else, so "missing" and "not yours" look identical by design.
  if (!state.data)
    return <div className="mx-auto max-w-xl px-4 py-20"><PageTitle title="Session not available">It does not exist or belongs to another account.</PageTitle><LinkButton to="/history">Back to history</LinkButton></div>

  const { session: s, reps, events } = state.data
  const start = new Date(s.started_at).getTime()
  const ex = exerciseById(s.exercise)
  const isHold = s.mode === 'hold'
  const unit = s.metric_unit ?? 'deg'
  const target = ex?.track?.reps?.target ?? (ex?.track?.hold?.targetHoldMs ? ex.track.hold.targetHoldMs / 1000 : null)
  const isDeg = unit === 'deg'
  const title = `${ex?.name ?? s.exercise}${s.side === 'both' ? '' : ` · ${s.side} side`}`

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <PageTitle eyebrow="Session evidence" title={title}>
        {new Date(s.started_at).toLocaleString()} – {new Date(s.ended_at).toLocaleTimeString()} · saved {new Date(s.saved_at).toLocaleString()}
      </PageTitle>
      <div className="mb-6 flex flex-wrap gap-2">
        <Badge tone={evidenceTone(s.evidence)}>{evidenceLabel[s.evidence]}</Badge>
        {!s.torso_calibrated && <Badge tone="amber">Posture not calibrated</Badge>}
      </div>

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-rule bg-rule md:grid-cols-5">
        {[
          ['Active duration', mmss(s.duration_ms), 'measured'],
          [isHold ? 'Holds completed' : 'Valid reps', String(s.valid_reps), 'measured'],
          [s.metric_label || 'Peak', fmt(s.peak_rom_deg, unit), 'measured'],
          [isHold ? 'Target hold' : 'Mean peak', isHold ? fmt(target, 's') : fmt(s.mean_peak_rom_deg, unit), 'derived'],
          ['Reliable tracking', pct(s.tracking_quality), 'derived'],
        ].map(([k, v, kind]) => (
          <div key={k} className="bg-white p-4">
            <dt className="flex justify-between text-sm text-muted">{k}<span className="font-mono text-[10px] uppercase">{kind}</span></dt>
            <dd className="mt-1 font-mono text-2xl">{v}</dd>
          </div>
        ))}
      </dl>

      <Card className="mt-6 p-5">
        <h2 className="mb-4 font-display text-lg font-bold">{s.metric_label || 'Peak value'} per rep</h2>
        {reps.length === 0 ? <p className="text-sm text-muted">No completed reps were recorded in this session.</p> : (
          <>
            <div className="h-56" role="img" aria-label={`${s.metric_label || 'Peak'} for each repetition`}>
              <ResponsiveContainer>
                <BarChart data={reps.map((r) => ({ rep: `#${r.rep_index}`, peak: r.peak_rom_deg == null ? null : Math.round(r.peak_rom_deg) }))} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke="#d9e0e7" vertical={false} />
                  <XAxis dataKey="rep" tick={{ fontSize: 12, fill: '#5b6878' }} tickLine={false} axisLine={false} />
                  <YAxis domain={isDeg ? [0, 180] : [0, 'auto']} ticks={isDeg ? [0, 45, 90, 135, 180] : undefined} tick={{ fontSize: 12, fill: '#5b6878' }} tickLine={false} axisLine={false} unit={isDeg ? '°' : ''} />
                  {target != null && <ReferenceLine y={target} stroke="#17907f" strokeDasharray="4 4" label={{ value: 'target', fontSize: 11, fill: '#17907f', position: 'insideTopLeft' }} />}
                  <Tooltip formatter={(v) => fmt(Number(v), unit)} />
                  <Bar dataKey="peak" name={s.metric_label || 'Peak'} fill="#0d1726" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-muted"><tr><th className="py-2 font-medium">{isHold ? 'Hold' : 'Rep'}</th><th className="font-medium">{s.metric_label || 'Peak'}</th><th className="font-medium">Duration</th><th className="font-medium">Max check deviation</th><th className="font-medium">Reliable frames</th></tr></thead>
                <tbody className="divide-y divide-rule font-mono">
                  {reps.map((r) => (
                    <tr key={r.rep_index}>
                      <td className="py-2">{r.rep_index}</td>
                      <td>{fmt(r.peak_rom_deg, unit)}</td>
                      <td>{r.duration_ms == null ? '—' : `${(r.duration_ms / 1000).toFixed(1)} s`}</td>
                      <td>{r.max_torso_deviation_deg == null ? <span className="text-muted">not measured</span> : deg(r.max_torso_deviation_deg)}</td>
                      <td>{pct(r.tracking_quality)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <Card className="mt-6 p-5">
        <h2 className="font-display text-lg font-bold">Form events</h2>
        {events.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{s.torso_calibrated ? 'No form check warnings were recorded.' : 'Not evaluated: posture calibration did not finish.'}</p>
        ) : (
          <ul className="mt-2 divide-y divide-rule text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{(e.metadata?.label as string) || e.event_type} at <span className="font-mono">{mmss(new Date(e.occurred_at).getTime() - start)}</span>{e.metadata?.rep_index ? ` · rep ${e.metadata.rep_index}` : ''}</span>
                <span className="font-mono">{fmt(e.deviation_deg, (e.metadata?.unit as string) || 'deg')}{e.metadata?.threshold != null ? ` (limit ${fmt(Number(e.metadata.threshold), (e.metadata?.unit as string) || 'deg')})` : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="mt-4 text-xs text-muted">Angles and metrics are image-plane estimates from a webcam pose model, not calibrated goniometer readings.</p>
    </div>
  )
}
