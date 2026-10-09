import { describe, expect, it } from 'vitest'
import { Ema, isReliable, jointAngle, vectorAngle, type Point } from '../lib/geometry'
import { RepMachine, SessionTracker, evidenceOf, summarize, type TrackDef } from '../lib/engine'
import { EXERCISES, exerciseById } from '../lib/exercises'

// ---------------------------------------------------------------- pose fixtures

const V = 0.9
const P = (x: number, y: number, visibility = V): Point => ({ x, y, visibility })
const rad = (d: number) => (d * Math.PI) / 180

/** Standing front-view pose. armDeg raises the right (or both) arm(s) from the side; leanX shifts the shoulders. */
function front({ armDeg = 0, leftArmDeg = 0, leanX = 0, legDeg = 0, liftLeftFoot = 0, shoulderW = 0.2, vis = V } = {}): Point[] {
  const lm = Array.from({ length: 33 }, () => P(0.5, 0.5, vis))
  lm[12] = P(0.4 + leanX, 0.3, vis); lm[11] = P(0.4 + shoulderW + leanX, 0.3, vis)
  lm[24] = P(0.4, 0.55, vis); lm[23] = P(0.6, 0.55, vis)
  lm[14] = P(lm[12].x - 0.15 * Math.sin(rad(armDeg)), 0.3 + 0.15 * Math.cos(rad(armDeg)), vis)
  lm[13] = P(lm[11].x + 0.15 * Math.sin(rad(leftArmDeg)), 0.3 + 0.15 * Math.cos(rad(leftArmDeg)), vis)
  lm[16] = P(lm[14].x, lm[14].y + 0.12, vis); lm[15] = P(lm[13].x, lm[13].y + 0.12, vis)
  lm[26] = P(0.4 - 0.2 * Math.sin(rad(legDeg)), 0.55 + 0.2 * Math.cos(rad(legDeg)), vis); lm[25] = P(0.6, 0.75, vis)
  lm[28] = P(lm[26].x, lm[26].y + 0.2, vis); lm[27] = P(0.6, 0.95 - liftLeftFoot, vis)
  lm[8] = P(0.42, 0.2, vis); lm[7] = P(0.58, 0.2, vis)
  return lm
}

/** Right side to the camera. Joint angles are set directly. */
function side({ elbowDeg = 180, kneeDeg = 180, heelLift = 0, earFwd = 0 } = {}): Point[] {
  const lm = Array.from({ length: 33 }, () => P(0.5, 0.5))
  const sh = P(0.5, 0.3), hip = P(0.5, 0.55)
  lm[12] = sh; lm[24] = hip; lm[11] = P(0.51, 0.3); lm[23] = P(0.51, 0.55)
  // Upper arm hangs down; forearm rotates forward by (180 - elbowDeg).
  lm[14] = P(0.5, 0.45)
  const f = rad(180 - elbowDeg)
  lm[16] = P(0.5 + 0.13 * Math.sin(f), 0.45 + 0.13 * Math.cos(f))
  lm[26] = P(0.5, 0.75)
  const k = rad(180 - kneeDeg)
  lm[28] = P(0.5 - 0.2 * Math.sin(k), 0.75 + 0.2 * Math.cos(k))
  lm[30] = P(lm[28].x - 0.02, lm[28].y + 0.02 - heelLift); lm[32] = P(lm[28].x + 0.06, lm[28].y + 0.02)
  lm[8] = P(0.5 + earFwd, 0.2)
  return lm
}

const ramp = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1))
const feed = (tr: SessionTracker, poses: Point[][], t0 = 0, step = 33) => poses.map((p, i) => tr.update(p, t0 + i * step, 1))
const track = (id: string) => exerciseById(id)!.track!
const tracker = (id: string, over: Partial<TrackDef> = {}) => {
  const e = exerciseById(id)!
  return new SessionTracker({ ...e.track!, emaAlpha: 1, ...over }, 'right', e.view)
}

// ---------------------------------------------------------------- geometry

