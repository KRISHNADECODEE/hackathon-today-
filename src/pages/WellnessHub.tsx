import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Activity,
  AlertCircle,
  Bell,
  BellOff,
  CheckCircle2,
  ChevronRight,
  Clock,
  Flame,
  Loader2,
  PauseCircle,
  Play,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { Badge, Button, Card } from '../components/ui'
import { useAuth } from '../lib/auth'
import { getPrefs, setPrefs, type DailyGoals } from '../lib/prefs'
import { useDeskReminders } from '../lib/useDeskReminders'
import { useSessions } from '../lib/useSessions'
import { WELLNESS_ROUTINES, type WellnessRoutine } from '../lib/wellnessRoutines'
import { computeTodayStats, computeWeeklyStats } from '../lib/wellnessStats'

export default function WellnessHub() {
  const nav = useNavigate()
  const { user } = useAuth()
  const { state } = useSessions(user)
  const {
    prefs: reminderPrefs,
    isPaused,
    nextReminder,
    notifPermission,
    pauseReminders,
    resumeReminders,
    updateReminderPrefs,
    requestPermission,
  } = useDeskReminders()

  const [dailyGoals, setLocalGoals] = useState<DailyGoals>(() => getPrefs().dailyGoals)
  const [editingGoals, setEditingGoals] = useState(false)
  const [selectedRoutine, setSelectedRoutine] = useState<WellnessRoutine | null>(null)

  function saveGoalMinutes(mins: number) {
    const updated = { ...dailyGoals, activeMinutes: mins }
    setLocalGoals(updated)
    setPrefs({ dailyGoals: updated })
  }

  function saveGoalSessions(count: number) {
    const updated = { ...dailyGoals, breakSessions: count }
    setLocalGoals(updated)
    setPrefs({ dailyGoals: updated })
  }

  const sessions = state.kind === 'ok' ? state.data : []
  const todayStats = computeTodayStats(sessions, dailyGoals)
  const weeklyStats = computeWeeklyStats(sessions)

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="mb-10 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="font-mono text-xs uppercase tracking-wider text-emerald-600 font-semibold">
            Everyday Wellness & Movement
          </p>
          <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
            Desk Breaks & Posture Awareness
          </h1>
          <p className="mt-2 text-sm text-muted max-w-2xl">
            Targeted micro-movements and posture checks designed for busy workdays.
            Computer vision executes 100% locally in your browser with zero video recording.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="ghost"
            onClick={() => nav('/exercise?id=posture')}
            className="text-xs border border-rule hover:border-emerald-500"
          >
            <Activity className="h-4 w-4 text-emerald-600" /> Quick Posture Check
          </Button>
          <Button
            onClick={() => nav('/exercise?id=sit_to_stand')}
            className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            <Play className="h-4 w-4 fill-white" /> 2-Min Circulation Break
          </Button>
        </div>
      </div>

      {state.kind === 'loading' && (
        <div className="mb-8 flex items-center gap-2 rounded-lg border border-rule bg-paper p-4 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin text-teal" />
          <span>Synchronizing your activity history...</span>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="mb-8 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>Notice: {state.message} (showing local device telemetry)</span>
        </div>
      )}

      {/* Top Grid: Daily Movement Goals & Reminders Configuration */}
      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr] mb-10">
        {/* Daily Goals Card */}
        <Card className="p-6 border-emerald-500/30 bg-white shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-emerald-700">
                <Sparkles className="h-4 w-4 text-emerald-600" aria-hidden /> Today&apos;s Movement Goal
              </span>
              <button
                type="button"
                onClick={() => setEditingGoals(!editingGoals)}
                className="text-xs font-semibold text-muted hover:text-ink underline"
              >
                {editingGoals ? 'Done Editing' : 'Adjust Goals'}
              </button>
            </div>

            {editingGoals && (
              <div className="mt-4 rounded-lg border border-rule bg-paper p-3 text-xs space-y-3">
                <div>
                  <span className="font-semibold text-ink">Daily Active Minutes Target:</span>
                  <div className="mt-1 flex gap-2">
                    {[5, 10, 15, 20].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => saveGoalMinutes(m)}
                        className={`rounded px-2.5 py-1 font-mono transition ${
                          dailyGoals.activeMinutes === m
                            ? 'bg-ink text-white font-bold'
                            : 'bg-white border border-rule text-muted hover:text-ink'
                        }`}
                      >
                        {m}m
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span className="font-semibold text-ink">Daily Break Count Target:</span>
                  <div className="mt-1 flex gap-2">
                    {[1, 2, 3, 4].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => saveGoalSessions(c)}
                        className={`rounded px-2.5 py-1 font-mono transition ${
                          dailyGoals.breakSessions === c
                            ? 'bg-ink text-white font-bold'
                            : 'bg-white border border-rule text-muted hover:text-ink'
                        }`}
                      >
                        {c} {c === 1 ? 'break' : 'breaks'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6 grid grid-cols-2 gap-4">
              {/* Active Minutes */}
              <div className="rounded-xl border border-rule/70 bg-paper p-4">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>Active Time</span>
                  <span className="font-mono">{todayStats.minutesGoalProgress}%</span>
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="font-mono text-3xl font-extrabold text-ink">{todayStats.activeMinutes}</span>
                  <span className="text-xs text-muted">/ {dailyGoals.activeMinutes} min</span>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-rule/50">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${todayStats.minutesGoalProgress}%` }}
                  />
                </div>
              </div>

              {/* Completed Breaks */}
              <div className="rounded-xl border border-rule/70 bg-paper p-4">
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>Desk Breaks</span>
                  <span className="font-mono">{todayStats.sessionsGoalProgress}%</span>
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="font-mono text-3xl font-extrabold text-ink">{todayStats.completedSessions}</span>
                  <span className="text-xs text-muted">/ {dailyGoals.breakSessions} completed</span>
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-rule/50">
                  <div
                    className="h-full bg-teal transition-all duration-500"
                    style={{ width: `${todayStats.sessionsGoalProgress}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Quick Summary Counts */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted border-t border-rule/60 pt-3">
              <span>Valid Repetitions Today: <strong className="text-ink font-mono">{todayStats.validReps}</strong></span>
              <span>Posture Awareness Checks: <strong className="text-ink font-mono">{todayStats.postureChecksCount}</strong></span>
              {todayStats.goalsMet && (
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Goals Achieved!
                </span>
              )}
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between gap-4 bg-emerald-50/60 rounded-lg p-3 text-xs text-emerald-900 border border-emerald-100">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>Camera stays off until you click start. MediaPipe frames are never uploaded.</span>
            </div>
            {!user && (
              <Link to="/auth?next=/wellness" className="font-bold underline shrink-0 hover:text-emerald-950">
                Sign in to sync history
              </Link>
            )}
          </div>
        </Card>

        {/* Desk-Break Reminders Configuration Card */}
        <Card className="p-6 border-rule bg-white shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${reminderPrefs.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-paper text-muted'}`}>
                  {reminderPrefs.enabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-base font-bold text-ink">Desk-Break Reminders</h2>
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-semibold ${
                      nextReminder.status === 'scheduled' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                      nextReminder.status === 'paused' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                      nextReminder.status === 'quiet_hours' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' :
                      'bg-paper text-muted border border-rule'
                    }`}>
                      {nextReminder.label}
                    </span>
                  </div>
                  <p className="text-xs text-muted">Periodic cues to stretch & stand</p>
                </div>
              </div>

              {/* Master Toggle */}
              <button
                type="button"
                onClick={() => updateReminderPrefs({ enabled: !reminderPrefs.enabled })}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  reminderPrefs.enabled ? 'bg-emerald-600' : 'bg-rule'
                }`}
                role="switch"
                aria-checked={reminderPrefs.enabled}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    reminderPrefs.enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {reminderPrefs.enabled ? (
              <div className="mt-5 space-y-4">
                {/* Interval Selection */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5">
                    Interval between breaks
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[20, 30, 45, 60].map((mins) => (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => updateReminderPrefs({ intervalMinutes: mins })}
                        className={`rounded-md py-1.5 text-xs font-medium transition ${
                          reminderPrefs.intervalMinutes === mins
                            ? 'bg-ink text-white font-bold'
                            : 'bg-paper border border-rule text-muted hover:text-ink'
                        }`}
                      >
                        {mins}m
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pause Controls */}
                <div className="rounded-lg border border-rule bg-paper p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-ink flex items-center gap-1.5">
                      <PauseCircle className="h-3.5 w-3.5 text-muted" /> Status
                    </span>
                    {isPaused ? (
                      <span className="text-amber-700 font-medium">Paused</span>
                    ) : (
                      <span className="text-emerald-700 font-medium">Active</span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {isPaused ? (
                      <Button variant="ghost" onClick={resumeReminders} className="text-[11px] py-1 h-auto text-emerald-700">
                        <RotateCcw className="h-3 w-3" /> Resume Now
                      </Button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => pauseReminders(1)}
                          className="rounded border border-rule bg-white px-2 py-0.5 text-[11px] text-muted hover:text-ink"
                        >
                          Pause 1 hr
                        </button>
                        <button
                          type="button"
                          onClick={() => pauseReminders(2)}
                          className="rounded border border-rule bg-white px-2 py-0.5 text-[11px] text-muted hover:text-ink"
                        >
                          Pause 2 hrs
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Quiet Hours & Sound Settings */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-rule p-2.5 bg-paper">
                    <span className="font-medium text-ink block mb-1">Quiet Hours</span>
                    <label className="flex items-center gap-1 text-muted text-[11px]">
                      <input
                        type="checkbox"
                        checked={reminderPrefs.quietHoursEnabled}
                        onChange={(e) => updateReminderPrefs({ quietHoursEnabled: e.target.checked })}
                        className="rounded"
                      />
                      <span>18:00 to 09:00</span>
                    </label>
                  </div>

                  <div className="rounded-lg border border-rule p-2.5 bg-paper">
                    <span className="font-medium text-ink block mb-1">Audio Chime</span>
                    <button
                      type="button"
                      onClick={() => updateReminderPrefs({ sound: !reminderPrefs.sound })}
                      className="flex items-center gap-1 text-[11px] text-muted hover:text-ink"
                    >
                      {reminderPrefs.sound ? (
                        <>
                          <Volume2 className="h-3.5 w-3.5 text-teal" /> Chime on
                        </>
                      ) : (
                        <>
                          <VolumeX className="h-3.5 w-3.5 text-muted" /> Muted
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-6 rounded-lg border border-dashed border-rule p-5 text-center text-xs text-muted">
                <Clock className="mx-auto h-6 w-6 text-muted mb-2" />
                <p className="font-semibold text-ink">Reminders are turned off</p>
                <p className="mt-1 text-[11px]">Enable above to receive subtle work break nudges every 45 minutes.</p>
              </div>
            )}
          </div>

          {/* Browser Notification Permission Banner */}
          {reminderPrefs.enabled && (
            <div className="mt-4 border-t border-rule pt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted">Desktop alerts:</span>
                {notifPermission === 'granted' ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Allowed
                  </span>
                ) : notifPermission === 'denied' ? (
                  <span className="text-rose-600 font-medium" title="Allow notifications in browser site settings">
                    Blocked in browser
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={requestPermission}
                    className="font-bold text-teal underline hover:text-teal/80"
                  >
                    Enable notifications
                  </button>
                )}
              </div>

              <div className="rounded border border-rule/70 bg-paper p-2 text-[11px] text-muted space-y-0.5">
                <span className="font-semibold text-ink flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3 text-teal" /> Browser Limitation Notice
                </span>
                <p>
                  Alerts trigger while KinectIQ remains open in a browser tab. If you close your browser or your device is asleep, cues will resume when you reopen.
                </p>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Posture Awareness Spotlight Card */}
      <section className="mb-12">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl font-bold text-ink">Seated Posture Awareness</h2>
            <p className="text-xs text-muted">Real-time head-forward angle measurement using 2D webcam coordinates</p>
          </div>
          <span className="rounded bg-teal-soft px-2.5 py-1 text-xs font-semibold text-teal border border-teal/30">
            Awareness Aid
          </span>
        </div>

        <Card className="p-6 border-rule bg-white shadow-xs">
          <div className="grid gap-6 md:grid-cols-[1.5fr_1fr]">
            <div>
              <h3 className="font-display text-lg font-bold text-ink">
                Monitor Head-Forward Angle (Cervical Alignment)
              </h3>
              <p className="mt-2 text-sm text-muted leading-relaxed">
                Prolonged desk sitting frequently causes the head to drift forward of the shoulders (&quot;tech neck&quot;),
                multiplying gravitational stress on the cervical vertebrae. KinectIQ observes the 2D vector between your ear and shoulder
                and gives gentle voice cues when head-forward tilt exceeds 25°.
              </p>

              <div className="mt-4 rounded-lg border border-amber/40 bg-amber-soft/50 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 text-amber shrink-0 mt-0.5" />
                <div>
                  <strong>Important Clinical Notice:</strong> This feature is a posture habit awareness aid for office workers,
                  not medical-grade posture analysis or clinical diagnostic goniometry. Measurements reflect 2D image coordinates and can vary with camera height, hair, or loose collars.
                </div>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button
                  onClick={() => nav('/exercise?id=posture')}
                  className="bg-ink hover:bg-slate text-white text-xs"
                >
                  <Play className="h-4 w-4 fill-white" /> Start 2-Minute Posture Check
                </Button>
                <Link
                  to="/exercises/posture"
                  className="text-xs font-semibold text-muted hover:text-ink underline px-2 py-1"
                >
                  View Setup Guide & Angles
                </Link>
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-xl border border-rule bg-paper p-5">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Measurement Target</span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="font-mono text-3xl font-extrabold text-ink">≤ 20°</span>
                  <span className="text-xs text-muted">head-forward tilt</span>
                </div>
                <p className="mt-2 text-xs text-muted leading-relaxed">
                  Tilt &gt; 25° for 2+ seconds triggers gentle audio/visual correction (&quot;Sit tall and bring your head back&quot;).
                </p>
              </div>

              <div className="border-t border-rule pt-4 text-xs space-y-1.5 text-muted">
                <div className="flex items-center justify-between">
                  <span>Camera Status:</span>
                  <span className="font-semibold text-ink">Standby (off)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Required Orientation:</span>
                  <span className="font-semibold text-ink">Side-on to camera</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Surveillance Policy:</span>
                  <span className="font-semibold text-teal">Zero Background Capture</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </section>

      {/* Short Guided Movement Sessions (2-Minute Desk Routines) */}
      <section className="mb-12">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl font-bold text-ink">2-Minute Guided Desk Breaks</h2>
            <p className="text-xs text-muted">No equipment or workout clothes needed. Pick any routine to activate your body.</p>
          </div>
          <Link to="/exercises" className="text-xs font-semibold text-teal hover:underline flex items-center gap-1">
            Browse all 18 exercises <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {WELLNESS_ROUTINES.map((routine) => (
            <RoutineCard
              key={routine.id}
              routine={routine}
              onStart={() => nav(`/exercise?id=${routine.exerciseId}`)}
              onPreview={() => setSelectedRoutine(routine)}
            />
          ))}
        </div>
      </section>

      {/* Weekly Progress Summaries & Activity History */}
      <section className="mb-12">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl font-bold text-ink">Weekly Movement Consistency</h2>
            <p className="text-xs text-muted">Real activity logged over the past 7 days</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-soft px-2.5 py-1 rounded-full border border-amber/30">
              <Flame className="h-3.5 w-3.5 text-amber fill-amber" />
              {weeklyStats.currentStreakDays} {weeklyStats.currentStreakDays === 1 ? 'day streak' : 'days streak'}
            </span>
          </div>
        </div>

        <Card className="p-6 border-rule bg-white shadow-xs">
          {/* 7-Day Heatmap / Tile Distribution */}
          <div className="grid grid-cols-7 gap-2 text-center">
            {weeklyStats.days.map((day) => (
              <div
                key={day.dateStr}
                className={`rounded-lg border p-3 flex flex-col justify-between min-h-24 transition ${
                  day.isToday
                    ? 'border-emerald-500 bg-emerald-50/50 shadow-xs'
                    : day.sessionsCount > 0
                    ? 'border-teal/30 bg-teal-soft/20'
                    : 'border-rule/60 bg-paper'
                }`}
              >
                <div>
                  <span className={`text-[11px] font-bold block ${day.isToday ? 'text-emerald-700' : 'text-muted'}`}>
                    {day.dayLabel}
                  </span>
                  <span className="text-[10px] text-muted">{day.dateStr.slice(8)}</span>
                </div>

                <div className="my-1">
                  {day.sessionsCount > 0 ? (
                    <div>
                      <span className="font-mono text-base font-extrabold text-ink block">{day.minutes}m</span>
                      <span className="text-[10px] text-muted">{day.sessionsCount} {day.sessionsCount === 1 ? 'break' : 'breaks'}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted/60">—</span>
                  )}
                </div>

                <div className="h-1.5 w-full rounded-full bg-rule/50 overflow-hidden">
                  <div
                    className={`h-full ${day.sessionsCount > 0 ? 'bg-emerald-500' : 'bg-transparent'}`}
                    style={{ width: `${Math.min(100, (day.minutes / dailyGoals.activeMinutes) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Weekly Summary Totals */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-rule pt-4 text-xs">
            <div>
              <span className="text-muted block">Total Active Time</span>
              <strong className="text-base font-mono font-bold text-ink mt-0.5 block">{weeklyStats.totalWeekMinutes} min</strong>
            </div>
            <div>
              <span className="text-muted block">Sessions Completed</span>
              <strong className="text-base font-mono font-bold text-ink mt-0.5 block">{weeklyStats.totalWeekSessions}</strong>
            </div>
            <div>
              <span className="text-muted block">Active Days</span>
              <strong className="text-base font-mono font-bold text-ink mt-0.5 block">{weeklyStats.activeDaysCount} / 7 days</strong>
            </div>
            <div>
              <span className="text-muted block">Most Frequent Movement</span>
              <strong className="text-sm font-semibold text-ink mt-0.5 block truncate">
                {weeklyStats.mostFrequentExercise ? weeklyStats.mostFrequentExercise.replace(/_/g, ' ') : '—'}
              </strong>
            </div>
          </div>

          {weeklyStats.totalWeekSessions === 0 && (
            <div className="mt-4 text-center rounded-lg border border-dashed border-rule p-6 text-xs text-muted">
              <p className="font-semibold text-ink">No movement sessions recorded yet this week</p>
              <p className="mt-1">Launch a 2-minute desk break above to log your first active session and start a streak!</p>
            </div>
          )}
        </Card>
      </section>

      {/* Recent Completed Activities Section */}
      <section className="mb-12">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl font-bold text-ink">Recent Movement Activity</h2>
            <p className="text-xs text-muted">Your latest completed desk breaks and posture sessions</p>
          </div>
          {sessions.length > 0 && (
            <Link to="/history" className="text-xs font-semibold text-teal hover:underline flex items-center gap-1">
              View full activity log <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>

        {sessions.length === 0 ? (
          <Card className="p-8 border-dashed border-rule bg-white text-center">
            <Activity className="mx-auto h-8 w-8 text-muted/60 mb-2" />
            <h3 className="font-display text-base font-bold text-ink">No Completed Activities Yet</h3>
            <p className="mt-1 text-xs text-muted max-w-md mx-auto">
              Start your first 2-minute movement session or posture check above. Your active duration, completed repetitions, and tracking quality will appear here automatically.
            </p>
            <div className="mt-4 flex justify-center gap-3">
              <Button onClick={() => nav('/exercise?id=sit_to_stand')} className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white">
                <Play className="h-3.5 w-3.5 fill-white" /> Try Sit-to-Stand (2 min)
              </Button>
              <Button variant="ghost" onClick={() => nav('/exercise?id=posture')} className="text-xs border border-rule">
                Check Posture
              </Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-3">
            {sessions.slice(0, 5).map((s) => {
              const date = new Date(s.started_at)
              const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' })
              const durationSec = Math.round((s.duration_ms || 0) / 1000)
              const durationMin = Math.floor(durationSec / 60)
              const secRem = durationSec % 60
              const formattedDuration = `${durationMin}m ${secRem}s`
              const isPosture = s.exercise === 'posture'

              return (
                <Card
                  key={s.id}
                  className="p-4 border-rule bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-emerald-500/50 transition cursor-pointer"
                  onClick={() => nav(`/sessions/${s.id}`)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                      isPosture ? 'bg-teal-soft text-teal' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      <Activity className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-display text-sm font-bold text-ink capitalize">
                          {s.exercise.replace(/_/g, ' ')}
                        </h4>
                        <Badge tone={isPosture ? 'teal' : 'neutral'}>
                          {isPosture ? 'Posture Check' : 'Movement Break'}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted mt-0.5">
                        {dateStr} at {timeStr} · {s.side ? `${s.side} side · ` : ''}Active: <span className="font-mono font-semibold text-ink">{formattedDuration}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-rule/50">
                    <div>
                      <span className="text-[10px] text-muted block uppercase font-mono">Performance</span>
                      <span className="text-xs font-mono font-bold text-ink">
                        {isPosture ? 'Monitored' : `${s.valid_reps ?? 0} reps`}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted block uppercase font-mono">Tracking Quality</span>
                      <span className="text-xs font-mono font-bold text-emerald-700">
                        {Math.round((s.tracking_quality ?? 0) * 100)}%
                      </span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted hidden sm:block" />
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      {/* Routine Preview / Step-by-Step Instructions Modal */}
      {selectedRoutine && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="routine-modal-title"
        >
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-rule animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-mono uppercase tracking-wider text-emerald-600 font-bold">
                  {selectedRoutine.targetArea} · ~{selectedRoutine.durationMinutes} min
                </span>
                <h3 id="routine-modal-title" className="font-display text-xl font-bold text-ink mt-0.5">
                  {selectedRoutine.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRoutine(null)}
                className="rounded-full p-1.5 text-muted hover:bg-paper hover:text-ink transition"
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            <p className="mt-2 text-xs text-muted leading-relaxed">
              {selectedRoutine.description}
            </p>

            <div className="mt-4 rounded-lg border border-rule/70 bg-paper p-3 text-xs">
              <strong className="text-ink block mb-1">Target Movement:</strong>
              <p className="text-muted">{selectedRoutine.recommendedTarget}</p>
            </div>

            <div className="mt-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink mb-2">Step-by-Step Instructions</h4>
              <ol className="list-decimal pl-4 space-y-1.5 text-xs text-muted leading-relaxed">
                {selectedRoutine.instructions.map((step, idx) => (
                  <li key={idx}><span className="text-ink font-medium">{step}</span></li>
                ))}
              </ol>
            </div>

            <div className="mt-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-ink mb-2">Movement Benefits</h4>
              <ul className="list-disc pl-4 space-y-1 text-xs text-muted">
                {selectedRoutine.benefits.map((b, idx) => (
                  <li key={idx}>{b}</li>
                ))}
              </ul>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 border-t border-rule pt-4">
              <Button variant="ghost" onClick={() => setSelectedRoutine(null)} className="text-xs">
                Cancel
              </Button>
              <Button
                onClick={() => {
                  const exId = selectedRoutine.exerciseId
                  setSelectedRoutine(null)
                  nav(`/exercise?id=${exId}`)
                }}
                className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                <Play className="h-3.5 w-3.5 fill-white" /> Start Guided Routine
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function RoutineCard({
  routine,
  onStart,
  onPreview,
}: {
  routine: WellnessRoutine
  onStart: () => void
  onPreview: () => void
}) {
  return (
    <Card className="flex flex-col justify-between p-5 border-rule bg-white hover:border-emerald-500 hover:shadow-sm transition">
      <div>
        <div className="flex items-center justify-between">
          <Badge tone="teal">~{routine.durationMinutes} min</Badge>
          <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">{routine.targetArea}</span>
        </div>
        <h3 className="mt-3 font-display text-base font-bold text-ink">{routine.title}</h3>
        <p className="mt-1 text-xs text-muted leading-relaxed">{routine.subtitle}</p>

        <div className="mt-3 rounded border border-rule/70 bg-paper p-2.5 text-[11px] text-muted">
          <strong className="text-ink block">Target:</strong> {routine.recommendedTarget}
        </div>
      </div>

      <div className="mt-5 border-t border-rule pt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={onStart}
          className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 hover:text-emerald-900 transition"
        >
          <Play className="h-3.5 w-3.5 fill-emerald-700" /> Start 2-Min Break
        </button>
        <button
          type="button"
          onClick={onPreview}
          className="text-[11px] text-muted hover:text-ink underline"
        >
          View Steps
        </button>
      </div>
    </Card>
  )
}
