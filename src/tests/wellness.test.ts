import { describe, expect, it } from 'vitest'
import { isWithinQuietHours } from '../lib/reminders'
import { computeTodayStats, computeWeeklyStats } from '../lib/wellnessStats'
import { WELLNESS_ROUTINES, routineById } from '../lib/wellnessRoutines'
import { exerciseById } from '../lib/exercises'
import type { SessionRow } from '../lib/supabase'

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

describe('Wellness Guided Routines', () => {
  it('contains valid curated routines that map to trackable exercises in EXERCISES', () => {
    expect(WELLNESS_ROUTINES.length).toBeGreaterThanOrEqual(4)

    for (const routine of WELLNESS_ROUTINES) {
      const ex = exerciseById(routine.exerciseId)
      expect(ex).toBeDefined()
      expect(ex?.track).toBeDefined() // Must have tracking support
      expect(routine.durationMinutes).toBeGreaterThan(0)
    }
  })

  it('retrieves routine by id', () => {
    const r = routineById('neck-posture-reset')
    expect(r).toBeDefined()
    expect(r?.exerciseId).toBe('posture')
  })
})

describe('Daily Goals and Stats Computation', () => {
  function makeSession(id: string, date: Date, exercise: string, durationMs: number, validReps: number): SessionRow {
    return {
      id,
      user_id: 'user-1',
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

  it('handles empty sessions gracefully without error', () => {
    const today = new Date('2026-10-09T12:00:00')
    const weekly = computeWeeklyStats([], today)

    expect(weekly.days).toHaveLength(7)
    expect(weekly.totalWeekSessions).toBe(0)
    expect(weekly.totalWeekMinutes).toBe(0)
    expect(weekly.activeDaysCount).toBe(0)
    expect(weekly.currentStreakDays).toBe(0)
    expect(weekly.mostFrequentExercise).toBeNull()
  })
})