describe('geometry', () => {
  it('computes known angles', () => {
    expect(jointAngle(P(1, 0), P(0, 0), P(0, 1))).toBeCloseTo(90)
    expect(jointAngle(P(1, 0), P(0, 0), P(-1, 0))).toBeCloseTo(180)
  })
  it('returns null for missing points and zero-length vectors', () => {
    expect(jointAngle(undefined, P(0, 0), P(1, 0))).toBeNull()
    expect(vectorAngle({ x: 0, y: 0 }, { x: 1, y: 0 })).toBeNull()
  })
  it('clamps floating-point cosine overshoot', () => {
    expect(vectorAngle({ x: 0.1 + 0.2, y: 0 }, { x: 0.3, y: 1e-17 })).toBeCloseTo(0)
  })
  it('rejects low-visibility and non-finite landmarks', () => {
    expect(isReliable(P(0, 0, 0.2), 0.5)).toBe(false)
    expect(isReliable(P(NaN, 0, 1), 0.5)).toBe(false)
  })
  it('applies EMA and resets', () => {
    const e = new Ema(0.3)
    e.next(10)
    expect(e.next(20)).toBeCloseTo(13)
    e.reset()
    expect(e.next(50)).toBe(50)
  })
})

// ---------------------------------------------------------------- rep state machine, per exercise

describe('rep state machine for every rep-based exercise', () => {
  const repExercises = EXERCISES.filter((e) => e.track?.mode === 'reps')
  it('covers the expected exercises', () => expect(repExercises.length).toBeGreaterThanOrEqual(14))

  for (const e of repExercises) {
    const c = e.track!.reps!
    const s = c.direction === 'up' ? 1 : -1
    const restV = c.rest - s * 2
    const beyond = c.target + s * 3
    const partial = (c.start + c.target) / 2

    describe(e.id, () => {
      it('has ordered thresholds', () => {
        expect(s * (c.start - c.rest)).toBeGreaterThan(0)
        expect(s * (c.target - c.start)).toBeGreaterThan(0)
      })
      it('counts one full cycle exactly once', () => {
        const m = new RepMachine(c)
        const seq = [...ramp(restV, beyond, 30), ...ramp(beyond, restV, 30), ...Array(20).fill(restV)]
        const outs = seq.map((v, i) => m.update(v, i * 50)).filter(Boolean)
        expect(outs).toHaveLength(1)
        expect(outs[0]!.kind).toBe('completed')
      })
      it('rejects a partial movement as limited range', () => {
        const m = new RepMachine(c)
        const outs = [...ramp(restV, partial, 20), ...ramp(partial, restV, 20)].map((v, i) => m.update(v, i * 50)).filter(Boolean)
        expect(outs).toEqual([expect.objectContaining({ kind: 'rejected', reason: 'limited_range' })])
      })
      it('rejects a movement faster than minRepMs', () => {
        const m = new RepMachine(c)
        const outs = [restV, beyond, restV].map((v, i) => m.update(v, i * 10)).filter(Boolean)
        expect(outs).toEqual([expect.objectContaining({ kind: 'rejected', reason: 'too_fast' })])
      })
      it('ignores jitter around the start threshold', () => {
        const m = new RepMachine(c)
        const jitter = Array.from({ length: 60 }, (_, i) => (i % 2 ? c.start + s * 0.5 : c.start - s * 0.5))
        const outs = [restV, ...jitter, restV].map((v, i) => m.update(v, i * 33)).filter(Boolean)
        expect(outs.every((o) => o!.kind !== 'completed')).toBe(true)
      })
      it('does not count when starting mid-movement (not armed)', () => {
        const m = new RepMachine(c)
        const outs = ramp(beyond, restV, 30).map((v, i) => m.update(v, i * 50)).filter(Boolean)
        expect(outs).toHaveLength(0)
      })
    })
  }
})

// ---------------------------------------------------------------- exercise metrics on poses

const metric = (id: string, pose: Point[], base: number | null = null) => {
  const tr = tracker(id)
  const t = tr.def
  // call the metric through a tracker-free context
  const idx = (ref: string) => {
    const [k, part] = ref.split('.')
    const map: Record<string, [number, number]> = { ear: [7, 8], shoulder: [11, 12], elbow: [13, 14], wrist: [15, 16], hip: [23, 24], knee: [25, 26], ankle: [27, 28], heel: [29, 30], foot: [31, 32] }
    return map[part][k === 'L' || k === 'O' ? 0 : 1]
  }
  return t.metric.value({ p: (r) => pose[idx(r)], side: 'right' }, base)
}

