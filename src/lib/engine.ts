// Reusable tracking engine: landmark reliability, smoothing, calibration, form checks,
// and three session modes (reps / hold / monitor). Exercise specifics live in exercises.ts.
import { Ema, isReliable, toSquare, type Point } from './geometry'

export type Side = 'left' | 'right'
type Part = 'nose' | 'ear' | 'shoulder' | 'elbow' | 'wrist' | 'hip' | 'knee' | 'ankle' | 'heel' | 'foot'
// MediaPipe Pose indices as [left, right] (person's own sides).
const IDX: Record<Part, [number, number]> = {
  nose: [0, 0], ear: [7, 8], shoulder: [11, 12], elbow: [13, 14], wrist: [15, 16],
  hip: [23, 24], knee: [25, 26], ankle: [27, 28], heel: [29, 30], foot: [31, 32],
}
/** S = selected side, O = other side, L/R = fixed side. */
export type Ref = `${'S' | 'O' | 'L' | 'R'}.${Part}`

export function landmarkIndex(ref: Ref, side: Side): number {
  const [k, part] = ref.split('.') as ['S' | 'O' | 'L' | 'R', Part]
  const [l, r] = IDX[part]
  const left = k === 'L' || (k === 'S' && side === 'left') || (k === 'O' && side === 'right')
  return left ? l : r
}

export type Ctx = { p: (ref: Ref) => Point; side: Side }
export type Unit = 'deg' | 'pct' | 's'

export type RepConfig = {
  direction: 'up' | 'down' // does the metric rise or fall during the movement?
  rest: number             // at rest beyond this (below for up, above for down)
  start: number            // movement begins past this
  target: number           // a rep counts only if it reaches this
  hysteresis: number       // must come back this far from target to start returning
  minRepMs: number         // faster cycles are rejected as too fast
}

export type CheckDef = {
  id: string
  label: string
  advice: string           // on-screen guidance, plain language
  voice: string
  unit: Unit
  needs: Ref[]             // check runs only when these are reliable
  baseline?: (c: Ctx) => number | null
  value: (c: Ctx, base: number | null) => number | null
  warnAbove: number
  clearBelow: number
  persistMs: number
}

export type TrackDef = {
  required: Ref[]
  minVisibility?: number
  emaAlpha?: number
  metric: {
    label: string
    unit: Unit
    value: (c: Ctx, base: number | null) => number | null
    baseline?: (c: Ctx) => number | null // averaged over calibration frames
  }
  mode: 'reps' | 'hold' | 'monitor'
  reps?: RepConfig
  hold?: { inPosition: (c: Ctx) => boolean; minHoldMs: number; targetHoldMs: number }
  monitor?: { goodBelow: number }
  checks: CheckDef[]
  startHint: string // starting position the user must hold to calibrate
  cues: { ready: string; incomplete: string; tooFast: string }
}

export const ENGINE = { minVisibility: 0.5, emaAlpha: 0.3, lostGraceMs: 500, calibrationFrames: 30, holdGapMs: 300 }

// ---------------------------------------------------------------- rep state machine

export type RepPhase = 'READY' | 'MOVING' | 'PEAK' | 'RETURNING'
export type RepOutcome =
  | { kind: 'completed'; peak: number; durationMs: number; startMs: number }
  | { kind: 'rejected'; reason: 'limited_range' | 'too_fast'; peak: number; startMs: number }
  | null

/** One movement cycle = one rep. Works on any scalar metric, rising or falling. */
export class RepMachine {
  phase: RepPhase = 'READY'
  private armed = false // must see the rest position before the first rep
  private rep: { start: number; best: number } | null = null
  private s: 1 | -1
  private c: RepConfig
  constructor(c: RepConfig) {
    this.c = c
    this.s = c.direction === 'up' ? 1 : -1
  }
  /** Normalized so "further into the movement" is always larger. */
  private n = (v: number) => v * this.s

  inRest(v: number) {
    return this.n(v) < this.n(this.c.rest)
  }
  get inProgress() {
    return this.rep !== null
  }

