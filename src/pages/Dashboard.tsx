import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Compass,
  Lock,
  Play,
  Repeat,
  ShieldCheck,
} from 'lucide-react'
import { Badge, Card, LinkButton, deg, mmss } from '../components/ui'
import { useAuth, useUser } from '../lib/auth'
import { exerciseById, EXERCISES } from '../lib/exercises'
import { getPrefs } from '../lib/prefs'
import { useSessions } from '../lib/useSessions'
import { PatientConnectionsSection } from '../components/PatientConnectionsSection'
import { ClinicalPlansSection } from '../components/ClinicalPlansSection'

export default function Dashboard() {
  const { user, profile } = useAuth()
  const prefs = getPrefs()
  const recentEx = exerciseById(prefs.lastExercise ?? 'shoulder_abduction') ?? EXERCISES[0]
  const isProfessional = profile?.role === 'professional'
  const isWellness = profile?.role === 'wellness'

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      {/* Welcome & Status Header */}
      <div className="mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="font-mono text-xs uppercase tracking-wider text-teal">
            {isProfessional
              ? 'Clinician & Rehabilitation Hub'
              : isWellness
              ? 'Everyday Wellness & Movement Hub'
              : 'Physical Rehabilitation Hub'}
          </p>
          <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
            {user
              ? `Welcome back, ${profile?.display_name || user.email?.split('@')[0]}`
              : 'Welcome to KinectIQ'}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {user
              ? `Signed in as ${user.email} (${profile?.role ?? 'patient'}). Private session records are synced to your account.`
              : 'Webcam tracking runs locally on your device. Sign in to save and track your session history over time.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {isProfessional && (
            <LinkButton to="/clinician" variant="primary">
              Open Clinician Portal →
            </LinkButton>
          )}
          <LinkButton to="/exercises" variant="dark">
            <Compass className="h-4 w-4" aria-hidden /> Browse Library
          </LinkButton>
          <LinkButton to={`/exercise?id=${recentEx.id}`}>
            <Play className="h-4 w-4 fill-white" aria-hidden /> Quick Start
          </LinkButton>
        </div>
      </div>

      {user && !isProfessional && (
        <div className="mb-8 space-y-6">
          <PatientConnectionsSection patientId={user.id} condensed={true} />
          <ClinicalPlansSection patientId={user.id} />
        </div>
      )}

      {/* Hero Action Cards: Quick Repeat & Category Shortcuts */}
      <div className="grid gap-6 md:grid-cols-[1.2fr_1fr]">
        {/* Continue / Repeat Card */}
        <Card className="flex flex-col justify-between p-6 border-teal/40 bg-white shadow-sm">
          <div>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-teal">
                <Repeat className="h-3.5 w-3.5" aria-hidden /> Recent Exercise
              </span>
              <Badge tone="teal">{recentEx.region}</Badge>
            </div>
            <h2 className="mt-3 font-display text-2xl font-bold text-ink">
              {recentEx.name}
            </h2>
            <p className="mt-2 text-sm text-muted leading-relaxed">
              {recentEx.summary}
            </p>
            <div className="mt-4 flex items-center gap-4 text-xs text-muted">
              <span>Orientation: <strong>{recentEx.view}</strong></span>
              <span>Duration: <strong>~{recentEx.minutes}m</strong></span>
              <span>Equipment: <strong>{recentEx.equipment}</strong></span>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-rule pt-4">
            <LinkButton to={`/exercise?id=${recentEx.id}`} className="flex-1">
              <Play className="h-4 w-4 fill-white" aria-hidden /> Continue {recentEx.name}
            </LinkButton>
            <Link
              to={`/exercises/${recentEx.id}`}
              className="text-xs font-semibold text-muted hover:text-ink px-3 py-2"
            >
              View Instructions
            </Link>
          </div>
        </Card>

        {/* Category Shortcuts */}
        <div className="flex flex-col gap-3">
          <Link
            to="/exercises?cat=upper"
            className="group flex flex-1 items-center justify-between rounded-xl border border-rule bg-white p-5 transition hover:border-teal hover:shadow-sm"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-teal" />
                <h3 className="font-display text-base font-bold text-ink group-hover:text-teal transition-colors">
                  Upper Body Rehabilitation
                </h3>
              </div>
              <p className="mt-1 text-xs text-muted">
                Shoulders, elbows, biceps, wall push-ups (7 exercises)
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted transition group-hover:translate-x-1 group-hover:text-teal" aria-hidden />
          </Link>

          <Link
            to="/exercises?cat=lower"
            className="group flex flex-1 items-center justify-between rounded-xl border border-rule bg-white p-5 transition hover:border-teal hover:shadow-sm"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-teal" />
                <h3 className="font-display text-base font-bold text-ink group-hover:text-teal transition-colors">
                  Lower Body Strengthening
                </h3>
              </div>
              <p className="mt-1 text-xs text-muted">
                Sit-to-stand, squats, knee raises, heel raises (7 exercises)
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted transition group-hover:translate-x-1 group-hover:text-teal" aria-hidden />
          </Link>

          <Link
            to="/exercises?cat=mobility"
            className="group flex flex-1 items-center justify-between rounded-xl border border-rule bg-white p-5 transition hover:border-teal hover:shadow-sm"
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-teal" />
                <h3 className="font-display text-base font-bold text-ink group-hover:text-teal transition-colors">
                  Mobility & Balance
                </h3>
              </div>
              <p className="mt-1 text-xs text-muted">
                Posture observation, trunk side bending, single-leg balance (4 exercises)
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted transition group-hover:translate-x-1 group-hover:text-teal" aria-hidden />
          </Link>
        </div>
      </div>

      {/* Progress & Recent Sessions Section */}
      <div className="mt-12">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl font-bold text-ink">Personal Progress Overview</h2>
            <p className="text-xs text-muted">Real measurements from your recorded sessions</p>
          </div>
          {user && (
            <Link to="/history" className="text-xs font-semibold text-teal hover:underline">
              View all history <ArrowRight className="inline h-3.5 w-3.5" aria-hidden />
            </Link>
          )}
        </div>

        {user ? (
          <UserProgressSnippet user={user} />
        ) : (
          <Card className="p-8 text-center bg-paper">
            <Lock className="mx-auto h-8 w-8 text-muted mb-3" aria-hidden />
            <h3 className="font-display text-base font-bold text-ink">Sign in to track progress</h3>
            <p className="mt-1 text-sm text-muted max-w-md mx-auto">
              Your sessions are kept on this device while you exercise. Create a free account or sign in to build a continuous history of your range of motion.
            </p>
            <div className="mt-5">
              <LinkButton to="/auth?next=/dashboard">Sign in to sync history</LinkButton>
            </div>
          </Card>
        )}
      </div>

      {/* Privacy & Safety Guarantee */}
      <div className="mt-12 rounded-xl border border-rule bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-6 w-6 shrink-0 text-teal" aria-hidden />
            <div>
              <h3 className="text-sm font-bold text-ink">100% In-Browser Privacy Guarantee</h3>
              <p className="mt-1 text-xs text-muted leading-relaxed max-w-2xl">
                Webcam video frames are evaluated using client-side WebAssembly models and instantly discarded.
                No images or video recordings are ever streamed, saved, or uploaded to any server.
              </p>
            </div>
          </div>
          <Link to="/settings" className="shrink-0 text-xs font-semibold text-teal underline">
            Review Settings & Safety
          </Link>
        </div>
      </div>
    </div>
  )
}