describe('exercise-specific measurements', () => {
  it('shoulder abduction reads the arm angle from the torso', () => {
    expect(metric('shoulder_abduction', front({ armDeg: 90 }))).toBeCloseTo(90, 0)
  })
  it('arm raise uses the lower of both arms', () => {
    expect(metric('arm_raise', front({ armDeg: 150, leftArmDeg: 100 }))).toBeCloseTo(100, 0)
  })
  it('elbow flexion and biceps curl read the elbow angle', () => {
    expect(metric('elbow_flexion', side({ elbowDeg: 70 }))).toBeCloseTo(70, 0)
    expect(metric('biceps_curl', side({ elbowDeg: 50 }))).toBeCloseTo(50, 0)
  })
  it('squat and seated knee extension read the knee angle', () => {
    expect(metric('squat', side({ kneeDeg: 100 }))).toBeCloseTo(100, 0)
    expect(metric('knee_extension', side({ kneeDeg: 160 }))).toBeCloseTo(160, 0)
  })
  it('hip abduction reads the thigh angle from vertical', () => {
    expect(metric('hip_abduction', front({ legDeg: 25 }))).toBeCloseTo(25, 0)
  })
  it('heel raise reads heel lift relative to the toes and its baseline', () => {
    const base = 0.0
    expect(metric('heel_raise', side({ heelLift: 0.012 }), base)!).toBeGreaterThan(3)
    expect(metric('heel_raise', side(), null)).toBeNull() // needs calibration first
  })
  it('trunk rotation estimates turn from shoulder narrowing', () => {
    expect(metric('trunk_rotation', front({ shoulderW: 0.1 }), 0.2)).toBeCloseTo(60, 0)
  })
  it('posture reads the ear–shoulder line from vertical', () => {
    expect(metric('posture', side())).toBeCloseTo(0, 0)
    expect(metric('posture', side({ earFwd: 0.1 }))).toBeCloseTo(45, 0)
  })
  it('lists external rotation without tracking, with a reason', () => {
    const e = exerciseById('shoulder_external_rotation')!
    expect(e.track).toBeUndefined()
    expect(e.status).toBe('unsupported')
    expect(e.limitations[0]).toMatch(/cannot measure/i)
  })
})

// ---------------------------------------------------------------- session tracker

const calibrate = (tr: SessionTracker, pose: Point[]) => feed(tr, Array(30).fill(pose)).at(-1)!

