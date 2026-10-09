/**
 * Utilities for desk-break reminders, quiet hours calculation,
 * audio chime synthesis, and browser notification dispatch.
 */

/**
 * Checks whether the specified time is within quiet hours.
 * Handles overnight ranges (e.g. 18:00 to 09:00) and same-day ranges (e.g. 12:00 to 14:00).
 */
export function isWithinQuietHours(start: string, end: string, now = new Date()): boolean {
  if (!start || !end) return false
  const [sH, sM] = start.split(':').map((v) => parseInt(v, 10))
  const [eH, eM] = end.split(':').map((v) => parseInt(v, 10))
  if (isNaN(sH) || isNaN(sM) || isNaN(eH) || isNaN(eM)) return false

  const curMinutes = now.getHours() * 60 + now.getMinutes()
  const startMinutes = sH * 60 + sM
  const endMinutes = eH * 60 + eM

  if (startMinutes === endMinutes) return false

  if (startMinutes > endMinutes) {
    // Overnight window: e.g. 18:00 to 09:00 (1080 to 540)
    return curMinutes >= startMinutes || curMinutes < endMinutes
  } else {
    // Daytime window: e.g. 13:00 to 15:00
    return curMinutes >= startMinutes && curMinutes < endMinutes
  }
}

/**
 * Requests browser permission for desktop notifications.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied'
  }
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

/**
 * Plays a short, pleasant two-tone audio chime (C5 -> G5) using Web Audio API.
 * Does not depend on any external audio files.
 */
export function playReminderChime(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const now = ctx.currentTime

    // Tone 1: C5 (523.25 Hz)
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(523.25, now)
    gain1.gain.setValueAtTime(0.12, now)
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35)
    osc1.connect(gain1)
    gain1.connect(ctx.destination)
    osc1.start(now)
    osc1.stop(now + 0.35)

    // Tone 2: G5 (783.99 Hz)
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(783.99, now + 0.18)
    gain2.gain.setValueAtTime(0.15, now + 0.18)
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6)
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.start(now + 0.18)
    osc2.stop(now + 0.6)
  } catch {
    // AudioContext blocked or not allowed; fail silently
  }
}

/**
 * Dispatches a native browser notification if granted.
 */
export function dispatchSystemNotification(
  title: string,
  options: { body: string; icon?: string; tag?: string },
  onClick?: () => void,
): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) return false
  if (Notification.permission !== 'granted') return false

  try {
    const notif = new Notification(title, {
      body: options.body,
      icon: options.icon ?? '/favicon.svg',
      tag: options.tag ?? 'kinectiq-reminder',
    })
    if (onClick) {
      notif.onclick = () => {
        try {
          window.focus()
          onClick()
          notif.close()
        } catch {
          // ignore
        }
      }
    }
    return true
  } catch {
    return false
  }
}
