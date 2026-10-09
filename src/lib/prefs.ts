// Per-device conveniences only. Storage can be unavailable (private mode), so every access is guarded.
const KEY = 'kinectiq.prefs'
export type Prefs = { voice: boolean; lastExercise: string | null; side: 'left' | 'right' }
const DEFAULTS: Prefs = { voice: true, lastExercise: null, side: 'right' }

export function getPrefs(): Prefs {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } } catch { return DEFAULTS }
}
export function setPrefs(p: Partial<Prefs>) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...getPrefs(), ...p })) } catch { /* not persisted */ }
}
