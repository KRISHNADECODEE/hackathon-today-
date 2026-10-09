import { describe, expect, it } from 'vitest'
import { jointAngle, type Point } from '../lib/geometry'
import { SessionTracker, landmarkIndex } from '../lib/engine'
import { exerciseById } from '../lib/exercises'

const V = 0.95
const P = (x: number, y: number, visibility = V): Point => ({ x, y, visibility })
const rad = (d: number) => (d * Math.PI) / 180

/**
 * Generates synthetic MediaPipe pose landmarks for biceps curls and arm movements.
 */
function makePose({
  elbowDeg = 160,
  shoulderAbductionDeg = 15,
  side = 'right' as 'right' | 'left',
  vis = V,
  elbowVis = V,
  wristVis = V,
  hipVis = V,
} = {}): Point[] {
  const lm = Array.from({ length: 33 }, () => P(0.5, 0.5, vis))

  // Torso
  lm[11] = P(0.6, 0.25, vis) // left shoulder
  lm[12] = P(0.4, 0.25, vis) // right shoulder
  lm[23] = P(0.6, 0.65, hipVis) // left hip
  lm[24] = P(0.4, 0.65, hipVis) // right hip

  const isR = side === 'right'
  const shoulder = isR ? lm[12] : lm[11]
  const hip = isR ? lm[24] : lm[23]
  const upperArmLen = 0.18
  const forearmLen = 0.16

  // Direction from shoulder to hip (reference for torso vertical line)
  const phiTorso = Math.atan2(hip.y - shoulder.y, hip.x - shoulder.x)

  // Shoulder abduction rotates upper arm away from torso
  // For right side, abducts outward (negative X direction in image coords)
  // For left side, abducts outward (positive X direction in image coords)
  const phiElbow = phiTorso + rad(shoulderAbductionDeg) * (isR ? -1 : 1)
  const elX = shoulder.x + upperArmLen * Math.cos(phiElbow)
  const elY = shoulder.y + upperArmLen * Math.sin(phiElbow)
  const elbow = P(elX, elY, elbowVis)

  // Vector from elbow back to shoulder
  const phiBackToShoulder = Math.atan2(shoulder.y - elY, shoulder.x - elX)

  // Forearm flexes at elbowDeg relative to upper arm:
  // When elbowDeg = 180, forearm points straight opposite to upper-arm vector (hanging down/extended).
  // When elbowDeg curls to 60, forearm curls inward towards shoulder.
  const phiWrist = phiBackToShoulder + rad(elbowDeg) * (isR ? 1 : -1)
  const wrX = elX + forearmLen * Math.cos(phiWrist)
  const wrY = elY + forearmLen * Math.sin(phiWrist)
  const wrist = P(wrX, wrY, wristVis)

  if (isR) {
    lm[12] = shoulder
    lm[14] = elbow
    lm[16] = wrist
  } else {
    lm[11] = shoulder
    lm[13] = elbow
    lm[15] = wrist
  }

  return lm
}

const ramp = (a: number, b: number, n: number) =>
  Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1))

