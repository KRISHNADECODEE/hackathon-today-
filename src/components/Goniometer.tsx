/**
 * Semicircular goniometer: 0° (arm at side) on the left, 180° (overhead) on the right.
 * The shaded band marks the configured target range; the needle shows the live angle.
 */
export function Goniometer({ angle, target, direction = 'up', size = 260, dark = true }: { angle: number | null; target: number; direction?: 'up' | 'down'; size?: number; dark?: boolean }) {
  const r = 100
  const pt = (d: number, rad = r) => {
    const a = Math.PI - (d * Math.PI) / 180
    return [120 + rad * Math.cos(a), 115 - rad * Math.sin(a)] as const
  }
  const arc = (from: number, to: number, rad = r) => {
    const [x1, y1] = pt(from, rad)
    const [x2, y2] = pt(to, rad)
    return `M ${x1} ${y1} A ${rad} ${rad} 0 0 1 ${x2} ${y2}`
  }
  const fg = dark ? '#ffffff' : '#0d1726'
  const ticks = Array.from({ length: 19 }, (_, i) => i * 10)
  const reached = angle !== null && (direction === 'up' ? angle >= target : angle <= target)
  const [bandFrom, bandTo] = direction === 'up' ? [target, 180] : [0, target]
  return (
    <svg viewBox="0 0 240 135" width={size} role="img" aria-label={angle === null ? 'Angle unavailable' : `${Math.round(angle)} degrees, target ${direction === 'up' ? 'at least' : 'at most'} ${target} degrees`}>
      <path d={arc(0, 180)} fill="none" stroke={fg} strokeOpacity={0.15} strokeWidth={14} />
      <path d={arc(bandFrom, bandTo)} fill="none" stroke="#17907f" strokeOpacity={reached ? 0.9 : 0.45} strokeWidth={14} />
      {ticks.map((t) => {
        const [x1, y1] = pt(t, 84)
        const [x2, y2] = pt(t, t % 30 === 0 ? 74 : 79)
        return <line key={t} x1={x1} y1={y1} x2={x2} y2={y2} stroke={fg} strokeOpacity={0.4} strokeWidth={1} />
      })}
      {[0, 90, 180].map((t) => {
        const [x, y] = pt(t, 62)
        return <text key={t} x={x} y={y + 3} textAnchor="middle" fontSize="9" fill={fg} fillOpacity={0.5} fontFamily="IBM Plex Mono">{t}°</text>
      })}
      {angle !== null && (() => {
        const [x, y] = pt(Math.min(180, Math.max(0, angle)), 106)
        return <line x1={120} y1={115} x2={x} y2={y} stroke={reached ? '#17907f' : fg} strokeWidth={2.5} strokeLinecap="round" style={{ transition: 'all 60ms linear' }} />
      })()}
      <circle cx={120} cy={115} r={5} fill={fg} />
    </svg>
  )
}