describe('session tracker', () => {
  it('calibrates in the starting position before counting', () => {
    const tr = tracker('shoulder_abduction')
    expect(tr.update(front({ armDeg: 10 }), 0, 1).phase).toBe('CALIBRATING')
    expect(calibrate(tr, front({ armDeg: 10 })).calibrated).toBe(true)
  })

  it('waits for the starting position (sit-to-stand must start seated)', () => {
    const tr = tracker('sit_to_stand')
    calibrate(tr, side()) // standing: hip angle ~180, not the seated start
    expect(tr.isCalibrated).toBe(false)
  })

  it('counts a real abduction rep from poses', () => {
    const tr = tracker('shoulder_abduction', { emaAlpha: 0.3 })
    calibrate(tr, front({ armDeg: 10 }))
    feed(tr, [...ramp(10, 110, 20), ...ramp(110, 10, 20)].map((a) => front({ armDeg: a })), 2000)
    expect(tr.reps).toHaveLength(1)
    expect(tr.reps[0].peak!).toBeGreaterThan(95)
  })

  it('aborts an in-progress rep after tracking loss and never completes it from stale values', () => {
    const tr = tracker('shoulder_abduction')
    calibrate(tr, front({ armDeg: 10 }))
    feed(tr, ramp(10, 110, 20).map((a) => front({ armDeg: a })), 2000)
    const lost = feed(tr, Array(25).fill(front({ armDeg: 110, vis: 0.1 })), 2700)
    expect(lost.at(-1)!.phase).toBe('TRACKING_LOST')
    expect(tr.incompleteReps).toBe(1)
    feed(tr, ramp(110, 10, 20).map((a) => front({ armDeg: a })), 3600)
    expect(tr.reps).toHaveLength(0)
  })

  it('survives a short dropout within the grace period', () => {
    const tr = tracker('shoulder_abduction')
    calibrate(tr, front({ armDeg: 10 }))
    feed(tr, ramp(10, 110, 20).map((a) => front({ armDeg: a })), 2000)
    expect(tr.update(undefined, 2700, 1).tracking).toBe('no_pose')
    feed(tr, ramp(110, 10, 20).map((a) => front({ armDeg: a })), 2733)
    expect(tr.reps).toHaveLength(1)
  })

  it('discards an in-progress rep on pause/resume (resetTransient)', () => {
    const tr = tracker('shoulder_abduction')
    calibrate(tr, front({ armDeg: 10 }))
    feed(tr, ramp(10, 110, 20).map((a) => front({ armDeg: a })), 2000)
    tr.resetTransient()
    feed(tr, ramp(110, 10, 20).map((a) => front({ armDeg: a })), 9000)
    expect(tr.reps).toHaveLength(0)
  })

  it('warns once for persistent trunk lean and clears with hysteresis', () => {
    const tr = tracker('shoulder_abduction')
    calibrate(tr, front({ armDeg: 10 }))
    const frames = feed(tr, Array(30).fill(front({ armDeg: 10, leanX: 0.08 })), 2000)
    expect(frames.flatMap((f) => f.newEvents).filter((e) => e.type === 'trunk_lean')).toHaveLength(1)
    expect(feed(tr, Array(5).fill(front({ armDeg: 10 })), 4000).at(-1)!.warnings).toHaveLength(0)
  })

  it('ignores a brief lean shorter than the persistence window', () => {
    const tr = tracker('shoulder_abduction')
    calibrate(tr, front({ armDeg: 10 }))
    feed(tr, Array(5).fill(front({ armDeg: 10, leanX: 0.08 })), 2000)
    feed(tr, Array(5).fill(front({ armDeg: 10 })), 2200)
    expect(tr.events).toHaveLength(0)
  })

  it('flags a camera view that does not match the exercise', () => {
    const tr = tracker('shoulder_abduction') // front-view exercise
    const sideways = front({ armDeg: 10, shoulderW: 0.02 })
    calibrate(tr, sideways)
    const frames = feed(tr, Array(40).fill(sideways), 2000)
    expect(frames.flatMap((f) => f.newEvents).map((e) => e.type)).toContain('camera_view')
  })

  it('switching exercises switches the measurement on the same pose', () => {
    const pose = front({ armDeg: 90, legDeg: 20 })
    const a = tracker('shoulder_abduction'); const b = tracker('hip_abduction')
    calibrate(a, front()); calibrate(b, front())
    expect(a.update(pose, 2000, 1).value!).toBeCloseTo(90, 0)
    expect(b.update(pose, 2000, 1).value!).toBeCloseTo(20, 0)
  })

  it('records a balance hold of at least 3 s and ignores shorter ones', () => {
    const tr = tracker('balance')
    calibrate(tr, front())
    feed(tr, Array(30).fill(front({ liftLeftFoot: 0.1 })), 2000, 50) // 1.5 s
    feed(tr, Array(20).fill(front()), 3500, 50)
    expect(tr.reps).toHaveLength(0)
    feed(tr, Array(80).fill(front({ liftLeftFoot: 0.1 })), 5000, 50) // 4 s
    feed(tr, Array(20).fill(front()), 9000, 50)
    expect(tr.reps).toHaveLength(1)
    expect(tr.reps[0].durationMs).toBeGreaterThanOrEqual(3000)
  })

  it('monitors posture and reports time within the good range', () => {
    const tr = tracker('posture')
    calibrate(tr, side())
    feed(tr, Array(300).fill(side()), 2000)
    feed(tr, Array(100).fill(side({ earFwd: 0.1 })), 20000)
    const s = summarize(tr, { id: 'x', exercise: 'posture', version: 1, sided: true }, new Date(0), new Date(1), 30000)
    expect(s.extra.good_pct).toBeCloseTo(75, 0)
    expect(s.events.map((e) => e.type)).toContain('forward_head')
  })
})

describe('evidence and summary', () => {
  it('labels sessions honestly', () => {
    expect(evidenceOf(false, 1, true)).toBe('insufficient')
    expect(evidenceOf(true, null, true)).toBe('insufficient')
    expect(evidenceOf(true, 0.6, true)).toBe('partial')
    expect(evidenceOf(true, 0.95, false)).toBe('partial')
    expect(evidenceOf(true, 0.95, true)).toBe('complete')
  })
  it('reports the best value in the exercise direction', () => {
    const tr = tracker('elbow_flexion')
    calibrate(tr, side())
    feed(tr, [...ramp(170, 60, 25), ...ramp(60, 170, 25)].map((d) => side({ elbowDeg: d })), 2000)
    const s = summarize(tr, { id: 'x', exercise: 'elbow_flexion', version: 1, sided: true }, new Date(0), new Date(1), 5000)
    expect(s.validReps).toBe(1)
    expect(s.peak!).toBeLessThan(65) // smaller elbow angle = more flexion
    expect(s.direction).toBe('down')
    expect(s.side).toBe('right')
  })
  it('every tracked exercise has a starting hint and voice cues', () => {
    for (const e of EXERCISES.filter((x) => x.track)) {
      expect(track(e.id).startHint.length).toBeGreaterThan(5)
      expect(track(e.id).cues.ready.length).toBeGreaterThan(3)
    }
  })
})