describe('Biceps Curl Repetition Engine & Angles (Regression Suite)', () => {
  const bicepsEx = exerciseById('biceps_curl')!

  it('1. Straight-arm starting position produces realistic angles ~160°–180° and calibrates cleanly', () => {
    const poseStraight = makePose({ elbowDeg: 175, side: 'right' })
    const angle = jointAngle(poseStraight[12], poseStraight[14], poseStraight[16])
    expect(angle).toBeCloseTo(175, 1)

    // Verify natural resting arm (145°) easily completes calibration (>130°)
    const tracker = new SessionTracker(bicepsEx.track!, 'right', bicepsEx.view)
    for (let i = 0; i < 35; i++) {
      tracker.update(makePose({ elbowDeg: 145 }), i * 33, 1)
    }
    expect(tracker.isCalibrated).toBe(true)
  })

  it('2. Partial curl (does not reach target) is rejected as limited_range with 0 reps counted', () => {
    const tracker = new SessionTracker(bicepsEx.track!, 'right', bicepsEx.view)
    // Calibrate in extended position
    for (let i = 0; i < 35; i++) tracker.update(makePose({ elbowDeg: 160 }), i * 33, 1)
    expect(tracker.isCalibrated).toBe(true)

    // Curl partially: 160 down to 95 (target is 75, so 95 does not reach target)
    const curl = ramp(160, 95, 20)
    const ret = ramp(95, 160, 20)
    const movement = [...curl, ...ret]
    let rejectedReason: string | null = null

    for (let i = 0; i < movement.length; i++) {
      const f = tracker.update(makePose({ elbowDeg: movement[i] }), 1200 + i * 40, 1)
      if (f.rejected) rejectedReason = f.rejected
    }

    expect(tracker.reps).toHaveLength(0)
    expect(rejectedReason).toBe('limited_range')
  })

  it('3. Complete curl and return to extension successfully increments rep counter', () => {
    const tracker = new SessionTracker(bicepsEx.track!, 'right', bicepsEx.view)
    for (let i = 0; i < 35; i++) tracker.update(makePose({ elbowDeg: 160 }), i * 33, 1)

    // Curl from 160 down to 65 (past target 75), then back to 145 (past rest 130)
    const curl = ramp(160, 65, 20)
    const ret = ramp(65, 145, 20)
    const movement = [...curl, ...ret]

    for (let i = 0; i < movement.length; i++) {
      tracker.update(makePose({ elbowDeg: movement[i] }), 1200 + i * 40, 1)
    }

    expect(tracker.reps).toHaveLength(1)
    expect(tracker.reps[0].index).toBe(1)
    expect(tracker.reps[0].peak).toBeLessThanOrEqual(75)
    expect(tracker.reps[0].durationMs).toBeGreaterThanOrEqual(600)
  })

  it('4. Several consecutive curls count all repetitions accurately', () => {
    const tracker = new SessionTracker(bicepsEx.track!, 'right', bicepsEx.view)
    for (let i = 0; i < 35; i++) tracker.update(makePose({ elbowDeg: 160 }), i * 33, 1)

    let t = 1200
    for (let rep = 1; rep <= 3; rep++) {
      const curl = ramp(150, 60, 15)
      const ret = ramp(60, 145, 15)
      for (const ang of [...curl, ...ret]) {
        tracker.update(makePose({ elbowDeg: ang }), t, 1)
        t += 40
      }
      t += 200 // pause between reps
    }

    expect(tracker.reps).toHaveLength(3)
    expect(tracker.reps.map((r) => r.index)).toEqual([1, 2, 3])
  })

  it('5. Incomplete movement (held at top without lowering) does not count rep prematurely', () => {
    const tracker = new SessionTracker(bicepsEx.track!, 'right', bicepsEx.view)
    for (let i = 0; i < 35; i++) tracker.update(makePose({ elbowDeg: 160 }), i * 33, 1)

    // Curl up to 60° and hold there for 2 seconds
    const curl = ramp(160, 60, 20)
    let t = 1200
    for (const ang of curl) {
      tracker.update(makePose({ elbowDeg: ang }), t, 1)
      t += 40
    }
    for (let i = 0; i < 30; i++) {
      tracker.update(makePose({ elbowDeg: 60 }), t, 1)
      t += 40
    }

    // Still at top, has not lowered back past rest (130) -> 0 reps completed
    expect(tracker.reps).toHaveLength(0)
  })

  it('6. Jitter near threshold does not cause double counts', () => {
    const tracker = new SessionTracker(bicepsEx.track!, 'right', bicepsEx.view)
    for (let i = 0; i < 35; i++) tracker.update(makePose({ elbowDeg: 160 }), i * 33, 1)

    // Curl to 60° (comfortably enters PEAK <= 75°), then jitter near target threshold (72°–77°)
    const curl = ramp(160, 60, 20)
    let t = 1200
    for (const ang of curl) {
      tracker.update(makePose({ elbowDeg: ang }), t, 1)
      t += 40
    }
    // Jitter around target threshold (72°–77°) for 10 frames
    // Hysteresis of 10° ensures it stays in PEAK without prematurely entering RETURNING or double-counting
    for (let i = 0; i < 10; i++) {
      const jitterAngle = i % 2 === 0 ? 72 : 77
      tracker.update(makePose({ elbowDeg: jitterAngle }), t, 1)
      t += 40
    }
    // Return to full extension (20 frames)
    const ret = ramp(75, 150, 20)
    for (const ang of ret) {
      tracker.update(makePose({ elbowDeg: ang }), t, 1)
      t += 40
    }

    // Only exactly 1 rep should be recorded
    expect(tracker.reps).toHaveLength(1)
  })

  it('7. Brief landmark loss (< 500ms grace period) recovers without losing rep', () => {
    const tracker = new SessionTracker(bicepsEx.track!, 'right', bicepsEx.view)
    for (let i = 0; i < 35; i++) tracker.update(makePose({ elbowDeg: 160 }), i * 33, 1)

    let t = 1200
    // Curl down toward peak (20 frames)
    for (const ang of ramp(160, 65, 20)) {
      tracker.update(makePose({ elbowDeg: ang }), t, 1)
      t += 40
    }
    // Lost frames for 200ms (5 frames at 40ms < 500ms grace period)
    for (let i = 0; i < 5; i++) {
      tracker.update(undefined, t, 1)
      t += 40
    }
    // Tracking resumes and lowers to full extension (20 frames)
    for (const ang of ramp(65, 145, 20)) {
      tracker.update(makePose({ elbowDeg: ang }), t, 1)
      t += 40
    }

    expect(tracker.reps).toHaveLength(1)
  })

  it('8. Missing wrist or elbow drops tracking confidence and marks tracking lost', () => {
    const tracker = new SessionTracker(bicepsEx.track!, 'right', bicepsEx.view)
    for (let i = 0; i < 35; i++) tracker.update(makePose({ elbowDeg: 160 }), i * 33, 1)

    // Wrist visibility drops to 0.1
    const frameLowVis = tracker.update(makePose({ elbowDeg: 160, wristVis: 0.1 }), 2000, 1)
    expect(frameLowVis.tracking).toBe('unreliable')
  })

  it('9. Left-arm and right-arm selection correctly targets respective landmarks', () => {
    expect(landmarkIndex('S.shoulder', 'left')).toBe(11)
    expect(landmarkIndex('S.elbow', 'left')).toBe(13)
    expect(landmarkIndex('S.wrist', 'left')).toBe(15)

    expect(landmarkIndex('S.shoulder', 'right')).toBe(12)
    expect(landmarkIndex('S.elbow', 'right')).toBe(14)
    expect(landmarkIndex('S.wrist', 'right')).toBe(16)

    // Left arm curl tracking
    const leftTracker = new SessionTracker(bicepsEx.track!, 'left', bicepsEx.view)
    for (let i = 0; i < 35; i++) leftTracker.update(makePose({ elbowDeg: 160, side: 'left' }), i * 33, 1)
    expect(leftTracker.isCalibrated).toBe(true)

    const curl = ramp(160, 65, 20)
    const ret = ramp(65, 145, 20)
    for (let i = 0; i < 40; i++) {
      leftTracker.update(makePose({ elbowDeg: [...curl, ...ret][i], side: 'left' }), 1200 + i * 40, 1)
    }
    expect(leftTracker.reps).toHaveLength(1)
  })

  it('10. Camera mirroring and 2D translations preserve elbow angle invariant', () => {
    const p1 = P(0.4, 0.25)
    const p2 = P(0.4, 0.43)
    const p3 = P(0.5, 0.35)
    const baseAngle = jointAngle(p1, p2, p3)

    // Mirrored horizontally: x' = 1 - x
    const m1 = P(1 - p1.x, p1.y)
    const m2 = P(1 - p2.x, p2.y)
    const m3 = P(1 - p3.x, p3.y)
    const mirroredAngle = jointAngle(m1, m2, m3)
    expect(mirroredAngle).toBeCloseTo(baseAngle!, 4)

    // Translated by (dx, dy)
    const t1 = P(p1.x + 0.15, p1.y - 0.08)
    const t2 = P(p2.x + 0.15, p2.y - 0.08)
    const t3 = P(p3.x + 0.15, p3.y - 0.08)
    const translatedAngle = jointAngle(t1, t2, t3)
    expect(translatedAngle).toBeCloseTo(baseAngle!, 4)
  })

  it('11. Exercise switching and session reset cleanly resets state', () => {
    const tracker = new SessionTracker(bicepsEx.track!, 'right', bicepsEx.view)
    for (let i = 0; i < 35; i++) tracker.update(makePose({ elbowDeg: 160 }), i * 33, 1)
    // Perform 1 curl over time
    const curl = ramp(160, 65, 15)
    const ret = ramp(65, 145, 15)
    const movement = [...curl, ...ret]
    for (let i = 0; i < movement.length; i++) {
      tracker.update(makePose({ elbowDeg: movement[i] }), 1200 + i * 40, 1)
    }
    expect(tracker.reps).toHaveLength(1)

    // Reset session
    tracker.resetTransient()
    tracker.recalibrate()
    expect(tracker.isCalibrated).toBe(false)
  })

  it('12. Sideways arm raise does NOT trigger biceps curl, while shoulder abduction exercise works', () => {
    // A sideways arm raise keeps the elbow straight (~170°) while shoulder elevates to 90°
    const bicepsTracker = new SessionTracker(bicepsEx.track!, 'right', bicepsEx.view)
    for (let i = 0; i < 35; i++) bicepsTracker.update(makePose({ elbowDeg: 170, shoulderAbductionDeg: 15 }), i * 33, 1)

    // Raise arm to 90° abduction and lower it back, keeping elbow straight at 170°
    const raise = ramp(15, 90, 20)
    const lower = ramp(90, 15, 20)
    for (let i = 0; i < 40; i++) {
      bicepsTracker.update(
        makePose({ elbowDeg: 170, shoulderAbductionDeg: [...raise, ...lower][i] }),
        1200 + i * 40,
        1
      )
    }
    // Must NOT count as a biceps curl!
    expect(bicepsTracker.reps).toHaveLength(0)

    // But for shoulder_abduction exercise, it DOES count a rep
    const shoulderEx = exerciseById('shoulder_abduction')!
    const shoulderTracker = new SessionTracker(shoulderEx.track!, 'right', shoulderEx.view)
    // Calibrate shoulder at rest (15°)
    for (let i = 0; i < 35; i++) shoulderTracker.update(makePose({ elbowDeg: 170, shoulderAbductionDeg: 15 }), i * 33, 1)
    expect(shoulderTracker.isCalibrated).toBe(true)

    // Perform shoulder abduction 15° -> 95° -> 20° over 40 frames at 40ms = 1600ms (minRepMs is 800ms)
    const shRaise = ramp(15, 95, 20)
    const shLower = ramp(95, 20, 20)
    for (let i = 0; i < 40; i++) {
      shoulderTracker.update(
        makePose({ elbowDeg: 170, shoulderAbductionDeg: [...shRaise, ...shLower][i] }),
        1200 + i * 40,
        1
      )
    }
    expect(shoulderTracker.reps).toHaveLength(1)
  })
})