function UserProgressSnippet({ user }: { user: NonNullable<ReturnType<typeof useUser>> }) {
  const { state } = useSessions(user)

  if (state.kind === 'loading') {
    return <p className="text-sm text-muted py-6">Loading your recorded progress...</p>
  }

  if (state.kind === 'error') {
    return <p className="text-sm text-danger py-4">Unable to load sessions: {state.message}</p>
  }

  const sessions = state.data

  if (sessions.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="font-display text-base font-bold text-ink">No sessions recorded yet</p>
        <p className="mt-1 text-sm text-muted">Complete your first movement set to start tracking your range of motion.</p>
        <LinkButton to="/exercises" className="mt-4">Explore Exercises</LinkButton>
      </Card>
    )
  }

  const totalReps = sessions.reduce((acc, s) => acc + s.valid_reps, 0)
  const totalDurationMs = sessions.reduce((acc, s) => acc + s.duration_ms, 0)
  const recentSessions = sessions.slice(0, 4)

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-rule bg-rule sm:grid-cols-3">
        <div className="bg-white p-5">
          <dt className="text-xs text-muted uppercase font-mono">Sessions Completed</dt>
          <dd className="mt-1 font-mono text-3xl font-bold text-ink">{sessions.length}</dd>
        </div>
        <div className="bg-white p-5">
          <dt className="text-xs text-muted uppercase font-mono">Total Reps Logged</dt>
          <dd className="mt-1 font-mono text-3xl font-bold text-teal">{totalReps}</dd>
        </div>
        <div className="bg-white p-5">
          <dt className="text-xs text-muted uppercase font-mono">Total Active Time</dt>
          <dd className="mt-1 font-mono text-3xl font-bold text-ink">{mmss(totalDurationMs)}</dd>
        </div>
      </dl>

      <Card className="divide-y divide-rule overflow-hidden">
        <div className="bg-paper px-5 py-3">
          <h3 className="font-display text-sm font-bold text-ink">Recent Activity</h3>
        </div>
        {recentSessions.map((s) => {
          const ex = exerciseById(s.exercise)
          return (
            <Link
              key={s.id}
              to={`/history/${s.id}`}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 transition hover:bg-paper"
            >
              <div>
                <p className="font-semibold text-sm text-ink">
                  {ex?.name ?? s.exercise}{s.side !== 'both' ? ` · ${s.side} side` : ''}
                </p>
                <p className="text-xs text-muted">{new Date(s.started_at).toLocaleDateString()} at {new Date(s.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
              </div>

              <div className="flex items-center gap-4 text-xs font-mono">
                <span>{s.valid_reps} reps</span>
                {s.peak_rom_deg != null && <span>peak {deg(s.peak_rom_deg)}</span>}
                <span className="text-muted">{mmss(s.duration_ms)}</span>
              </div>
            </Link>
          )
        })}
      </Card>
    </div>
  )
}
