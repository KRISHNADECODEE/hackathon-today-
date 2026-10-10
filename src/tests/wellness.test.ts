import { describe, expect, it } from 'vitest'
import { isWithinQuietHours } from '../lib/reminders'
import { getNextReminderInfo } from '../lib/useDeskReminders'
import { computeTodayStats, computeWeeklyStats } from '../lib/wellnessStats'
import { WELLNESS_ROUTINES, routineById } from '../lib/wellnessRoutines'
import { exerciseById } from '../lib/exercises'
import { SessionTracker } from '../lib/engine'
import type { SessionRow } from '../lib/supabase'
import type { DeskReminderPrefs } from '../lib/prefs'
import type { Point } from '../lib/geometry'
import { queuedSessionToRow } from '../lib/offlineQueue'

describe('Quiet Hours Timing', () => {
  it('correctly handles overnight quiet hours (18:00 to 09:00)', () => {
    // 20:00 -> within quiet hours
    const evening = new Date('2026-10-09T20:00:00')
    expect(isWithinQuietHours('18:00', '09:00', evening)).toBe(true)

    // 23:59 -> within quiet hours
    const midnight = new Date('2026-10-09T23:59:00')
    expect(isWithinQuietHours('18:00', '09:00', midnight)).toBe(true)

    // 04:00 -> within quiet hours
    const earlyMorning = new Date('2026-10-09T04:00:00')
    expect(isWithinQuietHours('18:00', '09:00', earlyMorning)).toBe(true)

    // 14:00 -> outside quiet hours
    const afternoon = new Date('2026-10-09T14:00:00')
    expect(isWithinQuietHours('18:00', '09:00', afternoon)).toBe(false)
  })

  it('correctly handles daytime quiet hours (12:00 to 14:00)', () => {
    const noon = new Date('2026-10-09T12:30:00')
    expect(isWithinQuietHours('12:00', '14:00', noon)).toBe(true)

    const morning = new Date('2026-10-09T10:00:00')
    expect(isWithinQuietHours('12:00', '14:00', morning)).toBe(false)
  })
})

describe('Next Reminder Calculation & Status', () => {
  const basePrefs: DeskReminderPrefs = {
    enabled: true,
    intervalMinutes: 30,
    sound: true,
    quietHoursEnabled: false,
    quietHoursStart: '18:00',
    quietHoursEnd: '09:00',
    pausedUntil: null,
  }

  it('reports disabled status when master toggle is off', () => {
    const info = getNextReminderInfo({ ...basePrefs, enabled: false }, Date.now())
    expect(info.status).toBe('disabled')
    expect(info.label).toBe('Reminders disabled')
  })

  it('reports paused status when pausedUntil is in the future', () => {
    const futureTime = Date.now() + 3600000 // 1 hour ahead
    const info = getNextReminderInfo({ ...basePrefs, pausedUntil: futureTime }, Date.now())
    expect(info.status).toBe('paused')
    expect(info.label).toContain('Paused until')
  })

  it('reports quiet hours status during quiet window', () => {
    const evening = new Date('2026-10-09T21:00:00').getTime()
    const info = getNextReminderInfo(
      { ...basePrefs, quietHoursEnabled: true, quietHoursStart: '18:00', quietHoursEnd: '09:00' },
      evening
    )
    expect(info.status).toBe('quiet_hours')
    expect(info.label).toContain('Quiet hours active')
  })

  it('computes scheduled next reminder countdown accurately', () => {
    const now = Date.now()
    const info = getNextReminderInfo(basePrefs, now)
    expect(info.status).toBe('scheduled')
    expect(info.label).toMatch(/Next cue in ~\d+ min/)
  })
})

describe('Wellness Guided Routines', () => {
  it('contains valid curated routines that map to trackable exercises in EXERCISES', () => {
    expect(WELLNESS_ROUTINES.length).toBeGreaterThanOrEqual(4)

    for (const routine of WELLNESS_ROUTINES) {
      const ex = exerciseById(routine.exerciseId)
      expect(ex).toBeDefined()
      expect(ex?.track).toBeDefined()
      expect(routine.durationMinutes).toBeGreaterThan(0)
      expect(routine.instructions.length).toBeGreaterThan(0)
      expect(routine.benefits.length).toBeGreaterThan(0)
    }
  })

  it('retrieves routine by id', () => {
    const r = routineById('neck-posture-reset')
    expect(r).toBeDefined()
    expect(r?.exerciseId).toBe('posture')
  })
})

