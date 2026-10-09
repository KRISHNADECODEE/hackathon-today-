import { Component, type ReactNode } from 'react'
import { BrowserRouter, Link, NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import { Activity } from 'lucide-react'
import { useUser } from './lib/auth'
import { supabase } from './lib/supabase'
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
  const user = useUser()
  const nav = useNavigate()
  const link = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium transition ${isActive ? 'text-white' : 'text-white/60 hover:text-white'}`

  return (
    <header className="bg-ink text-white border-b border-white/10">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
        <Link to="/" className="flex items-center gap-2 font-display text-lg font-extrabold tracking-tight">
          <Activity className="h-5 w-5 text-teal" aria-hidden /> KinectIQ
        </Link>
        <nav className="flex flex-1 items-center gap-5 overflow-x-auto">
          <NavLink to="/dashboard" className={link}>Dashboard</NavLink>
          <NavLink to="/exercises" className={link}>Exercises</NavLink>
          <NavLink to="/exercise" className={link}>Live Session</NavLink>
          <NavLink to="/history" className={link}>History</NavLink>
          <NavLink to="/settings" className={link}>Settings</NavLink>
          <NavLink to="/clinician" className={link}>Clinician</NavLink>
        </nav>
        {user ? (
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden max-w-44 truncate text-white/60 sm:inline">{user.email}</span>
            <button className="text-white/80 hover:text-white" onClick={async () => { await supabase?.auth.signOut(); nav('/') }}>Sign out</button>
          </div>
        ) : (
          <Link to="/auth" className="text-sm font-medium text-white/80 hover:text-white">Sign in</Link>
        )}
      </div>
    </header>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Header />
      <ErrorBoundary>
        <main>
          <Routes>
            <Route path="/" element={<Landing />} />
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
    </BrowserRouter>
  )
}
