import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { NormalizedLandmark, PoseLandmarker } from '@mediapipe/tasks-vision'
import { AlertTriangle, Bug, Pause, Play, RotateCcw, Square, Volume2, VolumeX } from 'lucide-react'
import { Goniometer } from '../components/Goniometer'
import { Meter } from '../components/Meter'
import { Button, fmt, mmss } from '../components/ui'
import { landmarkIndex, SessionTracker, summarize, type Frame, type Phase, type Side } from '../lib/engine'
import { exerciseById, EXERCISES, VIEW_LABEL } from '../lib/exercises'
import { getPrefs, setPrefs } from '../lib/prefs'
import { getPoseLandmarker, POSE_CONNECTIONS } from '../lib/pose'
import { say, speechAvailable } from '../lib/speech'

type Run = 'idle' | 'running' | 'paused'
type Failure = { title: string; steps: string[] }
export const PENDING_KEY = 'kinectiq.pendingSession'

function cameraFailure(e: unknown): Failure {
  const name = e instanceof DOMException ? e.name : ''
  if (name === 'NotAllowedError') return { title: 'Camera access was blocked', steps: ['Click the camera icon in the address bar and allow access for this site.', 'Reload the page.'] }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return { title: 'No camera found', steps: ['Connect a webcam.', 'Reload the page.'] }
  if (name === 'NotReadableError') return { title: 'The camera is in use by another app', steps: ['Close other apps using the camera (video calls, recorders).', 'Reload the page.'] }
  return { title: 'The camera could not start', steps: [String((e as Error)?.message ?? e), 'Use a recent Chrome, Edge or Firefox over https or localhost.'] }
}

const PHASE_LABELS: Record<string, Record<string, string>> = {
  biceps_curl: {
    READY: 'START / EXTENDED',
    MOVING: 'CURLING',
    PEAK: 'CONTRACTED',
    RETURNING: 'LOWERING',
  },
  elbow_flexion: {
    READY: 'START / EXTENDED',
    MOVING: 'BENDING',
    PEAK: 'FLEXED',
    RETURNING: 'LOWERING',
  },
}