describe('Daily Goals, Active Time and History Computation', () => {
  function makeSession(
    id: string,
    date: Date,
    exercise: string,
    durationMs: number,
    validReps: number,
    userId = 'user-1'
  ): SessionRow {
    return {
      id,
      user_id: userId,
      exercise,
      exercise_version: 1,
      mode: exercise === 'posture' ? 'monitor' : 'reps',
      metric_label: 'test',
      metric_unit: 'deg',
      direction: 'up',
      side: 'right',
      started_at: date.toISOString(),
      ended_at: new Date(date.getTime() + durationMs).toISOString(),
      duration_ms: durationMs,
      valid_reps: validReps,
      incomplete_reps: 0,
      peak_rom_deg: 90,
      mean_peak_rom_deg: 90,
      tracking_quality: 0.95,
      torso_calibrated: true,
      evidence: 'complete',
      summary: {},
      saved_at: date.toISOString(),
    }
  }

  it('handles brand new user empty dashboard with 0 activity honestly', () => {
    const today = new Date('2026-10-09T12:00:00')
    const stats = computeTodayStats([], { activeMinutes: 10, breakSessions: 2 }, today)
    expect(stats.completedSessions).toBe(0)
    expect(stats.activeMinutes).toBe(0)
    expect(stats.validReps).toBe(0)
    expect(stats.minutesGoalProgress).toBe(0)
    expect(stats.sessionsGoalProgress).toBe(0)
    expect(stats.goalsMet).toBe(false)

    const weekly = computeWeeklyStats([], today)
    expect(weekly.days).toHaveLength(7)
    expect(weekly.totalWeekMinutes).toBe(0)
    expect(weekly.totalWeekSessions).toBe(0)
    expect(weekly.currentStreakDays).toBe(0)
  })

  it('computes today stats accurately from real session records', () => {
    const s1 = makeSession('s1', new Date('2026-10-09T10:00:00'), 'sit_to_stand', 120000, 10) // 2 min, 10 reps
    const s2 = makeSession('s2', new Date('2026-10-09T14:00:00'), 'posture', 180000, 0) // 3 min, posture
    const sOld = makeSession('sOld', new Date('2026-10-08T14:00:00'), 'arm_raise', 120000, 8)

    const goals = { activeMinutes: 10, breakSessions: 2 }
    const stats = computeTodayStats([s1, s2, sOld], goals, new Date('2026-10-09T15:00:00'))

    expect(stats.completedSessions).toBe(2)
    expect(stats.activeMinutes).toBe(5) // (120000 + 180000) / 60000 = 5 mins
    expect(stats.validReps).toBe(10)
    expect(stats.postureChecksCount).toBe(1)
    expect(stats.minutesGoalProgress).toBe(50) // 5 / 10 = 50%
    expect(stats.sessionsGoalProgress).toBe(100) // 2 / 2 = 100%
    expect(stats.goalsMet).toBe(false) // active minutes 5 < 10
  })

  it('calculates weekly 7-day distribution and streaks accurately', () => {
    const today = new Date('2026-10-09T12:00:00')
    const yesterday = new Date('2026-10-08T12:00:00')
    const twoDaysAgo = new Date('2026-10-07T12:00:00')

    const sToday = makeSession('s1', today, 'sit_to_stand', 120000, 10)
    const sYest = makeSession('s2', yesterday, 'arm_raise', 120000, 8)
    const sTwoAgo = makeSession('s3', twoDaysAgo, 'posture', 120000, 0)

    const weekly = computeWeeklyStats([sToday, sYest, sTwoAgo], today)

    expect(weekly.days).toHaveLength(7)
    expect(weekly.totalWeekSessions).toBe(3)
    expect(weekly.totalWeekMinutes).toBe(6) // 2 + 2 + 2
    expect(weekly.activeDaysCount).toBe(3)
    expect(weekly.currentStreakDays).toBe(3) // 3 consecutive days
  })

  it('isolates user sessions so private records cannot mix across users', () => {
    const today = new Date('2026-10-09T12:00:00')
    const user1Sessions = [makeSession('s1', today, 'sit_to_stand', 120000, 10, 'user-1')]
    const user2Sessions = [makeSession('s2', today, 'biceps_curl', 180000, 12, 'user-2')]

    // User 1 sees only user 1's stats
    const stats1 = computeTodayStats(user1Sessions, { activeMinutes: 10, breakSessions: 2 }, today)
    expect(stats1.completedSessions).toBe(1)
    expect(stats1.activeMinutes).toBe(2)

    // User 2 sees only user 2's stats
    const stats2 = computeTodayStats(user2Sessions, { activeMinutes: 10, breakSessions: 2 }, today)
    expect(stats2.completedSessions).toBe(1)
    expect(stats2.activeMinutes).toBe(3)
  })

  it('accurately counts offline queued sessions converted via queuedSessionToRow in today stats', () => {
    const today = new Date('2026-10-09T12:00:00')
    const onlineSession = makeSession('online-1', new Date('2026-10-09T09:00:00'), 'posture', 120000, 0, 'user-1')

    // Simulate an offline queued session
    const offlineQueued = {
      id: 'offline-1',
      userId: 'user-1',
      status: 'pending' as const,
      queuedAt: new Date('2026-10-09T11:00:00').toISOString(),
      retryCount: 0,
      summary: {
        id: 'offline-1',
        exercise: 'sit_to_stand',
        exerciseVersion: 1,
        mode: 'reps' as const,
        metricLabel: 'Reps',
        metricUnit: 'deg' as const,
        direction: 'up' as const,
        side: 'both' as const,
        startedAt: new Date('2026-10-09T11:00:00').toISOString(),
        endedAt: new Date('2026-10-09T11:02:00').toISOString(),
        durationMs: 120000,
        validReps: 10,
        incompleteReps: 0,
        peak: 90,
        meanPeak: 90,
        trackingQuality: 0.95,
        calibrated: true,
        evidence: 'complete' as const,
        extra: {},
        reps: [],
        events: [],
      },
    }

    const offlineRow = queuedSessionToRow(offlineQueued)
    expect(offlineRow.id).toBe('offline-1')
    expect(offlineRow.exercise).toBe('sit_to_stand')
    expect(offlineRow.valid_reps).toBe(10)

    const combinedStats = computeTodayStats([onlineSession, offlineRow], { activeMinutes: 10, breakSessions: 2 }, today)
    expect(combinedStats.completedSessions).toBe(2)
    expect(combinedStats.activeMinutes).toBe(4) // 2 min + 2 min
    expect(combinedStats.validReps).toBe(10)
    expect(combinedStats.postureChecksCount).toBe(1)
  })

  it('distinguishes self-directed wellness sessions from clinical plans via plan_id', () => {
    const today = new Date('2026-10-09T12:00:00')
    const selfDirected = makeSession('s-wellness', today, 'sit_to_stand', 120000, 10)
    expect(selfDirected.plan_id).toBeUndefined()

    const clinicalSession: SessionRow = {
      ...selfDirected,
      id: 's-clinical',
      plan_id: 'plan-rx-101',
    }
    expect(clinicalSession.plan_id).toBe('plan-rx-101')
  })
})