  update(v: number, t: number): RepOutcome {
    const c = this.c
    const x = this.n(v)
    const [rest, start, target] = [c.rest, c.start, c.target].map(this.n)
    if (this.rep) this.rep.best = Math.max(this.rep.best, x)
    switch (this.phase) {
      case 'READY':
        if (x < rest) this.armed = true
        else if (this.armed && x > start) {
          this.phase = x >= target ? 'PEAK' : 'MOVING' // low frame rates can jump straight to the target
          this.rep = { start: t, best: x }
        }
        return null
      case 'MOVING':
        if (x >= target) this.phase = 'PEAK'
        else if (x < rest) return this.finish('rejected', t, 'limited_range')
        return null
      case 'PEAK':
      case 'RETURNING':
        if (x >= target) this.phase = 'PEAK'
        // Dropping below rest may arrive straight from PEAK at low frame rates.
        else if (x < rest) return this.finish(t - this.rep!.start >= c.minRepMs ? 'completed' : 'rejected', t, 'too_fast')
        else if (x < target - c.hysteresis) this.phase = 'RETURNING'
        return null
    }
  }

  private finish(kind: 'completed' | 'rejected', t: number, reason: 'limited_range' | 'too_fast'): RepOutcome {
    const r = this.rep!
    this.phase = 'READY'
    this.rep = null
    const peak = r.best * this.s
    return kind === 'completed'
      ? { kind, peak, durationMs: t - r.start, startMs: r.start }
      : { kind, reason, peak, startMs: r.start }
  }

  reset() {
    this.phase = 'READY'
    this.armed = false
    this.rep = null
  }
}

// ---------------------------------------------------------------- session tracker

export type Phase = 'CALIBRATING' | 'TRACKING_LOST' | RepPhase | 'HOLDING' | 'MONITORING'
export type Tracking = 'ok' | 'unreliable' | 'no_pose'

export type RepRecord = {
  index: number
  peak: number | null       // best metric value reached (null for holds)
  durationMs: number
  startOffsetMs: number
  trackingQuality: number   // fraction of reliable frames during the rep/hold
  flags: string[]           // form checks that warned during it
  maxCheck: Record<string, number>
}

export type FormEvent = {
  type: string
  label: string
  offsetMs: number
  value: number | null
  threshold: number | null
  unit: Unit | null
  repIndex: number | null
}

export type ActiveCheck = { id: string; label: string; advice: string; value: number; limit: number; unit: Unit }

export type Frame = {
  tracking: Tracking
  phase: Phase
  value: number | null
  reps: number
  holdMs: number
  calibrated: boolean
  warnings: ActiveCheck[]
  newEvents: FormEvent[]
  completed: RepRecord | null
  rejected: 'limited_range' | 'too_fast' | 'tracking_lost' | null
}

type CheckState = { base: number[]; baseline: number | null; since: number | null; active: boolean; event: FormEvent | null }

/** View check: shoulder width relative to torso length tells front from side views. */
export const VIEW_CHECK = (view: 'front' | 'side'): CheckDef => ({
  id: 'camera_view',
  label: view === 'front' ? 'Face the camera' : 'Turn sideways',
  advice: view === 'front' ? 'This exercise is measured from the front. Face the camera squarely.' : 'This exercise is measured from the side. Turn so your side faces the camera.',
  voice: view === 'front' ? 'Please face the camera' : 'Please turn sideways to the camera',
  unit: 'pct',
  needs: ['L.shoulder', 'R.shoulder', 'L.hip', 'R.hip'],
  value: (c) => {
    const sw = Math.hypot(c.p('L.shoulder').x - c.p('R.shoulder').x, c.p('L.shoulder').y - c.p('R.shoulder').y)
    const mid = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
    const sh = mid(c.p('L.shoulder'), c.p('R.shoulder'))
    const hp = mid(c.p('L.hip'), c.p('R.hip'))
    const torso = Math.hypot(sh.x - hp.x, sh.y - hp.y)
    if (torso < 1e-6) return null
    const ratio = (sw / torso) * 100
    // Front: ratio ~60-90%. Side: ~0-25%. Value is "how wrong" the view looks.
    return view === 'front' ? Math.max(0, 40 - ratio) : Math.max(0, ratio - 40)
  },
  warnAbove: 0.01,
  clearBelow: 0.01,
  persistMs: 1000,
})

