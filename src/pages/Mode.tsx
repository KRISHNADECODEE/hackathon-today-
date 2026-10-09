import { Link } from 'react-router-dom'
import { ArrowRight, HeartPulse, Sparkles, Stethoscope } from 'lucide-react'
import { PageTitle } from '../components/ui'
import { useAuth } from '../lib/auth'

export default function Mode() {
  const { profile } = useAuth()
  const card = 'group flex flex-col rounded-xl border border-rule bg-white p-6 shadow-xs transition hover:border-teal hover:shadow-md'

  return (
    <div className="mx-auto max-w-5xl px-4 py-14">
      <PageTitle
        eyebrow="Select Pathway"
        title="How are you using KinectIQ today?"
      >
        Choose your goal. KinectIQ evaluates movement 100% in-browser on client webcam frames with zero video uploads.
      </PageTitle>

      <div className="grid gap-6 md:grid-cols-3 mt-8">
        {/* Everyday Wellness */}
        <Link to="/wellness" className={card}>
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition">
            <Sparkles className="h-6 w-6" aria-hidden />
          </div>
          <div className="mt-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">Workplace & Health</span>
            <h2 className="mt-1 font-display text-xl font-bold text-ink">Everyday Wellness</h2>
          </div>
          <p className="mt-2 flex-1 text-sm text-muted leading-relaxed">
            Quick 2-minute desk breaks, posture awareness checks, neck & spine decompression, and daily movement streaks.
          </p>
          <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
            Start a quick break <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
          </span>
        </Link>

        {/* Patient Rehabilitation */}
        <Link to="/exercises" className={card}>
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-teal-soft text-teal group-hover:bg-teal group-hover:text-white transition">
            <HeartPulse className="h-6 w-6" aria-hidden />
          </div>
          <div className="mt-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-teal">Guided Physical Therapy</span>
            <h2 className="mt-1 font-display text-xl font-bold text-ink">Rehab Patient</h2>
          </div>
          <p className="mt-2 flex-1 text-sm text-muted leading-relaxed">
            18 full-body exercises with live joint angle measurement, compensation warnings, audio coaching, and recovery tracking.
          </p>
          <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-teal">
            Browse exercise library <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
          </span>
        </Link>

        {/* Clinician Portal */}
        <Link to="/clinician" className={card}>
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-paper text-ink group-hover:bg-ink group-hover:text-white transition">
            <Stethoscope className="h-6 w-6" aria-hidden />
          </div>
          <div className="mt-4">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Provider Hub</span>
              {profile?.is_verified_professional && (
                <span className="rounded bg-teal/20 px-1.5 py-0.5 text-[10px] font-semibold text-teal">Verified</span>
              )}
            </div>
            <h2 className="mt-1 font-display text-xl font-bold text-ink">Clinician Portal</h2>
          </div>
          <p className="mt-2 flex-1 text-sm text-muted leading-relaxed">
            Review adherence evidence, assign tailored exercise plans, and audit range-of-motion trends for authorized patients.
          </p>
          <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
            Open provider portal <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
          </span>
        </Link>
      </div>

      <div className="mt-10 rounded-lg border border-rule bg-paper p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm">
        <p className="text-muted text-center sm:text-left">
          Want to test the camera immediately? You can start any exercise without signing in.
        </p>
        <Link to="/exercise" className="font-semibold text-teal hover:underline whitespace-nowrap">
          Launch live camera workspace →
        </Link>
      </div>
    </div>
  )
}
