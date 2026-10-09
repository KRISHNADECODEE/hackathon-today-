/** Linear meter for metrics with a small range or non-degree units. Target zone shaded. */
export function Meter({ value, target, max, direction }: { value: number | null; target: number; max: number; direction: 'up' | 'down' }) {
  const pos = (v: number) => `${Math.min(100, Math.max(0, (v / max) * 100))}%`
  const reached = value !== null && (direction === 'up' ? value >= target : value <= target)
  return (
    <div className="w-full py-6" aria-hidden>
      <div className="relative h-3 rounded-full bg-white/10">
        <div className="absolute inset-y-0 rounded-full bg-teal/40" style={direction === 'up' ? { left: pos(target), right: 0 } : { left: 0, width: pos(target) }} />
        {value !== null && <div className={`absolute -top-1.5 h-6 w-1.5 -translate-x-1/2 rounded ${reached ? 'bg-teal' : 'bg-white'}`} style={{ left: pos(value), transition: 'left 60ms linear' }} />}
      </div>
    </div>
  )
}
