import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  CheckCircle,
  Clock,
  Dumbbell,
  Eye,
  Info,
  Play,
  ShieldAlert,
} from 'lucide-react'
import { Badge, Button, Card, PageTitle } from '../components/ui'
import {
  CATEGORY_LABEL,
  exerciseById,
  STATUS_LABEL,
  VIEW_LABEL,
} from '../lib/exercises'

export default function ExerciseDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const ex = exerciseById(id)

  if (!ex) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20">
        <PageTitle title="Exercise not found">
          The requested exercise does not exist in our library catalog.
        </PageTitle>
        <Link to="/exercises" className="mt-4 inline-block font-semibold text-teal underline">
          Browse all exercises
        </Link>
      </div>
    )
  }

  const isTrackable = !!ex.track
  const track = ex.track

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      {/* Breadcrumb / Back button */}
      <div className="mb-6">
        <Link
          to="/exercises"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to Exercise Library
        </Link>
      </div>

      {/* Main Title Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs uppercase tracking-wider text-teal">
              {CATEGORY_LABEL[ex.category]} · {ex.region}
            </span>
            <Badge tone={ex.status === 'prototype' ? 'teal' : ex.status === 'experimental' ? 'amber' : 'neutral'}>
              {STATUS_LABEL[ex.status]}
            </Badge>
          </div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl text-ink">
            {ex.name}
          </h1>
          <p className="mt-2 text-base text-muted">{ex.summary}</p>
        </div>

        {isTrackable && (
          <div className="shrink-0">
            <Button
              onClick={() => nav(`/exercise?id=${ex.id}`)}
              className="px-6 py-3 text-base shadow-sm"
            >
              <Play className="h-4 w-4 fill-white" aria-hidden /> Start Exercise
            </Button>
          </div>
        )}
      </div>

      {/* Specs bar */}
      <div className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-rule bg-rule sm:grid-cols-4">
        <div className="bg-white p-4">
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <Camera className="h-3.5 w-3.5 text-teal" aria-hidden /> Camera View
          </span>
          <p className="mt-1 font-semibold text-ink">{VIEW_LABEL[ex.view]}</p>
        </div>
        <div className="bg-white p-4">
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <Dumbbell className="h-3.5 w-3.5 text-muted" aria-hidden /> Equipment
          </span>
          <p className="mt-1 font-semibold text-ink">{ex.equipment}</p>
        </div>
        <div className="bg-white p-4">
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <Clock className="h-3.5 w-3.5 text-muted" aria-hidden /> Est. Duration
          </span>
          <p className="mt-1 font-semibold text-ink">~{ex.minutes} minutes</p>
        </div>
        <div className="bg-white p-4">
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <Eye className="h-3.5 w-3.5 text-muted" aria-hidden /> Mode
          </span>
          <p className="mt-1 font-semibold capitalize text-ink">
            {track ? track.mode : 'Informational only'}
          </p>
        </div>
      </div>

      {/* Instructions */}
      <div className="mt-10 space-y-8">
        <section>
          <h2 className="font-display text-xl font-bold text-ink">Step-by-Step Instructions</h2>
          <ol className="mt-4 space-y-3">
            {ex.instructions.map((step, idx) => (
              <li key={idx} className="flex items-start gap-3 rounded-lg border border-rule bg-white p-4">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-soft font-mono text-xs font-bold text-teal">
                  {idx + 1}
                </span>
                <span className="text-sm text-ink leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Real-time Tracking & Form Checks (if trackable) */}
        {track && (
          <section>
            <h2 className="font-display text-xl font-bold text-ink">Movement Tracking & Real-Time Form Checks</h2>
            <Card className="mt-4 p-5">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-ink">Target Metric</h3>
                <p className="mt-1 text-sm text-muted">
                  Measuring <strong className="text-ink">{track.metric.label}</strong> ({track.metric.unit}).{' '}
                  {track.reps && (
                    <>Target is at least <strong className="font-mono text-ink">{track.reps.target}°</strong> per rep.</>
                  )}
                  {track.hold && (
                    <>Hold target is <strong className="font-mono text-ink">{track.hold.targetHoldMs / 1000} seconds</strong>.</>
                  )}
                </p>
              </div>

              {track.checks.length > 0 && (
                <div className="border-t border-rule pt-4">
                  <h3 className="text-sm font-semibold text-ink">Automated Form Monitoring</h3>
                  <ul className="mt-2 space-y-2">
                    {track.checks.map((chk) => (
                      <li key={chk.id} className="flex items-start gap-2 text-sm text-muted">
                        <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-teal" aria-hidden />
                        <div>
                          <strong className="text-ink">{chk.label}:</strong> {chk.advice}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          </section>
        )}

        {/* Safety Considerations */}
        <section>
          <h2 className="font-display text-xl font-bold text-ink">Safety Guidelines</h2>
          <div className="mt-4 rounded-xl border border-amber/40 bg-amber-soft p-5">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber" aria-hidden />
              <div>
                <h3 className="text-sm font-bold text-ink">Important Safety Reminders</h3>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-[#5c3d0b]">
                  {ex.safety.map((note, idx) => (
                    <li key={idx}>{note}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Known Limitations & Privacy */}
        <section>
          <h2 className="font-display text-xl font-bold text-ink">Technical Limitations & Camera Setup</h2>
          <div className="mt-4 space-y-3">
            {ex.limitations.map((limit, idx) => (
              <div key={idx} className="flex items-start gap-3 rounded-lg border border-rule bg-white p-4 text-sm text-muted">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
                <span>{limit}</span>
              </div>
            ))}
          </div>

          {!isTrackable && (
            <div className="mt-4 rounded-xl border border-rule bg-paper p-5">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
                <div>
                  <h3 className="text-sm font-bold text-ink">Why is this exercise not trackable?</h3>
                  <p className="mt-1 text-sm text-muted">
                    This movement involves anatomical rotation or depth changes that cannot be accurately resolved
                    by a single 2D webcam without depth sensors or calibrated multi-camera goniometry.
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Bottom CTA */}
      {isTrackable && (
        <div className="mt-12 flex justify-end border-t border-rule pt-6">
          <Button
            onClick={() => nav(`/exercise?id=${ex.id}`)}
            className="px-8 py-3 text-base shadow-sm"
          >
            <Play className="h-4 w-4 fill-white" aria-hidden /> Start This Exercise Now
          </Button>
        </div>
      )}
    </div>
  )
}
