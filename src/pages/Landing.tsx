import { ArrowRight, Camera, Compass, Database, Lock, Play } from 'lucide-react'
import { Goniometer } from '../components/Goniometer'
import { LinkButton } from '../components/ui'
import { useUser } from '../lib/auth'

export default function Landing() {
  const user = useUser()

  return (
    <>
      {/* Hero Section */}
      <section className="bg-ink text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:grid-cols-[1.2fr_1fr] md:py-24">
          <div>
            <p className="mb-4 font-mono text-xs uppercase tracking-widest text-teal">
              Full-Body Physical Rehabilitation · Webcam Only
            </p>
            <h1 className="font-display text-4xl font-extrabold leading-[1.08] tracking-tight md:text-5xl lg:text-6xl">
              Real-time movement guidance. <br />
              <span className="text-teal">Every rep, measured.</span>
            </h1>
            <p className="mt-6 max-w-lg text-base md:text-lg text-white/70 leading-relaxed">
              KinectIQ delivers webcam-powered computer vision assessment across 18 upper body, lower body, and mobility exercises.
              Calculates joint angles, counts repetitions, catches compensation patterns, and keeps all video strictly private on your device.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton to={user ? '/dashboard' : '/exercises'}>
                <Compass className="h-4 w-4" aria-hidden /> Browse Exercise Library
              </LinkButton>
              <LinkButton to="/exercise" variant="onDark">
                <Play className="h-4 w-4 fill-white" aria-hidden /> Try Camera Now
              </LinkButton>
            </div>
          </div>

          <figure className="mx-auto w-full max-w-sm rounded-xl border border-white/10 bg-slate p-6 shadow-xl">
            <div className="mb-2 flex items-center justify-between text-xs text-white/60">
              <span className="font-mono uppercase text-teal">Real-time Biometrics</span>
              <span className="rounded bg-teal/20 px-2 py-0.5 text-teal font-mono">30 FPS Live</span>
            </div>
            <Goniometer angle={92} target={80} size={320} />
            <figcaption className="mt-4 flex items-baseline justify-between font-mono text-sm text-white/60">
              <span>Joint Angle Elevation</span>
              <span className="text-2xl font-bold text-white">92°</span>
            </figcaption>
            <p className="mt-2 font-mono text-[11px] text-white/40">
              Continuous EMA smoothing & automated form-break detection
            </p>
          </figure>
        </div>
      </section>

      {/* Feature Pillars */}
      <section className="mx-auto grid max-w-6xl gap-8 px-4 py-16 md:grid-cols-3">
        {[
          {
            icon: Camera,
            title: '18 Supported Exercises',
            body: 'Full-body catalog covering shoulder abduction, elbow flexion, squats, sit-to-stand, hip abductions, and balance holds.',
          },
          {
            icon: Lock,
            title: 'Zero Video Uploads',
            body: 'Frames are evaluated in real-time by in-browser WebAssembly models and instantly discarded. Nothing is recorded or transmitted.',
          },
          {
            icon: Database,
            title: 'Private Metric Records',
            body: 'Track your personal range of motion progression, rep counts, and tracking reliability safely stored in Supabase with Row-Level Security.',
          },
        ].map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-xl border border-rule bg-white p-6 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-soft text-teal mb-4">
              <Icon className="h-5 w-5" aria-hidden />
            </div>
            <h2 className="font-display text-lg font-bold text-ink">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
          </div>
        ))}
      </section>

      {/* Banner to Catalog */}
      <section className="border-t border-rule bg-paper py-14">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 text-center md:flex-row md:text-left">
          <div>
            <h2 className="font-display text-2xl font-bold text-ink">Ready to begin your guided movement set?</h2>
            <p className="mt-1 text-sm text-muted">Select an exercise, follow the camera alignment guide, and start moving.</p>
          </div>
          <div className="flex gap-3">
            <LinkButton to="/exercises">
              Explore All 18 Exercises <ArrowRight className="h-4 w-4" aria-hidden />
            </LinkButton>
          </div>
        </div>
      </section>
    </>
  )
}
