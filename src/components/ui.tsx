import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'

const variants = {
  primary: 'bg-teal text-white hover:bg-[#127a6b]',
  dark: 'bg-ink text-white hover:bg-slate',
  ghost: 'border border-rule bg-white text-ink hover:bg-paper',
  onDark: 'border border-white/20 text-white hover:bg-white/10',
}
const base = 'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50'

export function Button({ variant = 'primary', className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants }) {
  return <button {...p} className={`${base} ${variants[variant]} ${className}`} />
}

export function LinkButton({ to, variant = 'primary', children, className = '' }: { to: string; variant?: keyof typeof variants; children: ReactNode; className?: string }) {
  return <Link to={to} className={`${base} ${variants[variant]} ${className}`}>{children}</Link>
}

export function Card({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return <div onClick={onClick} className={`rounded-lg border border-rule bg-white ${className}`}>{children}</div>
}

const tones = {
  teal: 'bg-teal-soft text-[#0e6457]',
  amber: 'bg-amber-soft text-[#7a4f0e]',
  danger: 'bg-[#f8e1df] text-danger',
  neutral: 'bg-paper text-muted border border-rule',
}
export function Badge({ tone = 'neutral', className = '', children }: { tone?: keyof typeof tones; className?: string; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}>{children}</span>
}

export const evidenceTone = (e: string) => (e === 'complete' ? 'teal' : e === 'partial' ? 'amber' : 'neutral') as keyof typeof tones
export const evidenceLabel: Record<string, string> = {
  complete: 'Complete evidence',
  partial: 'Partial evidence',
  insufficient: 'Insufficient evidence',
}

export const deg = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v)}°`)
export const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`)
export const mmss = (ms: number) => {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function PageTitle({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-8">
      {eyebrow && <p className="mb-2 font-mono text-xs uppercase tracking-widest text-teal">{eyebrow}</p>}
      <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
      {children && <div className="mt-3 max-w-2xl text-muted">{children}</div>}
    </div>
  )
}

/** Formats a metric value in its unit; '—' when unavailable. */
export const fmt = (v: number | null | undefined, unit: string) =>
  v == null || !Number.isFinite(v) ? '—' : unit === 'deg' ? `${Math.round(v)}°` : unit === 'pct' ? `${v.toFixed(1)}%` : `${v.toFixed(1)} s`
