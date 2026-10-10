import type { WellnessProfile } from './wellnessNutrition'

// Per-device conveniences only. Storage can be unavailable (private mode), so every access is guarded.
const KEY = 'kinectiq.prefs'

export type DeskReminderPrefs = {
  enabled: boolean
  intervalMinutes: number // e.g. 20, 30, 45, 60, 90
  quietHoursEnabled: boolean
  quietHoursStart: string // "HH:mm", e.g. "18:00"
  quietHoursEnd: string // "HH:mm", e.g. "09:00"
  pausedUntil: number | null // timestamp in ms
  sound: boolean
}

export type DailyGoals = {
  activeMinutes: number // default: 10
  breakSessions: number // default: 2
}

export type Prefs = {
  voice: boolean
  lastExercise: string | null
  side: 'left' | 'right'
  reminder: DeskReminderPrefs
  dailyGoals: DailyGoals
  wellnessProfile: WellnessProfile | null
}

export const DEFAULT_REMINDER: DeskReminderPrefs = {
  enabled: false,
  intervalMinutes: 45,
  quietHoursEnabled: true,
  quietHoursStart: '18:00',
  quietHoursEnd: '09:00',
  pausedUntil: null,
  sound: true,
}

export const DEFAULT_GOALS: DailyGoals = {
  activeMinutes: 10,
  breakSessions: 2,
}

const DEFAULTS: Prefs = {
  voice: true,
  lastExercise: null,
  side: 'right',
  reminder: DEFAULT_REMINDER,
  dailyGoals: DEFAULT_GOALS,
  wellnessProfile: null,
}

export function getPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return {
      ...DEFAULTS,
      ...raw,
      reminder: { ...DEFAULT_REMINDER, ...(raw.reminder ?? {}) },
      dailyGoals: { ...DEFAULT_GOALS, ...(raw.dailyGoals ?? {}) },
      wellnessProfile: raw.wellnessProfile ?? null,
    }
  } catch {
    return DEFAULTS
  }
}

export type PartialPrefs = {
  voice?: boolean
  lastExercise?: string | null
  side?: 'left' | 'right'
  reminder?: Partial<DeskReminderPrefs>
  dailyGoals?: Partial<DailyGoals>
  wellnessProfile?: WellnessProfile | null
}

export function setPrefs(p: PartialPrefs) {
  try {
    const current = getPrefs()
    const next: Prefs = {
      ...current,
      ...p,
      reminder: p.reminder ? { ...current.reminder, ...p.reminder } : current.reminder,
      dailyGoals: p.dailyGoals ? { ...current.dailyGoals, ...p.dailyGoals } : current.dailyGoals,
      wellnessProfile: p.wellnessProfile !== undefined ? p.wellnessProfile : current.wellnessProfile,
    }
    localStorage.setItem(KEY, JSON.stringify(next))
    window.dispatchEvent(new Event('kinectiq:prefs_changed'))
  } catch {
    /* not persisted */
  }
}
