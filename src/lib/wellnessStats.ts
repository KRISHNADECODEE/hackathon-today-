import type { SessionRow } from './supabase'
import type { DailyGoals } from './prefs'

export type TodayStats = {
  completedSessions: number
  activeMinutes: number
  validReps: number
  postureChecksCount: number
  minutesGoalProgress: number // 0-100%
  sessionsGoalProgress: number // 0-100%
  goalsMet: boolean
}

export type DaySummary = {
  dateStr: string // 'YYYY-MM-DD'
  dayLabel: string // 'Mon', 'Tue', etc.
  isToday: boolean
  minutes: number
  sessionsCount: number
  reps: number
}

export type WeeklyStats = {
  days: DaySummary[]
  totalWeekMinutes: number
  totalWeekSessions: number
  totalWeekReps: number
  activeDaysCount: number
  currentStreakDays: number
  mostFrequentExercise: string | null
}

/** Formats a Date object to local YYYY-MM-DD */
export function toLocalDateString(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Computes today's activity stats from real session rows and the user's daily goals.
 */
export function computeTodayStats(
  sessions: SessionRow[],
  goals: DailyGoals,
  now = new Date(),
): TodayStats {
  const todayStr = toLocalDateString(now)
  const todaySessions = sessions.filter((s) => {
    try {
      return toLocalDateString(new Date(s.started_at)) === todayStr
    } catch {
      return false
    }
  })

  const completedSessions = todaySessions.length
  const totalMs = todaySessions.reduce((acc, s) => acc + (s.duration_ms || 0), 0)
  const activeMinutes = Math.round((totalMs / 60000) * 10) / 10
  const validReps = todaySessions.reduce((acc, s) => acc + (s.valid_reps || 0), 0)
  const postureChecksCount = todaySessions.filter((s) => s.exercise === 'posture').length

  const targetMinutes = Math.max(1, goals.activeMinutes || 10)
  const targetSessions = Math.max(1, goals.breakSessions || 2)

  const minutesGoalProgress = Math.min(100, Math.round((activeMinutes / targetMinutes) * 100))
  const sessionsGoalProgress = Math.min(100, Math.round((completedSessions / targetSessions) * 100))
  const goalsMet = activeMinutes >= targetMinutes && completedSessions >= targetSessions

  return {
    completedSessions,
    activeMinutes,
    validReps,
    postureChecksCount,
    minutesGoalProgress,
    sessionsGoalProgress,
    goalsMet,
  }
}

/**
 * Computes a 7-day rolling weekly activity summary and consecutive day streak.
 */
export function computeWeeklyStats(
  sessions: SessionRow[],
  now = new Date(),
): WeeklyStats {
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const days: DaySummary[] = []
  const todayStr = toLocalDateString(now)

  // Map sessions by date string
  const sessionsByDate = new Map<string, SessionRow[]>()
  for (const s of sessions) {
    try {
      const dStr = toLocalDateString(new Date(s.started_at))
      const list = sessionsByDate.get(dStr) ?? []
      list.push(s)
      sessionsByDate.set(dStr, list)
    } catch {
      // ignore invalid dates
    }
  }

  // Generate past 7 days ending with today
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const dateStr = toLocalDateString(d)
    const daySessions = sessionsByDate.get(dateStr) ?? []

    const totalMs = daySessions.reduce((acc, s) => acc + (s.duration_ms || 0), 0)
    const minutes = Math.round((totalMs / 60000) * 10) / 10
    const reps = daySessions.reduce((acc, s) => acc + (s.valid_reps || 0), 0)

    days.push({
      dateStr,
      dayLabel: dayLabels[d.getDay()] ?? '',
      isToday: dateStr === todayStr,
      minutes,
      sessionsCount: daySessions.length,
      reps,
    })
  }

  const totalWeekMinutes = Math.round(days.reduce((acc, d) => acc + d.minutes, 0) * 10) / 10
  const totalWeekSessions = days.reduce((acc, d) => acc + d.sessionsCount, 0)
  const totalWeekReps = days.reduce((acc, d) => acc + d.reps, 0)
  const activeDaysCount = days.filter((d) => d.sessionsCount > 0).length

  // Calculate current streak in consecutive calendar days
  let streak = 0
  const checkDate = new Date(now)

  // Does today have activity?
  const todayCount = (sessionsByDate.get(toLocalDateString(checkDate)) ?? []).length
  if (todayCount > 0) {
    streak = 1
    checkDate.setDate(checkDate.getDate() - 1)
    while (true) {
      const prevCount = (sessionsByDate.get(toLocalDateString(checkDate)) ?? []).length
      if (prevCount > 0) {
        streak++
        checkDate.setDate(checkDate.getDate() - 1)
      } else {
        break
      }
    }
  } else {
    // If today hasn't had activity yet, check yesterday
    checkDate.setDate(checkDate.getDate() - 1)
    const yestCount = (sessionsByDate.get(toLocalDateString(checkDate)) ?? []).length
    if (yestCount > 0) {
      streak = 1
      checkDate.setDate(checkDate.getDate() - 1)
      while (true) {
        const prevCount = (sessionsByDate.get(toLocalDateString(checkDate)) ?? []).length
        if (prevCount > 0) {
          streak++
          checkDate.setDate(checkDate.getDate() - 1)
        } else {
          break
        }
      }
    }
  }

  // Calculate most frequent exercise in the week
  const exerciseCounts = new Map<string, number>()
  for (const d of days) {
    const list = sessionsByDate.get(d.dateStr) ?? []
    for (const s of list) {
      exerciseCounts.set(s.exercise, (exerciseCounts.get(s.exercise) ?? 0) + 1)
    }
  }
  let mostFrequentExercise: string | null = null
  let maxCount = 0
  for (const [ex, count] of exerciseCounts.entries()) {
    if (count > maxCount) {
      maxCount = count
      mostFrequentExercise = ex
    }
  }

  return {
    days,
    totalWeekMinutes,
    totalWeekSessions,
    totalWeekReps,
    activeDaysCount,
    currentStreakDays: streak,
    mostFrequentExercise,
  }
}