export default function Workspace() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const exId = params.get('id') ?? getPrefs().lastExercise ?? 'shoulder_abduction'
  const exercise = exerciseById(exId) ?? EXERCISES[0]

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loading, setLoading] = useState<string | null>('Requesting camera access…')
  const [failure, setFailure] = useState<Failure | null>(null)
  const [aspect, setAspect] = useState(16 / 9)
  const [run, setRun] = useState<Run>('idle')
  const [side, setSide] = useState<Side>(() => getPrefs().side)
  const [voice, setVoice] = useState(speechAvailable())
  const [frame, setFrame] = useState<Frame | null>(null)
  const [posePresent, setPosePresent] = useState(false)
  const [activeMs, setActiveMs] = useState(0)
  const [flash, setFlash] = useState<string | null>(null)
  const [unsaved] = useState(() => !!sessionStorage.getItem(PENDING_KEY))
  const [showDebug, setShowDebug] = useState(() => params.get('debug') === '1' || params.get('debug') === 'true')
  const [armWarning, setArmWarning] = useState<string | null>(null)
  const [debugStats, setDebugStats] = useState({
    rawAngle: null as number | null,
    shoulderVis: 0,
    elbowVis: 0,
    wristVis: 0,
    lastRejection: null as string | null,
    incompleteCount: 0,
  })

  // Mutable session state read inside the animation loop.
  const s = useRef({
    run: 'idle' as Run, voice, side, tracker: null as SessionTracker | null,
    startedAt: null as Date | null, startPerf: 0, activeAcc: 0, resumedAt: 0, id: '',
    wasCalibrated: false, lostSince: null as number | null, flashTimer: 0,
  })

  useEffect(() => {
    s.current.voice = voice
    s.current.side = side
  }, [voice, side])

  useEffect(() => {
    if (!exercise.track) return

    let cancelled = false
    let raf = 0
    let stream: MediaStream | null = null

    const cue = (text: string, key = text, gap = 4000) => s.current.voice && say(text, key, gap)
    const showFlash = (text: string) => {
      setFlash(text)
      clearTimeout(s.current.flashTimer)
      s.current.flashTimer = window.setTimeout(() => setFlash(null), 1200)
    }

    const trackDef = exercise.track

    function draw(pts: NormalizedLandmark[] | undefined, w: number, h: number) {
      const c = canvasRef.current
      const ctx = c?.getContext('2d')
      if (!c || !ctx) return
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h }
      ctx.clearRect(0, 0, w, h)
      if (!pts) return
      const seen = (i: number) => (pts[i]?.visibility ?? 0) >= (trackDef.minVisibility ?? 0.5)
      const active = trackDef.required.map((ref) => landmarkIndex(ref, s.current.side))
      const isKey = (a: number, b: number) => active.includes(a) && active.includes(b)
      ctx.lineCap = 'round'
      for (const { start, end } of POSE_CONNECTIONS) {
        if (!seen(start) || !seen(end)) continue
        const hi = isKey(start, end)
        ctx.strokeStyle = hi ? '#2dd4bf' : 'rgba(255,255,255,0.75)'
        ctx.lineWidth = hi ? 7 : 3
        ctx.beginPath()
        ctx.moveTo(pts[start].x * w, pts[start].y * h)
        ctx.lineTo(pts[end].x * w, pts[end].y * h)
        ctx.stroke()
      }
      pts.forEach((p, i) => {
        if (!seen(i)) return
        const hi = active.includes(i)
        ctx.fillStyle = hi ? '#2dd4bf' : '#ffffff'
        ctx.beginPath()
        ctx.arc(p.x * w, p.y * h, hi ? 7 : 4, 0, Math.PI * 2)
        ctx.fill()
      })
    }

    function loop(lm: PoseLandmarker) {
      let lastTime = -1
      const tick = () => {
        raf = requestAnimationFrame(tick)
        const v = videoRef.current
        if (!v || v.readyState < 2 || v.currentTime === lastTime) return // only new frames
        lastTime = v.currentTime
        const now = performance.now()
        let pts: NormalizedLandmark[] | undefined
        try {
          pts = lm.detectForVideo(v, now).landmarks[0]
        } catch (e) {
          cancelAnimationFrame(raf)
          setFailure({ title: 'Pose tracking stopped', steps: [String((e as Error)?.message ?? e), 'Reload the page to restart tracking.'] })
          return
        }
        draw(pts, v.videoWidth, v.videoHeight)
        setPosePresent(!!pts)
        const st = s.current

        // Check arm landmark confidences
        const shIdx = landmarkIndex('S.shoulder', st.side)
        const elIdx = landmarkIndex('S.elbow', st.side)
        const wrIdx = landmarkIndex('S.wrist', st.side)
        const shV = pts ? (pts[shIdx]?.visibility ?? 0) : 0
        const elV = pts ? (pts[elIdx]?.visibility ?? 0) : 0
        const wrV = pts ? (pts[wrIdx]?.visibility ?? 0) : 0

        if (st.run === 'running' && pts) {
          if (exercise.id === 'biceps_curl' || exercise.id === 'elbow_flexion') {
            if (elV < 0.55 || wrV < 0.55) {
              setArmWarning(elV < 0.55 ? 'Elbow partially obscured. Keep your working elbow in clear view.' : 'Wrist partially obscured. Keep your working hand in clear view.')
            } else {
              setArmWarning(null)
            }
          } else {
            setArmWarning(null)
          }
        } else {
          setArmWarning(null)
        }

        if (st.run !== 'running' || !st.tracker) return
        const f = st.tracker.update(pts, now - st.startPerf, v.videoWidth / v.videoHeight)
        setFrame(f)
        setActiveMs(st.activeAcc + now - st.resumedAt)
        setDebugStats((prev) => ({
          rawAngle: f.value,
          shoulderVis: Math.round(shV * 100),
          elbowVis: Math.round(elV * 100),
          wristVis: Math.round(wrV * 100),
          lastRejection: f.rejected === 'too_fast'
            ? 'Movement too fast (<600ms)'
            : f.rejected === 'limited_range'
            ? 'Did not reach curl target'
            : f.rejected === 'tracking_lost'
            ? 'Tracking lost'
            : prev.lastRejection,
          incompleteCount: st.tracker?.incompleteReps ?? prev.incompleteCount,
        }))
        if (f.calibrated && !st.wasCalibrated) {
          st.wasCalibrated = true
          cue(trackDef.cues.ready)
        }
        if (f.completed) {
          cue(`${f.completed.index}`, 'rep', 0)
          showFlash(trackDef.mode === 'hold' ? `Hold ${f.completed.index}` : `Rep ${f.completed.index}`)
        }
        if (f.rejected) {
          if (f.rejected === 'too_fast') {
            cue(trackDef.cues.tooFast, 'cue', 4000)
            showFlash('Slow down')
          } else if (f.rejected === 'limited_range') {
            cue(trackDef.cues.incomplete, 'cue', 4000)
            showFlash('Not counted')
          }
        }
        if (f.warnings.length > 0) {
          const w = f.warnings[0]
          cue(w.advice, w.id, 6000)
        }
        if (f.tracking !== 'ok') {
          st.lostSince ??= now
          if (now - st.lostSince > 1500) {
            cue(exercise.view === 'side' ? 'Step back so your full side is in view' : 'Step back so your upper body is in view', 'lost', 8000)
          }
        } else {
          st.lostSince = null
        }
      }
      tick()
    }

    ;(async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setFailure({ title: 'This browser cannot access a camera', steps: ['Open KinectIQ in a recent Chrome, Edge or Firefox.', 'Use https or http://localhost.'] })
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false })
      } catch (e) {
        if (!cancelled) setFailure(cameraFailure(e))
        return
      }
      if (cancelled) return stream.getTracks().forEach((t) => t.stop())
      const v = videoRef.current!
      v.srcObject = stream
      await v.play().catch(() => {})
      setAspect(v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 16 / 9)
      setLoading('Loading pose model…')
      let lm: PoseLandmarker
      try {
        lm = await getPoseLandmarker()
      } catch (e) {
        if (!cancelled) setFailure({ title: 'The pose model failed to load', steps: [String((e as Error)?.message ?? e), 'Check your connection and reload the page.', 'If it persists, run `npm install` again so the model files are copied into public/mediapipe.'] })
        return
      }
      if (cancelled) return
      setLoading(null)
      loop(lm)
    })()

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
      window.speechSynthesis?.cancel()
    }
  }, [exercise])

  if (!exercise.track) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20">
        <h1 className="font-display text-2xl font-bold">{exercise.name}</h1>
        <p className="mt-2 text-muted">{exercise.summary}</p>
        <div className="mt-6 rounded-lg border border-amber/40 bg-amber-soft p-5">
          <h2 className="font-semibold text-ink">Why this exercise is not tracked with a webcam</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#5c3d0b]">
            {exercise.limitations.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
        <div className="mt-6 flex gap-4">
          <Button onClick={() => nav('/exercise?id=shoulder_abduction')}>Choose a trackable exercise</Button>
          <Button variant="ghost" onClick={() => nav(-1)}>Go back</Button>
        </div>
      </div>
    )
  }

  const trackDef = exercise.track
  const setRunBoth = (r: Run) => { s.current.run = r; setRun(r) }

  function start() {
    const st = s.current
    const now = performance.now()
    setPrefs({ lastExercise: exercise.id, side })
    Object.assign(st, {
      tracker: new SessionTracker(trackDef, side, exercise.view),
      startedAt: new Date(),
      startPerf: now,
      resumedAt: now,
      activeAcc: 0,
      id: crypto.randomUUID(),
      wasCalibrated: false,
      lostSince: null,
    })
    setFrame(null)
    setActiveMs(0)
    setRunBoth('running')
    if (voice) say(trackDef.startHint, 'start', 0)
  }

  function pause() {
    s.current.activeAcc += performance.now() - s.current.resumedAt
    setRunBoth('paused')
  }

  function resume() {
    s.current.tracker?.resetTransient() // a rep in progress before the pause is discarded
    s.current.resumedAt = performance.now()
    setRunBoth('running')
  }

  function end() {
    const st = s.current
    if (!st.tracker || !st.startedAt) return
    const active = st.activeAcc + (st.run === 'running' ? performance.now() - st.resumedAt : 0)
    const summary = summarize(
      st.tracker,
      { id: st.id, exercise: exercise.id, version: exercise.version, sided: exercise.sided },
      st.startedAt,
      new Date(),
      active
    )
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(summary))
    setRunBoth('idle')
    nav('/complete')
  }

  const angle = frame?.tracking === 'ok' ? frame.value : null
  const tracking = run === 'idle'
    ? posePresent ? { tone: 'ok', text: 'Person detected' } : { tone: 'warn', text: 'No person detected' }
    : !frame ? { tone: 'warn', text: 'Waiting for first frame' }
    : frame.tracking === 'ok' ? { tone: 'ok', text: 'Tracking reliable' }
    : frame.tracking === 'unreliable' ? { tone: 'warn', text: 'Low confidence — evaluation paused' }
    : { tone: 'warn', text: 'No person detected — evaluation paused' }

  const repsConfig = trackDef.reps
  const target = repsConfig?.target ?? (trackDef.hold ? trackDef.hold.targetHoldMs / 1000 : 0)
  const direction = repsConfig?.direction ?? 'up'
  const isAngle = trackDef.metric.unit === 'deg' && trackDef.mode === 'reps'

  const STATES: Phase[] = trackDef.mode === 'reps'
    ? ['READY', 'MOVING', 'PEAK', 'RETURNING']
    : trackDef.mode === 'hold'
    ? ['READY', 'HOLDING']
    : ['READY', 'MONITORING']

  return (
    <div className="bg-ink text-white">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[1fr_340px]">
        <section aria-label="Camera">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-2xl font-bold">{exercise.name}</h1>
              {run === 'idle' && (
                <select
                  value={exercise.id}
                  onChange={(e) => nav(`/exercise?id=${e.target.value}`)}
                  className="rounded-md border border-white/20 bg-slate px-2.5 py-1.5 text-xs text-white outline-none focus:border-teal"
                  aria-label="Switch exercise"
                >
                  {EXERCISES.filter((e) => !!e.track).map((e) => (
                    <option key={e.id} value={e.id} className="bg-ink text-white">
                      {e.name} ({e.region})
                    </option>
                  ))}
                </select>
              )}
            </div>
            <p className="font-mono text-xs text-white/50">{VIEW_LABEL[exercise.view]} · Video is processed locally in this browser</p>
          </div>
          {exercise.id === 'posture' && (
            <div className="mb-3 rounded-md border border-amber/40 bg-amber-soft/20 px-3 py-2 text-xs text-amber-200 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber shrink-0 mt-0.5" />
              <div>
                <strong>Posture Habit Awareness Aid:</strong> Calculates 2D head-forward angle from webcam landmarks. Not medical-grade posture analysis or a clinical diagnostic device.
              </div>
            </div>
          )}
          {unsaved && (
            <p role="status" className="mb-3 rounded-md border border-amber/60 bg-amber/15 px-3 py-2 text-sm">
              Your last session has not been saved yet. Ending a new session will replace it.{' '}
              <Link to="/complete" className="font-semibold underline">Save it first</Link>
            </p>
          )}
          <div className={`relative overflow-hidden rounded-lg bg-black ${failure ? 'min-h-80' : ''}`} style={{ aspectRatio: aspect }}>
            <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full -scale-x-100 object-contain" />
            <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100 object-contain" />
            {!failure && !loading && (
              <span className={`absolute left-3 top-3 rounded px-2 py-1 font-mono text-xs ${tracking.tone === 'ok' ? 'bg-teal/90' : 'bg-amber/90'}`}>{tracking.text}</span>
            )}
            {flash && <div className="absolute inset-x-0 top-1/3 text-center font-display text-5xl font-extrabold drop-shadow-lg" aria-live="polite">{flash}</div>}
            {(loading || failure) && (
              <div className="absolute inset-0 flex items-center justify-center bg-ink/90 p-6">
                {failure ? (
                  <div role="alert" className="max-w-md">
                    <AlertTriangle className="mb-3 h-6 w-6 text-amber" aria-hidden />
                    <h2 className="font-display text-xl font-bold">{failure.title}</h2>
                    <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-white/70">{failure.steps.map((x) => <li key={x}>{x}</li>)}</ol>
                    <Button className="mt-5" onClick={() => location.reload()}>Reload page</Button>
                  </div>
                ) : (
                  <p className="font-mono text-sm text-white/70" aria-live="polite">{loading}</p>
                )}
              </div>
            )}
          </div>
          {armWarning && (
            <div className="mt-3 rounded-md border border-amber/60 bg-amber/20 px-3 py-2 text-xs text-amber-200 flex items-center gap-2" role="alert">
              <AlertTriangle className="h-4 w-4 text-amber shrink-0" />
              <span>{armWarning}</span>
            </div>
          )}
          <div className="mt-3 space-y-1 text-sm text-white/70">
            <p><strong className="text-white">Starting posture:</strong> {trackDef.startHint}</p>
            <p><strong className="text-white">Guidance:</strong> {exercise.instructions[0]} {exercise.instructions[2] ?? ''}</p>
          </div>
        </section>

        <aside className="space-y-4" aria-label="Measurements">
          <div className="rounded-lg border border-white/10 bg-slate p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/60">{trackDef.metric.label}</span>
              <span className="font-mono text-xs text-white/40">target {direction === 'up' ? '≥' : '≤'} {target}{trackDef.metric.unit === 'deg' ? '°' : trackDef.metric.unit === 'pct' ? '%' : 's'}</span>
            </div>
            <div className="mt-2 flex justify-center">
              {isAngle ? (
                <Goniometer angle={angle} target={target} direction={direction} size={280} />
              ) : (
                <Meter value={angle} target={target} max={Math.max(100, target * 1.5)} direction={direction} />
              )}
            </div>
            <p className="text-center font-mono text-5xl" aria-live="off">
              {angle === null ? <span className="text-3xl text-white/40">{run === 'idle' ? 'press start' : 'unavailable'}</span> : fmt(angle, trackDef.metric.unit)}
            </p>
            <p className="mt-1 text-center text-xs text-white/40">Image-plane metric from webcam pose landmarks. Not a calibrated clinical measurement.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-white/10 bg-slate p-4">
              <p className="text-sm text-white/60">
                {trackDef.mode === 'hold' ? 'Valid holds' : trackDef.mode === 'monitor' ? 'Posture alignment' : 'Valid reps'}
              </p>
              <p className="font-mono text-2xl font-bold mt-1">
                {trackDef.mode === 'monitor'
                  ? angle === null
                    ? '—'
                    : angle <= (trackDef.monitor?.goodBelow ?? 20)
                    ? 'Upright'
                    : 'Forward'
                  : frame?.reps ?? 0}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-slate p-4">
              <p className="text-sm text-white/60">{trackDef.mode === 'hold' ? 'Current hold' : 'Active time'}</p>
              <p className="font-mono text-2xl font-bold mt-1">{trackDef.mode === 'hold' ? `${((frame?.holdMs ?? 0) / 1000).toFixed(1)}s` : mmss(activeMs)}</p>
            </div>
          </div>

          <ol className="flex gap-1 font-mono text-[11px]" aria-label="Movement phase">
            {STATES.map((x) => {
              const label = PHASE_LABELS[exercise.id]?.[x] ?? x
              const isActive = run !== 'idle' && frame?.phase === x
              return (
                <li
                  key={x}
                  className={`flex-1 rounded py-1.5 text-center px-1 truncate ${isActive ? 'bg-teal text-white font-semibold' : 'bg-slate-2 text-white/40'}`}
                  aria-current={isActive ? 'step' : undefined}
                  title={label}
                >
                  {label}
                </li>
              )
            })}
          </ol>

          <FormStatus frame={frame} run={run} hint={trackDef.startHint} />

          <div className="rounded-lg border border-white/10 bg-slate p-4">
            {run === 'idle' && exercise.sided && (
              <fieldset className="mb-4">
                <legend className="mb-2 text-sm text-white/60">Side to exercise</legend>
                <div className="grid grid-cols-2 gap-2">
                  {(['left', 'right'] as const).map((x) => (
                    <button key={x} onClick={() => { setSide(x); setPrefs({ side: x }) }} aria-pressed={side === x} className={`rounded-md border py-2 text-sm capitalize ${side === x ? 'border-teal bg-teal/15' : 'border-white/15 hover:bg-white/5'}`}>{x} side</button>
                  ))}
                </div>
              </fieldset>
            )}
            <div className="flex flex-wrap gap-2">
              {run === 'idle' && <Button onClick={start} disabled={!!loading || !!failure} className="flex-1"><Play className="h-4 w-4" aria-hidden /> Start session</Button>}
              {run === 'running' && <Button variant="onDark" onClick={pause} className="flex-1"><Pause className="h-4 w-4" aria-hidden /> Pause</Button>}
              {run === 'paused' && <Button onClick={resume} className="flex-1"><Play className="h-4 w-4" aria-hidden /> Resume</Button>}
              {run !== 'idle' && <Button variant="onDark" onClick={end} className="flex-1"><Square className="h-4 w-4" aria-hidden /> End session</Button>}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="onDark" onClick={() => { const v = !voice; setVoice(v); setPrefs({ voice: v }) }} disabled={!speechAvailable()} aria-pressed={voice} className="flex-1 text-xs">
                {voice ? <Volume2 className="h-4 w-4" aria-hidden /> : <VolumeX className="h-4 w-4" aria-hidden />}
                {speechAvailable() ? (voice ? 'Voice on' : 'Voice off') : 'Voice unavailable'}
              </Button>
              {run !== 'idle' && (
                <Button variant="onDark" onClick={() => { s.current.tracker?.recalibrate(); s.current.wasCalibrated = false }} className="flex-1 text-xs">
                  <RotateCcw className="h-4 w-4" aria-hidden /> Recalibrate
                </Button>
              )}
              <Button
                variant="onDark"
                onClick={() => setShowDebug(!showDebug)}
                className={`flex-1 text-xs ${showDebug ? 'border-teal text-teal' : ''}`}
                aria-pressed={showDebug}
                title="Toggle real-time computer vision diagnostics"
              >
                <Bug className="h-4 w-4" aria-hidden />
                {showDebug ? 'Hide debug' : 'Diagnostics'}
              </Button>
            </div>
            {run === 'idle' && (
              <div className="mt-3 text-center">
                <Link to={`/exercises/${exercise.id}`} className="text-xs text-white/60 hover:text-teal underline">
                  Review instructions & safety guidelines
                </Link>
              </div>
            )}
          </div>

          {showDebug && (
            <div className="rounded-lg border border-teal/40 bg-black/90 p-4 font-mono text-xs text-white/80 space-y-2.5 shadow-lg" aria-label="CV Diagnostics">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="font-bold text-teal flex items-center gap-1.5">
                  <Bug className="h-3.5 w-3.5" /> CV Diagnostic Panel
                </span>
                <span className="text-[10px] text-white/40">DEV ONLY</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-white/40">Exercise:</span> {exercise.id}
                </div>
                <div>
                  <span className="text-white/40">Arm:</span> <span className="uppercase font-semibold text-teal">{side}</span>
                </div>
              </div>
              <div className="rounded bg-white/5 p-2 space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-white/40">Arm Joint Confidence</p>
                <div className="grid grid-cols-3 gap-1 text-center text-[11px]">
                  <div className="rounded bg-white/5 py-1">
                    <span className="block text-[10px] text-white/40">Shoulder</span>
                    <span className={debugStats.shoulderVis >= 50 ? 'text-teal font-bold' : 'text-amber font-bold'}>{debugStats.shoulderVis}%</span>
                  </div>
                  <div className="rounded bg-white/5 py-1">
                    <span className="block text-[10px] text-white/40">Elbow</span>
                    <span className={debugStats.elbowVis >= 50 ? 'text-teal font-bold' : 'text-amber font-bold'}>{debugStats.elbowVis}%</span>
                  </div>
                  <div className="rounded bg-white/5 py-1">
                    <span className="block text-[10px] text-white/40">Wrist</span>
                    <span className={debugStats.wristVis >= 50 ? 'text-teal font-bold' : 'text-amber font-bold'}>{debugStats.wristVis}%</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-white/40">Elbow Angle:</span>{' '}
                  <span className="font-bold text-white">{frame?.value !== null && frame?.value !== undefined ? `${frame.value.toFixed(1)}°` : '—'}</span>
                </div>
                <div>
                  <span className="text-white/40">Phase:</span>{' '}
                  <span className="font-bold text-teal">{PHASE_LABELS[exercise.id]?.[frame?.phase ?? 'READY'] ?? frame?.phase ?? 'READY'}</span>
                </div>
              </div>
              {trackDef.reps && (
                <div className="text-[10px] text-white/60 space-y-0.5 border-t border-white/10 pt-1.5">
                  <p className="text-white/40 font-semibold">Active Rep Thresholds:</p>
                  <p>Rest (Extension): &gt; {trackDef.reps.rest}° · Start: &lt; {trackDef.reps.start}°</p>
                  <p>Peak Target: ≤ {trackDef.reps.target}° · Hysteresis: ±{trackDef.reps.hysteresis}° · Min Rep: ≥{trackDef.reps.minRepMs}ms</p>
                </div>
              )}
              <div className="text-[10px] border-t border-white/10 pt-1.5 space-y-0.5">
                <p>
                  <span className="text-white/40">Tracking Status:</span>{' '}
                  <span className={frame?.tracking === 'ok' ? 'text-teal font-semibold' : 'text-amber font-semibold'}>{frame?.tracking ?? 'idle'}</span>
                  {' · '}
                  <span>Calibrated: {frame?.calibrated ? 'YES' : 'CALIBRATING'}</span>
                </p>
                <p>
                  <span className="text-white/40">Incomplete Reps:</span> {debugStats.incompleteCount}
                </p>
                <p>
                  <span className="text-white/40">Last Non-Count Reason:</span>{' '}
                  <span className={debugStats.lastRejection ? 'text-amber font-semibold' : 'text-white/60'}>
                    {debugStats.lastRejection ?? 'None (reps counting cleanly)'}
                  </span>
                </p>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function FormStatus({ frame, run, hint }: { frame: Frame | null; run: Run; hint: string }) {
  const box = 'rounded-lg border p-4 text-sm'
  if (run === 'idle' || !frame) return <div className={`${box} border-white/10 bg-slate text-white/60`}>Form check starts when the session starts.</div>
  if (!frame.calibrated)
    return <div className={`${box} border-white/10 bg-slate`}><p className="font-semibold">Calibrating starting position</p><p className="mt-1 text-white/60">{hint}</p></div>
  if (frame.warnings.length > 0) {
    const w = frame.warnings[0]
    return (
      <div className={`${box} border-amber/60 bg-amber/15`} role="status">
        <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 text-amber" aria-hidden /> {w.label}</p>
        <p className="mt-1 text-white/80">{w.advice} ({fmt(w.value, w.unit)} / limit {fmt(w.limit, w.unit)})</p>
      </div>
    )
  }
  return <div className={`${box} border-teal/40 bg-teal/10`}><p className="font-semibold">Form good</p><p className="mt-1 text-white/60">No compensation detected.</p></div>
}