export class SessionTracker {
  readonly reps: RepRecord[] = []
  readonly events: FormEvent[] = []
  incompleteReps = 0
  framesTotal = 0
  framesReliable = 0
  monitorGood = 0
  monitorTotal = 0
  monitorSum = 0
  holdTotalMs = 0
  readonly def: TrackDef
  readonly side: Side
  readonly checks: CheckDef[]

  private ema: Ema
  private rm: RepMachine | null
  private calib: number[] = []
  private baseline: number | null = null
  private calibrated = false
  private lostSince: number | null = null
  private cs = new Map<string, CheckState>()
  private cur: { start: number; frames: number; ok: number; flags: Set<string>; max: Record<string, number> } | null = null
  private hold: { start: number; lastIn: number } | null = null
  private calibFrames = 0

  constructor(def: TrackDef, side: Side, view: 'front' | 'side' | 'either') {
    this.def = def
    this.side = side
    this.ema = new Ema(def.emaAlpha ?? ENGINE.emaAlpha)
    this.rm = def.reps ? new RepMachine(def.reps) : null
    this.checks = view === 'either' ? def.checks : [...def.checks, VIEW_CHECK(view)]
    for (const ch of this.checks) this.cs.set(ch.id, { base: [], baseline: null, since: null, active: false, event: null })
  }

  get isCalibrated() {
    return this.calibrated
  }

  recalibrate() {
    this.calib = []
    this.baseline = null
    this.calibrated = false
    this.calibFrames = 0
    for (const s of this.cs.values()) Object.assign(s, { base: [], baseline: null, since: null, active: false, event: null })
    this.resetTransient()
  }

  /** Drop in-progress state (after pause or long tracking loss). Completed reps are kept. */
  resetTransient() {
    this.ema.reset()
    this.rm?.reset()
    this.cur = null
    this.lostSince = null
    this.endHold(null)
    for (const s of this.cs.values()) s.since = null
  }

