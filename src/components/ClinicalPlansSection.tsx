import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bell,
  Calendar,
  CheckCircle,
  Clock,
  Play,
  RotateCcw,
  ShieldCheck,
  Stethoscope,
} from 'lucide-react'
import { Badge, Button, Card } from './ui'
import { exerciseById } from '../lib/exercises'
import {
  getPlansForPatient,
  updateClinicalPlan,
  type ClinicalPlan,
} from '../lib/clinicalPlans'
import { supabase, type SessionRow } from '../lib/supabase'

export function ClinicalPlansSection({ patientId }: { patientId: string }) {
  const [plans, setPlans] = useState<ClinicalPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [completedSessions, setCompletedSessions] = useState<SessionRow[]>([])
  const [actionMsg, setActionMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [planList, sessionsRes] = await Promise.all([
      getPlansForPatient(patientId),
      supabase
        ? supabase.from('exercise_sessions').select('*').eq('user_id', patientId)
        : Promise.resolve({ data: [] }),
    ])
    setPlans(planList)
    setCompletedSessions((sessionsRes.data as SessionRow[]) ?? [])
    setLoading(false)
  }, [patientId])

  useEffect(() => {
    void load()
  }, [load])

  async function handleToggleStatus(plan: ClinicalPlan, newStatus: 'completed' | 'active') {
    setActionMsg(null)
    const res = await updateClinicalPlan(plan.id, patientId, { status: newStatus })
    if (res.success) {
      setActionMsg({
        tone: 'ok',
        text: newStatus === 'completed' ? 'Plan marked as completed!' : 'Plan reactivated.',
      })
      await load()
    } else {
      setActionMsg({ tone: 'error', text: res.error || 'Failed to update plan status.' })
    }
  }

  if (loading) {
    return (
      <Card className="p-6 text-center text-xs text-muted">
        Loading prescribed clinical plans…
      </Card>
    )
  }

  if (plans.length === 0) {
    return null // Return null if no clinical plans assigned to keep dashboard clean
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Stethoscope className="h-5 w-5 text-teal" />
          <h2 className="font-display text-lg font-bold text-ink">
            Prescribed Clinical Exercise Plans ({plans.length})
          </h2>
        </div>
        <span className="text-[11px] text-muted font-medium">
          Professional Care Protocols · Separate from Everyday Wellness
        </span>
      </div>

      {actionMsg && (
        <div
          role="alert"
          className={`rounded-lg p-3 text-xs font-medium border ${
            actionMsg.tone === 'ok'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-danger border-rose-200'
          }`}
        >
          {actionMsg.text}
        </div>
      )}

      <div className="space-y-6">
        {plans.map((plan) => {
          const planSessions = completedSessions.filter((s) => s.plan_id === plan.id)
          const isComplete = plan.status === 'completed'

          return (
            <Card
              key={plan.id}
              className={`p-6 border ${
                isComplete
                  ? 'border-rule bg-paper/50'
                  : 'border-teal/40 bg-white shadow-xs'
              }`}
            >
              {/* Plan Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-rule pb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-xl font-bold text-ink">
                      {plan.title}
                    </h3>
                    <Badge tone="teal" className="flex items-center gap-1 font-semibold">
                      <ShieldCheck className="h-3 w-3" />
                      Prescribed by {plan.professional_name || 'Clinician'}
                    </Badge>
                    <span className="rounded bg-paper px-2 py-0.5 text-[11px] font-mono text-muted border border-rule">
                      v{plan.version}
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-semibold capitalize ${
                        plan.status === 'active'
                          ? 'bg-emerald-100 text-emerald-800'
                          : plan.status === 'completed'
                          ? 'bg-teal-100 text-teal-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {plan.status}
                    </span>
                  </div>

                  {plan.instructions && (
                    <p className="mt-2 text-xs text-muted leading-relaxed max-w-2xl">
                      <strong>Practitioner Instructions:</strong> {plan.instructions}
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-teal" />
                      Frequency: <strong className="text-ink">{plan.frequency}</strong>
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5 text-teal" />
                      Duration: <strong className="text-ink">{plan.start_date}</strong> to <strong className="text-ink">{plan.end_date}</strong>
                    </span>
                    <span>
                      Completed Sessions: <strong className="text-ink font-mono">{planSessions.length}</strong>
                    </span>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  {isComplete ? (
                    <Button
                      variant="ghost"
                      onClick={() => handleToggleStatus(plan, 'active')}
                      className="text-xs"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Re-open Plan
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      onClick={() => handleToggleStatus(plan, 'completed')}
                      className="text-xs text-emerald-700 hover:bg-emerald-50"
                    >
                      <CheckCircle className="h-3.5 w-3.5" /> Mark Completed
                    </Button>
                  )}
                </div>
              </div>

              {/* Version Update Notice (non-silent modification disclosure) */}
              {plan.version > 1 && plan.last_change_summary && (
                <div className="my-3.5 rounded-lg border border-amber/30 bg-amber-soft/30 p-3 text-xs text-amber-900 flex items-start gap-2.5">
                  <Bell className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-semibold">Plan Updated by Clinician (Version {plan.version}):</strong>
                    <p className="mt-0.5 text-amber-800">{plan.last_change_summary}</p>
                  </div>
                </div>
              )}

              {/* Prescribed Exercises List */}
              <div className="mt-5 space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Prescribed Exercise Routines ({plan.exercises.length})
                </h4>

                <div className="grid gap-3 sm:grid-cols-2">
                  {plan.exercises.map((item, idx) => {
                    const ex = exerciseById(item.exerciseId)
                    const isHold = ex?.track?.mode === 'hold'

                    return (
                      <div
                        key={`${item.exerciseId}-${idx}`}
                        className="flex flex-col justify-between rounded-lg border border-rule bg-paper/60 p-4 transition hover:border-teal hover:bg-white"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-display text-sm font-bold text-ink">
                              {ex?.name ?? item.exerciseId}
                            </span>
                            <Badge tone="teal" className="text-[10px]">
                              {item.side === 'both' ? 'Bilateral' : `${item.side} side`}
                            </Badge>
                          </div>

                          <div className="mt-2 text-xs space-y-1">
                            <div className="text-ink font-mono font-medium">
                              {item.targetSets} sets ×{' '}
                              {isHold
                                ? `${item.targetHoldDurationS ?? 15}s hold`
                                : `${item.targetReps ?? 10} reps`}
                              {item.targetRomDeg ? ` · Target ROM: ${item.targetRomDeg}°` : ''}
                            </div>
                            {item.notes && (
                              <p className="text-[11px] text-muted italic">
                                Note: "{item.notes}"
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="mt-4 pt-3 border-t border-rule/60 flex items-center justify-between">
                          <span className="text-[11px] text-muted">
                            {ex?.region ?? 'Rehab'}
                          </span>
                          <Link
                            to={`/exercise?id=${item.exerciseId}&planId=${plan.id}`}
                            className="inline-flex items-center gap-1.5 rounded-md bg-teal px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-teal/90 transition"
                          >
                            <Play className="h-3 w-3 fill-white" /> Start Exercise
                          </Link>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
