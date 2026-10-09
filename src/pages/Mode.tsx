import { Link } from 'react-router-dom'
import { ArrowRight, Stethoscope, User } from 'lucide-react'
import { PageTitle } from '../components/ui'
import { useUser } from '../lib/auth'

export default function Mode() {
  const user = useUser()
  const card = 'group flex flex-col rounded-lg border border-rule bg-white p-6 transition-colors hover:border-teal'
  return (
    <div className="mx-auto max-w-4xl px-4 py-14">
      <PageTitle eyebrow="Choose a mode" title="How are you using KinectIQ today?" />
      <div className="grid gap-4 md:grid-cols-2">
        <Link to={user ? '/exercise' : '/auth?next=/exercise'} className={card}>
          <User className="h-6 w-6 text-teal" aria-hidden />
          <h2 className="mt-4 font-display text-xl font-bold">Patient</h2>
          <p className="mt-2 flex-1 text-sm text-muted">Do a guided shoulder abduction set with live measurement, then save it to your history.</p>
          <span className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-teal">
            {user ? 'Open the exercise' : 'Sign in to continue'} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </span>
        </Link>
        <Link to="/clinician" className={card}>
          <Stethoscope className="h-6 w-6 text-muted" aria-hidden />
          <h2 className="mt-4 font-display text-xl font-bold">Clinician</h2>
          <p className="mt-2 flex-1 text-sm text-muted">
            Viewing assigned patients is not available in this version. You can preview the dashboard layout using your own recorded sessions.
          </p>
          <span className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-ink">
            Preview the dashboard <ArrowRight className="h-4 w-4" aria-hidden />
          </span>
        </Link>
      </div>
      <p className="mt-6 text-sm text-muted">
        Just want to try the camera? <Link to="/exercise" className="font-semibold text-teal underline">Start without signing in</Link>. You can sign in before saving.
      </p>
    </div>
  )
}
