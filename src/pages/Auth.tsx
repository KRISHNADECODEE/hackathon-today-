import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useUser } from '../lib/auth'
import { Button, Card, PageTitle } from '../components/ui'
import { supabase, SUPABASE_MISSING } from '../lib/supabase'

export default function Auth() {
  const [params] = useSearchParams()
  const raw = params.get('next') ?? ''
  const next = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/history' // only local redirects
  const nav = useNavigate()
  const user = useUser()
  const [mode, setMode] = useState<'in' | 'up'>('in')
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
      : await supabase.auth.signUp({ email, password, options: { data: { display_name: name.trim() || null }, emailRedirectTo: `${location.origin}/auth` } })
    setBusy(false)
    if (res.error) return setMsg({ tone: 'error', text: res.error.message })
    if (!res.data.session) return setMsg({ tone: 'info', text: `Account created. Open the confirmation link sent to ${email}, then sign in.` })
    nav(next)
  }

  if (user) return <Navigate to={next} replace /> // e.g. arriving from the email confirmation link

  const input = 'mt-1 w-full rounded-md border border-rule bg-white px-3 py-2.5 text-sm'
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <PageTitle eyebrow="Patient account" title={mode === 'in' ? 'Sign in' : 'Create an account'}>
        Your account keeps your saved sessions private to you.
      </PageTitle>
      <Card className="p-6">
        <form onSubmit={submit} className="space-y-4" noValidate>
          {mode === 'up' && (
            <label className="block text-sm font-medium">Display name (optional)
              <input className={input} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="nickname" />
            </label>
          )}
          <label className="block text-sm font-medium">Email
            <input className={input} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </label>
          <label className="block text-sm font-medium">Password
            <input className={input} type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} />
          </label>
          {msg && <p role="alert" className={`text-sm ${msg.tone === 'error' ? 'text-danger' : 'text-[#0e6457]'}`}>{msg.text}</p>}
          <Button type="submit" className="w-full" disabled={busy || !email}>{busy ? 'Working…' : mode === 'in' ? 'Sign in' : 'Create account'}</Button>
        </form>
        <button className="mt-4 text-sm text-muted hover:text-ink" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(null) }}>
          {mode === 'in' ? 'New here? Create an account' : 'Already have an account? Sign in'}
        </button>
      </Card>
    </div>
  )
}
