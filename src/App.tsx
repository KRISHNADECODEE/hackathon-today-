import { Component, type ReactNode } from 'react'
import { BrowserRouter, Link, NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import { Activity } from 'lucide-react'
import { useAuth } from './lib/auth'
import { supabase } from './lib/supabase'
import { useDeskReminders } from './lib/useDeskReminders'
import { ReminderToast } from './components/ReminderToast'
import { OfflineIndicator } from './components/OfflineIndicator'
import { clearOfflineQueueForUser } from './lib/offlineQueue'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import ExerciseLibrary from './pages/ExerciseLibrary'
import ExerciseDetail from './pages/ExerciseDetail'
import Mode from './pages/Mode'
import Auth from './pages/Auth'
import Workspace from './pages/Workspace'
import Complete from './pages/Complete'
import History from './pages/History'
import SessionDetail from './pages/SessionDetail'
import Settings from './pages/Settings'
import Clinician from './pages/Clinician'
import WellnessHub from './pages/WellnessHub'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto max-w-xl px-4 py-20">
        <h1 className="font-display text-2xl font-bold">This screen hit an error</h1>
        <p className="mt-2 text-muted">{this.state.error.message}</p>
        <a className="mt-6 inline-block font-semibold text-teal underline" href="/">Reload KinectIQ</a>
      </div>
    )
  }
}

function Header() {
  const { user, profile } = useAuth()
  const nav = useNavigate()
  const link = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium transition whitespace-nowrap ${isActive ? 'text-white' : 'text-white/60 hover:text-white'}`

  const isProfessional = profile?.role === 'professional'
  const isWellness = profile?.role === 'wellness'

  return (
    <header className="bg-ink text-white border-b border-white/10 sticky top-0 z-40">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link to="/" className="flex items-center gap-2 font-display text-lg font-extrabold tracking-tight shrink-0">
          <Activity className="h-5 w-5 text-teal" aria-hidden /> KinectIQ
        </Link>
        <nav className="flex flex-1 items-center gap-5 overflow-x-auto">
          {isProfessional ? (
            <>
              <NavLink to="/clinician" className={link}>Clinician Portal</NavLink>
              <NavLink to="/dashboard" className={link}>Overview</NavLink>
              <NavLink to="/wellness" className={link}>Wellness</NavLink>
              <NavLink to="/exercises" className={link}>Exercise Catalog</NavLink>
              <NavLink to="/exercise" className={link}>Camera Test</NavLink>
              <NavLink to="/history" className={link}>Audit History</NavLink>
            </>
          ) : isWellness ? (
            <>
              <NavLink to="/wellness" className={link}>Wellness Hub</NavLink>
              <NavLink to="/dashboard" className={link}>Overview</NavLink>
              <NavLink to="/exercise?id=posture" className={link}>Posture Check</NavLink>
              <NavLink to="/exercises" className={link}>Exercise Library</NavLink>
              <NavLink to="/history" className={link}>History</NavLink>
            </>
          ) : (
            <>
              <NavLink to="/dashboard" className={link}>Dashboard</NavLink>
              <NavLink to="/wellness" className={link}>Wellness</NavLink>
              <NavLink to="/exercises" className={link}>Exercises</NavLink>
              <NavLink to="/exercise" className={link}>Live Session</NavLink>
              <NavLink to="/history" className={link}>History</NavLink>
              <NavLink to="/clinician" className={link}>Clinician</NavLink>
            </>
          )}
          <NavLink to="/settings" className={link}>Settings</NavLink>
        </nav>
        {user ? (
          <div className="flex items-center gap-3 text-sm shrink-0">
            {profile?.role === 'professional' && (
              <span
                className={`hidden md:inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${
                  profile.is_verified_professional
                    ? 'bg-teal/20 text-teal border border-teal/40'
                    : 'bg-amber/20 text-amber border border-amber/40'
                }`}
                title={profile.is_verified_professional ? 'Verified Provider' : 'Practitioner Verification Pending'}
              >
                {profile.is_verified_professional ? 'Verified Clinician' : 'Clinician (Preview)'}
              </span>
            )}
            {profile?.role === 'wellness' && (
              <span className="hidden md:inline-flex items-center rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-300 border border-emerald-500/30">
                Wellness
              </span>
            )}
            {profile?.role === 'patient' && (
              <span className="hidden md:inline-flex items-center rounded bg-white/10 px-2 py-0.5 text-xs font-semibold text-white/70 border border-white/20">
                Patient
              </span>
            )}
            <span className="hidden max-w-36 truncate text-white/70 sm:inline" title={user.email}>
              {profile?.display_name || user.email}
            </span>
            <button
              className="text-white/80 hover:text-white transition text-xs font-medium"
              onClick={async () => {
                if (user) {
                  await clearOfflineQueueForUser(user.id)
                }
                await supabase?.auth.signOut()
                nav('/')
              }}
            >
              Sign out
            </button>
          </div>
        ) : (
          <Link to="/auth" className="text-sm font-medium text-white/80 hover:text-white shrink-0">
            Sign in
          </Link>
        )}
      </div>
    </header>
  )
}

function AppShell() {
  const { activeAlert, dismissAlert, snoozeReminder } = useDeskReminders()

  return (
    <>
      <Header />
      <OfflineIndicator />
      <ReminderToast alert={activeAlert} onDismiss={dismissAlert} onSnooze={snoozeReminder} />
      <ErrorBoundary>
        <main>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/wellness" element={<WellnessHub />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/exercises" element={<ExerciseLibrary />} />
            <Route path="/exercises/:id" element={<ExerciseDetail />} />
            <Route path="/start" element={<Mode />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/exercise" element={<Workspace />} />
            <Route path="/complete" element={<Complete />} />
            <Route path="/history" element={<History />} />
            <Route path="/history/:id" element={<SessionDetail />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/clinician" element={<Clinician />} />
            <Route path="*" element={<div className="mx-auto max-w-xl px-4 py-20"><h1 className="font-display text-2xl font-bold">Page not found</h1><Link className="mt-4 inline-block text-teal underline" to="/">Go to the start page</Link></div>} />
          </Routes>
        </main>
      </ErrorBoundary>
      <footer className="mx-auto max-w-6xl px-4 py-10 text-xs text-muted">
        KinectIQ is a prototype rehabilitation and exercise assessment platform. It is not a medical device, does not diagnose clinical conditions, and has not been clinically validated.
      </footer>
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  )
}
