import { useCallback, useEffect, useState } from 'react'
import { getPrefs, setPrefs, type DeskReminderPrefs } from './prefs'
import {
  dispatchSystemNotification,
  isWithinQuietHours,
  playReminderChime,
  requestNotificationPermission,
} from './reminders'

const LAST_REMINDER_KEY = 'kinectiq.lastReminderTrigger'

export type ReminderAlert = {
  id: string
  triggeredAt: number
  intervalMinutes: number
}

export function useDeskReminders() {
  const [prefs, setLocalPrefs] = useState(() => getPrefs().reminder)
  const [activeAlert, setActiveAlert] = useState<ReminderAlert | null>(null)
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(() => {
    return typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'denied'
  })

  // Sync when prefs change
  const refreshPrefs = useCallback(() => {
    setLocalPrefs(getPrefs().reminder)
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPermission(Notification.permission)
    }
  }, [])

  useEffect(() => {
    window.addEventListener('kinectiq:prefs_changed', refreshPrefs)
    window.addEventListener('storage', refreshPrefs)
    return () => {
      window.removeEventListener('kinectiq:prefs_changed', refreshPrefs)
      window.removeEventListener('storage', refreshPrefs)
    }
  }, [refreshPrefs])

  // Periodic reminder checker
  useEffect(() => {
    if (!prefs.enabled) return

    function check() {
      const current = getPrefs().reminder
      if (!current.enabled) return

      const now = Date.now()

      // Check if temporarily paused
      if (current.pausedUntil && current.pausedUntil > now) {
        return
      }

      // Check quiet hours
      if (
        current.quietHoursEnabled &&
        isWithinQuietHours(current.quietHoursStart, current.quietHoursEnd)
      ) {
        return
      }

      const lastRaw = localStorage.getItem(LAST_REMINDER_KEY)
      const lastTime = lastRaw ? parseInt(lastRaw, 10) : 0
      const intervalMs = Math.max(5, current.intervalMinutes) * 60 * 1000

      // If it's the very first time enabled, initialize baseline
      if (!lastTime) {
        localStorage.setItem(LAST_REMINDER_KEY, String(now))
        return
      }

      if (now - lastTime >= intervalMs) {
        // Trigger reminder!
        localStorage.setItem(LAST_REMINDER_KEY, String(now))
        const alert: ReminderAlert = {
          id: `reminder-${now}`,
          triggeredAt: now,
          intervalMinutes: current.intervalMinutes,
        }
        setActiveAlert(alert)

        if (current.sound) {
          playReminderChime()
        }

        dispatchSystemNotification(
          'KinectIQ Desk Break',
          {
            body: `You've been active for ${current.intervalMinutes} minutes. Take a 2-minute movement or posture break!`,
            tag: 'kinectiq-desk-break',
          },
          () => {
            window.location.href = '/wellness'
          },
        )
      }
    }

    // Check every 10 seconds
    const timer = setInterval(check, 10000)
    check()

    return () => clearInterval(timer)
  }, [prefs.enabled, prefs.intervalMinutes, prefs.quietHoursEnabled, prefs.quietHoursStart, prefs.quietHoursEnd])

  const dismissAlert = useCallback(() => {
    setActiveAlert(null)
  }, [])

  const snoozeReminder = useCallback((minutes = 15) => {
    setActiveAlert(null)
    const now = Date.now()
    const currentIntervalMs = Math.max(5, prefs.intervalMinutes) * 60 * 1000
    const snoozeMs = minutes * 60 * 1000
    // Set lastTrigger so the next alert fires in `minutes`
    const adjustedLast = now - (currentIntervalMs - snoozeMs)
    localStorage.setItem(LAST_REMINDER_KEY, String(adjustedLast))
  }, [prefs.intervalMinutes])

  const pauseReminders = useCallback((hours: number) => {
    const pausedUntil = Date.now() + hours * 3600000
    setPrefs({ reminder: { pausedUntil } })
    setActiveAlert(null)
    refreshPrefs()
  }, [refreshPrefs])

  const resumeReminders = useCallback(() => {
    setPrefs({ reminder: { pausedUntil: null } })
    localStorage.setItem(LAST_REMINDER_KEY, String(Date.now()))
    refreshPrefs()
  }, [refreshPrefs])

  const updateReminderPrefs = useCallback(
    (partial: Partial<DeskReminderPrefs>) => {
      setPrefs({ reminder: partial })
      refreshPrefs()
    },
    [refreshPrefs],
  )

  const requestPermission = useCallback(async () => {
    const perm = await requestNotificationPermission()
    setNotifPermission(perm)
    return perm
  }, [])

  const [isPaused, setIsPaused] = useState(false)
  useEffect(() => {
    setIsPaused(Boolean(prefs.pausedUntil && prefs.pausedUntil > Date.now()))
  }, [prefs.pausedUntil])

  return {
    prefs,
    activeAlert,
    isPaused,
    notifPermission,
    dismissAlert,
    snoozeReminder,
    pauseReminders,
    resumeReminders,
    updateReminderPrefs,
    requestPermission,
  }
}