  /** @param t ms since session start, @param aspect frame width / height */
  update(landmarks: Point[] | undefined, t: number, aspect: number): Frame {
    const d = this.def
    const minVis = d.minVisibility ?? ENGINE.minVisibility
    this.framesTotal++
    if (this.cur) this.cur.frames++
    const reliable = (ref: Ref) => !!landmarks && isReliable(landmarks[landmarkIndex(ref, this.side)], minVis)
    const ok = !!landmarks && d.required.every(reliable)
    const newEvents: FormEvent[] = []

    if (!ok) {
      let rejected: Frame['rejected'] = null
      this.lostSince ??= t
      if (t - this.lostSince > ENGINE.lostGraceMs) {
        if (this.cur && d.mode === 'reps') { this.incompleteReps++; rejected = 'tracking_lost' }
        this.resetTransient()
        this.lostSince = t // keep the gap open until tracking returns
      }
      return this.frame(landmarks ? 'unreliable' : 'no_pose', 'TRACKING_LOST', null, [], newEvents, null, rejected)
    }
    this.lostSince = null
    this.framesReliable++
    if (this.cur) this.cur.ok++

    const ctx: Ctx = { p: (ref) => toSquare(landmarks![landmarkIndex(ref, this.side)], aspect), side: this.side }
    const raw = d.metric.value(ctx, this.baseline)
    const value = raw === null || !Number.isFinite(raw) ? null : this.ema.next(raw)

    // Calibration: hold the starting position for a moment to record baselines.
    if (!this.calibrated) {
      const inStart = d.mode !== 'reps' || value === null || this.rm!.inRest(value)
      if (inStart) {
        const b = d.metric.baseline?.(ctx)
        if (b != null) this.calib.push(b)
        for (const ch of this.checks) {
          const v = ch.needs.every(reliable) ? ch.baseline?.(ctx) : null
          if (v != null) this.cs.get(ch.id)!.base.push(v)
        }
        if (++this.calibFrames >= ENGINE.calibrationFrames) {
          this.baseline = d.metric.baseline ? avg(this.calib) : null
          for (const s of this.cs.values()) s.baseline = s.base.length ? avg(s.base) : null
          this.calibrated = true
          this.ema.reset() // metric may depend on the new baseline
        }
      } else this.calibFrames = 0 // must be continuous
      return this.frame('ok', 'CALIBRATING', value, [], newEvents, null, null)
    }

    // Form checks.
    const warnings: ActiveCheck[] = []
    for (const ch of this.checks) {
      const s = this.cs.get(ch.id)!
      if (!ch.needs.every(reliable) || (ch.baseline && s.baseline === null)) { s.since = null; continue }
      const v = ch.value(ctx, s.baseline)
      if (v === null) continue
      if (this.cur) this.cur.max[ch.id] = Math.max(this.cur.max[ch.id] ?? 0, v)
      if (!s.active && v > ch.warnAbove) {
        s.since ??= t
        if (t - s.since >= ch.persistMs) {
          s.active = true
          s.event = { type: ch.id, label: ch.label, offsetMs: t, value: v, threshold: ch.warnAbove, unit: ch.unit, repIndex: this.cur ? this.reps.length + 1 : null }
          this.events.push(s.event)
          newEvents.push(s.event)
        }
      } else if (v <= ch.warnAbove) s.since = null
      if (s.active) {
        if (s.event) s.event.value = Math.max(s.event.value ?? 0, v) // peak of this warning episode
        this.cur?.flags.add(ch.id)
        if (v < ch.clearBelow) s.active = false
        else warnings.push({ id: ch.id, label: ch.label, advice: ch.advice, value: v, limit: ch.warnAbove, unit: ch.unit })
      }
    }

    if (d.mode === 'monitor') {
      if (value !== null) {
        this.monitorTotal++
        this.monitorSum += value
        if (value < d.monitor!.goodBelow) this.monitorGood++
      }
      return this.frame('ok', 'MONITORING', value, warnings, newEvents, null, null)
    }

    if (d.mode === 'hold') return this.updateHold(ctx, t, warnings, newEvents)

    // Reps mode.
    if (value === null) return this.frame('ok', this.rm!.phase, null, warnings, newEvents, null, null)
    const wasIdle = !this.rm!.inProgress
    const out = this.rm!.update(value, t)
    if (wasIdle && this.rm!.inProgress) this.cur = { start: t, frames: 1, ok: 1, flags: new Set(), max: {} }
    let completed: RepRecord | null = null
    let rejected: Frame['rejected'] = null
    if (out && this.cur) {
      if (out.kind === 'completed') {
        completed = {
          index: this.reps.length + 1, peak: out.peak, durationMs: out.durationMs, startOffsetMs: out.startMs,
          trackingQuality: this.cur.ok / this.cur.frames, flags: [...this.cur.flags], maxCheck: this.cur.max,
        }
        this.reps.push(completed)
      } else {
        this.incompleteReps++
        rejected = out.reason
        const ev: FormEvent = out.reason === 'too_fast'
          ? { type: 'too_fast', label: 'Movement too fast', offsetMs: t, value: t - out.startMs, threshold: d.reps!.minRepMs, unit: null, repIndex: null }
          : { type: 'limited_range', label: 'Did not reach target', offsetMs: t, value: out.peak, threshold: d.reps!.target, unit: d.metric.unit, repIndex: null }
        this.events.push(ev)
        newEvents.push(ev)
      }
      this.cur = null
    }
    return this.frame('ok', this.rm!.phase, value, warnings, newEvents, completed, rejected)
  }


  private updateHold(ctx: Ctx, t: number, warnings: ActiveCheck[], newEvents: FormEvent[]): Frame {
    const h = this.def.hold!
    let completed: RepRecord | null = null
    if (h.inPosition(ctx)) {
      if (!this.hold) {
        this.hold = { start: t, lastIn: t }
        this.cur = { start: t, frames: 1, ok: 1, flags: new Set(), max: {} }
      }
      this.hold.lastIn = t
    } else if (this.hold && t - this.hold.lastIn > ENGINE.holdGapMs) {
      completed = this.endHold(this.hold.lastIn)
    }
    const holdMs = this.hold ? t - this.hold.start : 0
    return this.frame('ok', this.hold ? 'HOLDING' : 'READY', holdMs / 1000, warnings, newEvents, completed, null, holdMs)
  }

