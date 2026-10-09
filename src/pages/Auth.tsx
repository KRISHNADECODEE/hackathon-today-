import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { HeartPulse, Stethoscope, Sparkles } from 'lucide-react'
import { useUser, type UserRole } from '../lib/auth'
import { Button, Card, PageTitle } from '../components/ui'
import { supabase, SUPABASE_MISSING } from '../lib/supabase'

const ROLES: { id: UserRole; title: string; subtitle: string; icon: typeof HeartPulse }[] = [
  {
    id: 'wellness',
    title: 'Everyday Wellness',
    subtitle: 'Desk breaks, posture awareness, habit streaks & quick routines',
    icon: Sparkles,
  },
  {
    id: 'patient',
    title: 'Rehab Patient',
    subtitle: 'Full-body physical therapy, ROM elevation & form guidance',
    icon: HeartPulse,
  },
  {
    id: 'professional',
    title: 'Physiotherapist / Clinician',
    subtitle: 'Prescribe exercise plans & audit patient adherence metrics',
    icon: Stethoscope,
  },
]

export default function Auth() {
  const [params] = useSearchParams()
  const raw = params.get('next') ?? ''
  const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard'
  const nav = useNavigate()
  const user = useUser()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [role, setRole] = useState<UserRole>('patient')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'error' | 'info'; text: string } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return setMsg({ tone: 'error', text: SUPABASE_MISSING })
    if (password.length < 8) return setMsg({ tone: 'error', text: 'Use a password with at least 8 characters.' })
    setBusy(true)
    setMsg(null)
    const res = mode === 'in'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: name.trim() || null,
              role,
            },
            emailRedirectTo: `${location.origin}/auth`,
          },
        })
    setBusy(false)
    if (res.error) return setMsg({ tone: 'error', text: res.error.message })
    if (!res.data.session) return setMsg({ tone: 'info', text: `Account created. Open the confirmation link sent to ${email}, then sign in.` })
    nav(next)
  }

  if (user) return <Navigate to={next} replace />

  const input = 'mt-1 w-full rounded-md border border-rule bg-white px-3 py-2.5 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal'

  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <PageTitle
        eyebrow="Account Access"
        title={mode === 'in' ? 'Sign in to KinectIQ' : 'Create your account'}
      >
        {mode === 'in'
          ? 'Access your private movement history, assigned plans, or clinician portal.'
          : 'Choose your role to customize your KinectIQ experience.'}
      </PageTitle>

      <Card className="p-6">
        <form onSubmit={submit} className="space-y-4" noValidate>
          {mode === 'up' && (
            <>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">
                  Select your experience profile
                </label>
                <div className="grid gap-2.5">
                  {ROLES.map((r) => {
                    const Icon = r.icon
                    const selected = role === r.id
                    return (
                      <button
                        type="button"
                        key={r.id}
                        onClick={() => setRole(r.id)}
                        className={`flex items-start gap-3 rounded-lg border p-3 text-left transition ${
                          selected
                            ? 'border-teal bg-teal-soft/40 shadow-xs'
                            : 'border-rule bg-white hover:border-rule-strong'
                        }`}
                      >
                        <div
                          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                            selected ? 'bg-teal text-white' : 'bg-paper text-muted'
                          }`}
                        >
                          <Icon className="h-4 w-4" aria-hidden />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-ink">{r.title}</p>
                          <p className="text-xs text-muted leading-relaxed mt-0.5">{r.subtitle}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
                {role === 'professional' && (
                  <p className="mt-2 text-xs text-amber-800 bg-amber-soft/60 rounded p-2 border border-amber/30">
                    Clinician accounts include plan assignment tools. Clinical patient record linking requires practitioner verification for privacy compliance.
                  </p>
                )}
              </div>

              <label className="block text-sm font-medium text-ink">
                Display name (optional)
                <input
                  className={input}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  autoComplete="nickname"
                  placeholder="e.g. Dr. Sarah Jenkins or Alex"
                />
              </label>
            </>
          )}

          <label className="block text-sm font-medium text-ink">
            Email address
            <input
              className={input}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
            />
          </label>

          <label className="block text-sm font-medium text-ink">
            Password
            <input
              className={input}
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
              placeholder="Minimum 8 characters"
            />
          </label>

          {msg && (
            <p
              role="alert"
              className={`rounded-md p-3 text-xs font-medium ${
                msg.tone === 'error'
                  ? 'bg-rose-50 text-danger border border-rose-200'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              }`}
            >
              {msg.text}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={busy || !email}>
            {busy ? 'Working…' : mode === 'in' ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        <div className="mt-5 border-t border-rule pt-4 text-center">
          <button
            type="button"
            className="text-sm text-muted hover:text-ink transition"
            onClick={() => {
              setMode(mode === 'in' ? 'up' : 'in')
              setMsg(null)
            }}
          >
            {mode === 'in' ? "Don't have an account? Create one" : 'Already have an account? Sign in'}
          </button>
        </div>
      </Card>
    </div>
  )
}
