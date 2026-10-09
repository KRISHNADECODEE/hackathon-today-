import { useNavigate } from 'react-router-dom'
import { Bell, Clock, Sparkles, X } from 'lucide-react'
import type { ReminderAlert } from '../lib/useDeskReminders'
import { Button } from './ui'

type ReminderToastProps = {
  alert: ReminderAlert | null
  onDismiss: () => void
  onSnooze: (minutes?: number) => void
}

export function ReminderToast({ alert, onDismiss, onSnooze }: ReminderToastProps) {
  const nav = useNavigate()
  if (!alert) return null

  return (
    <aside
      role="alert"
      aria-live="assertive"
      className="fixed bottom-5 right-5 z-50 max-w-sm rounded-xl border border-emerald-500/40 bg-ink p-4 text-white shadow-2xl backdrop-blur-md transition-all animate-in fade-in slide-in-from-bottom-4 duration-200"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
          <Bell className="h-5 w-5 animate-bounce" aria-hidden />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-400">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            <span>Desk Break Reminder</span>
          </div>
          <h3 className="mt-1 font-display text-base font-bold text-white">
            Time to stand and reset!
          </h3>
          <p className="mt-1 text-xs text-white/70 leading-relaxed">
            You&apos;ve been working for {alert.intervalMinutes} minutes. A quick 2-minute movement or posture check will relieve neck and lower-back tension.
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="text-white/40 hover:text-white transition p-1"
          aria-label="Close reminder"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
        <Button
          variant="primary"
          className="flex-1 text-xs py-2 bg-emerald-600 hover:bg-emerald-500 text-white border-0"
          onClick={() => {
            onDismiss()
            nav('/wellness')
          }}
        >
          Open Wellness Hub
        </Button>
        <button
          type="button"
          onClick={() => onSnooze(15)}
          className="flex items-center gap-1 rounded-md px-3 py-2 text-xs font-medium text-white/70 hover:bg-white/10 transition"
        >
          <Clock className="h-3.5 w-3.5" /> Snooze 15m
        </button>
      </div>

      <p className="mt-2 text-[10px] text-white/40 text-center">
        Camera remains off until you explicitly begin an exercise. Zero background tracking.
      </p>
    </aside>
  )
}