  private endHold(end: number | null): RepRecord | null {
    const h = this.hold
    this.hold = null
    const cur = this.cur
    this.cur = null
    if (!h || end === null || !cur) return null
    const durationMs = end - h.start
    this.holdTotalMs += durationMs
    if (durationMs < this.def.hold!.minHoldMs) return null
    const rec: RepRecord = {
      index: this.reps.length + 1, peak: null, durationMs, startOffsetMs: h.start,
      trackingQuality: cur.ok / cur.frames, flags: [...cur.flags], maxCheck: cur.max,
    }
    this.reps.push(rec)
    return rec
  }

  /** Close an open hold when the session ends. */
  finish(t: number) {
    if (this.hold) this.endHold(Math.min(t, this.hold.lastIn))
  }

  private frame(tracking: Tracking, phase: Phase, value: number | null, warnings: ActiveCheck[], newEvents: FormEvent[], completed: RepRecord | null, rejected: Frame['rejected'], holdMs = 0): Frame {
    return { tracking, phase, value, reps: this.reps.length, holdMs, calibrated: this.calibrated, warnings, newEvents, completed, rejected }
  }
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

// ---------------------------------------------------------------- summary

export type Evidence = 'complete' | 'partial' | 'insufficient'

/** Honest label of how much measured data backs a session. */
export function evidenceOf(hasMeasurement: boolean, trackingQuality: number | null, calibrated: boolean): Evidence {
  if (!hasMeasurement || trackingQuality === null) return 'insufficient'
  return trackingQuality >= 0.8 && calibrated ? 'complete' : 'partial'
}

export type SessionSummary = {
  id: string
  exercise: string
  exerciseVersion: number
  mode: TrackDef['mode']
  metricLabel: string
  metricUnit: Unit
  direction: 'up' | 'down' | null
  side: Side | 'both'
  startedAt: string
  endedAt: string
  durationMs: number
  validReps: number
  incompleteReps: number
  peak: number | null      // best value across reps (max for "up", min for "down")
  meanPeak: number | null
  trackingQuality: number | null
  calibrated: boolean
  evidence: Evidence
  reps: RepRecord[]
  events: FormEvent[]
  extra: Record<string, number | null>
}

export function summarize(
  tr: SessionTracker,
  meta: { id: string; exercise: string; version: number; sided: boolean },
  startedAt: Date, endedAt: Date, durationMs: number,
): SessionSummary {
  const d = tr.def
  const peaks = tr.reps.map((r) => r.peak).filter((p): p is number => p !== null)
  const down = d.reps?.direction === 'down'
  const trackingQuality = tr.framesTotal ? tr.framesReliable / tr.framesTotal : null
  const monitorOk = tr.monitorTotal >= 300 // ~10 s of reliable measurement
  const hasMeasurement = d.mode === 'monitor' ? monitorOk : tr.reps.length > 0
  const extra: Record<string, number | null> = {}
  if (d.mode === 'monitor') {
    extra.good_pct = tr.monitorTotal ? (tr.monitorGood / tr.monitorTotal) * 100 : null
    extra.mean_value = tr.monitorTotal ? tr.monitorSum / tr.monitorTotal : null
    extra.good_below = d.monitor!.goodBelow
  }
  if (d.mode === 'hold') {
    extra.longest_hold_ms = tr.reps.length ? Math.max(...tr.reps.map((r) => r.durationMs)) : null
    extra.total_hold_ms = tr.holdTotalMs
    extra.target_hold_ms = d.hold!.targetHoldMs
  }
  return {
    id: meta.id,
    exercise: meta.exercise,
    exerciseVersion: meta.version,
    mode: d.mode,
    metricLabel: d.metric.label,
    metricUnit: d.metric.unit,
    direction: d.reps?.direction ?? null,
    side: meta.sided ? tr.side : 'both',
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs,
    validReps: tr.reps.length,
    incompleteReps: tr.incompleteReps,
    peak: peaks.length ? (down ? Math.min(...peaks) : Math.max(...peaks)) : null,
    meanPeak: peaks.length ? avg(peaks) : null,
    trackingQuality,
    calibrated: tr.isCalibrated,
    evidence: evidenceOf(hasMeasurement, trackingQuality, tr.isCalibrated),
    reps: [...tr.reps],
    events: [...tr.events],
    extra,
  }
}