describe('Posture Awareness & Exercise Engines', () => {
  const P = (x: number, y: number, visibility = 0.95): Point => ({ x, y, visibility })

  function makeSidePose({ earY = 0.2, earX = 0.5, shoulderY = 0.35, shoulderX = 0.5 } = {}): Point[] {
    const lm = Array.from({ length: 33 }, () => P(0.5, 0.5))
    // S.ear (left or right side depending on orientation, side: right uses index 8, left index 7)
    lm[7] = P(earX, earY)
    lm[8] = P(earX, earY)
    lm[11] = P(shoulderX, shoulderY)
    lm[12] = P(shoulderX, shoulderY)
    return lm
  }

  it('posture exercise starts in monitor mode and tracks cervical alignment honestly', () => {
    const postureEx = exerciseById('posture')!
    expect(postureEx).toBeDefined()
    expect(postureEx.track?.mode).toBe('monitor')

    const tracker = new SessionTracker(postureEx.track!, 'right', postureEx.view)
    // Upright posture: ear vertically aligned with shoulder (earX = shoulderX)
    const uprightPose = makeSidePose({ earX: 0.5, earY: 0.2, shoulderX: 0.5, shoulderY: 0.35 })

    let lastFrame
    for (let i = 0; i < 35; i++) {
      lastFrame = tracker.update(uprightPose, i * 40, 1)
    }

    expect(tracker.isCalibrated).toBe(true)
    expect(lastFrame?.tracking).toBe('ok')
    expect(lastFrame?.phase).toBe('MONITORING')
    expect(lastFrame?.value).toBeLessThanOrEqual(5) // Virtually 0 degrees forward tilt
  })

  it('flags forward-head posture when head drifts forward of shoulder', () => {
    const postureEx = exerciseById('posture')!
    const tracker = new SessionTracker(postureEx.track!, 'right', postureEx.view)

    // Calibrate in upright posture
    for (let i = 0; i < 35; i++) {
      tracker.update(makeSidePose({ earX: 0.5, earY: 0.2, shoulderX: 0.5, shoulderY: 0.35 }), i * 40, 1)
    }

    // Slump head forward: ear drifts forward to earX = 0.65 (tilt ~ 45 degrees)
    const slouchedPose = makeSidePose({ earX: 0.65, earY: 0.2, shoulderX: 0.5, shoulderY: 0.35 })
    let slouchedFrame
    for (let i = 0; i < 30; i++) {
      slouchedFrame = tracker.update(slouchedPose, 1400 + i * 100, 1)
    }

    expect(slouchedFrame?.value).toBeGreaterThan(25) // High forward-head angle detected
    expect(slouchedFrame?.warnings.length).toBeGreaterThan(0) // Warning triggered
  })

  it('preserves existing shoulder abduction and biceps curl exercise definitions', () => {
    const shoulder = exerciseById('shoulder_abduction')
    expect(shoulder).toBeDefined()
    expect(shoulder?.track?.mode).toBe('reps')
    expect(shoulder?.track?.reps?.direction).toBe('up')

    const biceps = exerciseById('biceps_curl')
    expect(biceps).toBeDefined()
    expect(biceps?.track?.mode).toBe('reps')
    expect(biceps?.track?.reps?.direction).toBe('down')
    expect(biceps?.track?.reps?.target).toBe(75) // Verified target
    expect(biceps?.track?.reps?.rest).toBe(130) // Verified rest
  })
})
