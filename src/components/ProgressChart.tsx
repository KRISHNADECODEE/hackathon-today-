import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { exerciseById } from '../lib/exercises'
import { fmt } from './ui'
import type { SessionRow } from '../lib/supabase'

/** Peak elevation per saved session. Sessions without a measured peak are left out, not filled in. */
export function ProgressChart({ sessions, exerciseId }: { sessions: SessionRow[]; exerciseId?: string }) {
  const exId = exerciseId ?? sessions[0]?.exercise
  const ex = exerciseById(exId)
  const target = ex?.track?.reps?.target ?? (ex?.track?.hold?.targetHoldMs ? ex.track.hold.targetHoldMs / 1000 : 80)
  const unit = sessions[0]?.metric_unit ?? 'deg'

  const points = sessions
    .filter((s) => s.peak_rom_deg != null && (!exerciseId || s.exercise === exerciseId))
    .map((s) => ({
      date: new Date(s.started_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      peak: Math.round(s.peak_rom_deg!),
      mean: s.mean_peak_rom_deg == null ? null : Math.round(s.mean_peak_rom_deg),
    }))
    .reverse()

  if (points.length < 2) return <p className="text-sm text-muted">A progress chart appears after two or more saved sessions with measured reps.</p>

  const isDeg = unit === 'deg'
  return (
    <div className="h-64" role="img" aria-label={`Peak ${ex?.track?.metric.label ?? 'metric'} across ${points.length} sessions`}>
      <ResponsiveContainer>
        <LineChart data={points} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid stroke="#d9e0e7" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#5b6878' }} tickLine={false} axisLine={false} />
          <YAxis domain={isDeg ? [0, 180] : [0, 'auto']} ticks={isDeg ? [0, 45, 90, 135, 180] : undefined} tick={{ fontSize: 12, fill: '#5b6878' }} tickLine={false} axisLine={false} unit={isDeg ? '°' : ''} />
          {target != null && <ReferenceLine y={target} stroke="#17907f" strokeDasharray="4 4" label={{ value: 'target', fontSize: 11, fill: '#17907f', position: 'insideTopLeft' }} />}
          <Tooltip formatter={(v) => fmt(Number(v), unit)} />
          <Line type="monotone" dataKey="peak" name="Peak" stroke="#0d1726" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="mean" name="Mean peak" stroke="#17907f" strokeWidth={2} dot={{ r: 2 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
