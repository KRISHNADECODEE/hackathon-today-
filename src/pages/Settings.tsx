import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bell,
  BellOff,
  Camera,
  CheckCircle,
  LogOut,
  Shield,
  Sparkles,
  User,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { Button, Card, PageTitle } from '../components/ui'
import { useAuth } from '../lib/auth'
import type { Side } from '../lib/engine'
import { getPrefs, setPrefs, type DeskReminderPrefs, type DailyGoals } from '../lib/prefs'
import { speechAvailable } from '../lib/speech'
import { supabase } from '../lib/supabase'
import { requestNotificationPermission } from '../lib/reminders'
import { PatientConnectionsSection } from '../components/PatientConnectionsSection'

export default function Settings() {
  const { user, profile } = useAuth()
  const nav = useNavigate()
  const [prefs, setLocalPrefs] = useState(getPrefs)

  function updateVoice(voice: boolean) {
    setPrefs({ voice })
    setLocalPrefs((prev) => ({ ...prev, voice }))
  }

  function updateSide(side: Side) {
    setPrefs({ side })
    setLocalPrefs((prev) => ({ ...prev, side }))
  }

  function updateReminder(partial: Partial<DeskReminderPrefs>) {
    setPrefs({ reminder: partial })
    setLocalPrefs(getPrefs())
  }

  function updateDailyGoals(partial: Partial<DailyGoals>) {
    setPrefs({ dailyGoals: partial })
    setLocalPrefs(getPrefs())
  }

  async function handleNotificationRequest() {
    await requestNotificationPermission()
    setLocalPrefs(getPrefs())
  }

  async function handleSignOut() {
    await supabase?.auth.signOut()
    nav('/')
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <PageTitle
        eyebrow="Preferences & System"
        title="Settings & Guidance"
      >
        Configure voice cues, customize exercise defaults, manage desk-break reminders & movement goals, review camera setup best practices,
        and verify your data privacy controls.
      </PageTitle>

      <div className="space-y-8">
        {/* User Preferences */}
        <section>
          <h2 className="font-display text-xl font-bold text-ink">User Preferences</h2>
          <Card className="mt-4 divide-y divide-rule">
            {/* Voice Audio Cues */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-teal" aria-hidden />
                  Voice Guidance & Cues
                </h3>
                <p className="mt-1 text-xs text-muted max-w-md">
                  Speaks repetitions, start reminders, and real-time form correction cues using the browser Speech Synthesis API.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant={prefs.voice ? 'primary' : 'ghost'}
                  onClick={() => updateVoice(!prefs.voice)}
                  disabled={!speechAvailable()}
                  className="text-xs"
                >
                  {prefs.voice ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                  {speechAvailable() ? (prefs.voice ? 'Voice Enabled' : 'Voice Muted') : 'Not supported'}
                </Button>
              </div>
            </div>

            {/* Default Side for Sided Exercises */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <h3 className="text-sm font-semibold text-ink">Default Working Side</h3>
                <p className="mt-1 text-xs text-muted max-w-md">
                  Initial side selected when starting bilateral or single-sided movements (e.g. arm or leg raises).
                </p>
              </div>

              <div className="flex rounded-lg border border-rule bg-paper p-1">
                {(['left', 'right'] as const).map((side) => (
                  <button
                    key={side}
                    onClick={() => updateSide(side)}
                    className={`rounded-md px-4 py-1.5 text-xs font-semibold capitalize transition ${
                      prefs.side === side
                        ? 'bg-ink text-white'
                        : 'text-muted hover:text-ink'
                    }`}
                  >
                    {side} side
                  </button>
                ))}
              </div>
            </div>

            {/* Desk-Break Reminders */}
            <div className="flex flex-col gap-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
                    <Bell className="h-4 w-4 text-emerald-600" aria-hidden />
                    Desk-Break Reminders
                  </h3>
                  <p className="mt-1 text-xs text-muted max-w-md">
                    Periodic nudges to take a 2-minute movement or posture break during long desk sessions.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant={prefs.reminder.enabled ? 'primary' : 'ghost'}
                    onClick={() => updateReminder({ enabled: !prefs.reminder.enabled })}
                    className={`text-xs ${prefs.reminder.enabled ? 'bg-emerald-600 hover:bg-emerald-500 border-0' : ''}`}
                  >
                    {prefs.reminder.enabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                    {prefs.reminder.enabled ? 'Reminders On' : 'Reminders Off'}
                  </Button>
                </div>
              </div>

              {prefs.reminder.enabled && (
                <div className="grid gap-3 sm:grid-cols-3 rounded-lg border border-rule bg-paper p-3 text-xs">
                  <div>
                    <span className="font-semibold text-ink block mb-1">Interval</span>
                    <div className="flex gap-1">
                      {[20, 30, 45, 60].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => updateReminder({ intervalMinutes: m })}
                          className={`rounded px-2 py-1 font-mono text-[11px] transition ${
                            prefs.reminder.intervalMinutes === m
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
                    <span className="font-semibold text-ink block mb-1">Quiet Hours</span>
                    <label className="flex items-center gap-1.5 text-muted text-[11px] mt-1">
                      <input
                        type="checkbox"
                        checked={prefs.reminder.quietHoursEnabled}
                        onChange={(e) => updateReminder({ quietHoursEnabled: e.target.checked })}
                        className="rounded"
                      />
                      <span>18:00 – 09:00</span>
                    </label>
                  </div>

                  <div>
                    <span className="font-semibold text-ink block mb-1">Desktop Alerts</span>
                    <button
                      type="button"
                      onClick={handleNotificationRequest}
                      className="text-teal font-medium underline text-[11px] mt-1 hover:text-teal/80"
                    >
                      Request browser permission
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Daily Movement Goals */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-emerald-600" aria-hidden />
                  Daily Movement Targets
                </h3>
                <p className="mt-1 text-xs text-muted max-w-md">
                  Set daily goals for active minutes and break session count shown on your Wellness Hub.
                </p>
              </div>

              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-muted">Target Time:</span>
                  <div className="flex gap-1">
                    {[5, 10, 15, 20].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => updateDailyGoals({ activeMinutes: m })}
                        className={`rounded px-2 py-1 font-mono text-[11px] transition ${
                          prefs.dailyGoals.activeMinutes === m
                            ? 'bg-ink text-white font-bold'
                            : 'bg-paper border border-rule text-muted hover:text-ink'
                        }`}
                      >
                        {m}m
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-muted">Breaks:</span>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => updateDailyGoals({ breakSessions: c })}
                        className={`rounded px-2 py-1 font-mono text-[11px] transition ${
                          prefs.dailyGoals.breakSessions === c
                            ? 'bg-ink text-white font-bold'
                            : 'bg-paper border border-rule text-muted hover:text-ink'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </section>

        {/* Camera Setup Checklist */}
        <section>
          <h2 className="font-display text-xl font-bold text-ink">Camera Positioning & Environment</h2>
          <Card className="mt-4 p-5">
            <div className="mb-4 flex items-center gap-2 text-teal">
              <Camera className="h-5 w-5" aria-hidden />
              <h3 className="text-sm font-bold text-ink">How to get the highest tracking reliability</h3>
            </div>

            <ul className="grid gap-4 sm:grid-cols-2 text-sm text-muted">
              <li className="flex items-start gap-2.5 rounded-lg border border-rule/60 bg-paper p-3.5">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-teal" aria-hidden />
                <div>
                  <strong className="text-ink">Full Body Framing:</strong>
                  <p className="mt-0.5 text-xs">Step back 2 to 3 meters (6-10 ft) so your head, shoulders, hips, and active limbs are in view.</p>
                </div>
              </li>
              <li className="flex items-start gap-2.5 rounded-lg border border-rule/60 bg-paper p-3.5">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-teal" aria-hidden />
                <div>
                  <strong className="text-ink">Frontal Lighting:</strong>
                  <p className="mt-0.5 text-xs">Face a light source. Avoid windows directly behind you which cause silhouette underexposure.</p>
                </div>
              </li>
              <li className="flex items-start gap-2.5 rounded-lg border border-rule/60 bg-paper p-3.5">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-teal" aria-hidden />
                <div>
                  <strong className="text-ink">Camera Height:</strong>
                  <p className="mt-0.5 text-xs">Position your webcam or laptop at chest level on a flat surface rather than angling upward from the floor.</p>
                </div>
              </li>
              <li className="flex items-start gap-2.5 rounded-lg border border-rule/60 bg-paper p-3.5">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-teal" aria-hidden />
                <div>
                  <strong className="text-ink">Clothing Contrast:</strong>
                  <p className="mt-0.5 text-xs">Wear fitted clothing contrasting with your wall/background for crisp landmark detection.</p>
                </div>
              </li>
            </ul>
          </Card>
        </section>

        {/* Privacy & Security Model */}
        <section>
          <h2 className="font-display text-xl font-bold text-ink">Data Privacy & Security Architecture</h2>
          <Card className="mt-4 p-5">
            <div className="flex items-start gap-3">
              <Shield className="mt-0.5 h-6 w-6 shrink-0 text-teal" aria-hidden />
              <div>
                <h3 className="text-sm font-bold text-ink">Zero Video Recording Policy</h3>
                <p className="mt-1 text-xs text-muted leading-relaxed">
                  KinectIQ is engineered with a strict privacy-first architecture. MediaPipe vision tasks execute 100% inside your browser's WebAssembly sandbox.
                  Camera frames are evaluated for joint vectors in memory and immediately released.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 text-xs text-muted">
                  <div className="rounded-md border border-rule p-3 bg-paper">
                    <strong className="text-ink">What is NEVER uploaded:</strong>
                    <p className="mt-1">Video files, camera recordings, static snapshots, facial identifiers, or audio.</p>
                  </div>
                  <div className="rounded-md border border-rule p-3 bg-paper">
                    <strong className="text-ink">What is stored in your private history:</strong>
                    <p className="mt-1">Exercise name, timestamp, duration, valid rep counts, calculated ROM angles, and form event counts.</p>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </section>

        {/* Clinical Care & Practitioner Connections */}
        {user && (
          <section>
            <h2 className="font-display text-xl font-bold text-ink">Clinical Care & Practitioner Connections</h2>
            <div className="mt-4">
              <PatientConnectionsSection patientId={user.id} />
            </div>
          </section>
        )}

        {/* Account Management */}
        <section>
          <h2 className="font-display text-xl font-bold text-ink">Account & Session Storage</h2>
          <Card className="mt-4 p-5">
            {user ? (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-soft text-teal">
                    <User className="h-5 w-5" aria-hidden />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-ink">{profile?.display_name || user.email}</p>
                      <span className="rounded bg-paper px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted border border-rule">
                        {profile?.role === 'professional'
                          ? profile.is_verified_professional ? 'Verified Clinician' : 'Clinician'
                          : profile?.role === 'wellness' ? 'Wellness' : 'Patient'}
                      </span>
                    </div>
                    <p className="text-xs text-muted">{user.email} · Private Row-Level Security active</p>
                  </div>
                </div>

                <Button variant="ghost" onClick={handleSignOut} className="text-xs">
                  <LogOut className="h-4 w-4" aria-hidden /> Sign Out
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-ink">Guest Mode</h3>
                  <p className="mt-1 text-xs text-muted">
                    You are currently using KinectIQ without signing in. Unsaved sessions remain in temporary device storage until you sign in.
                  </p>
                </div>
                <Button onClick={() => nav('/auth?next=/settings')} className="text-xs">
                  Sign In / Create Account
                </Button>
              </div>
            )}
          </Card>
        </section>
      </div>
    </div>
  )
}
