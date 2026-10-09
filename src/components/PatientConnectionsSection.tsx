import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Stethoscope,
  Trash2,
  XCircle,
} from 'lucide-react'
import { Badge, Button, Card } from './ui'
import {
  getPatientConnections,
  respondToConnectionRequest,
  revokeConnection,
  updateConsentScope,
  DEFAULT_CONSENT_SCOPE,
  type ConsentScope,
  type PatientConnection,
} from '../lib/connections'

export function PatientConnectionsSection({
  patientId,
  condensed = false,
}: {
  patientId: string
  condensed?: boolean
}) {
  const [connections, setConnections] = useState<PatientConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [respondingId, setRespondingId] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  // Scopes chosen for pending requests prior to accepting
  const [scopes, setScopes] = useState<Record<string, ConsentScope>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const list = await getPatientConnections(patientId)
    setConnections(list)
    setLoading(false)
  }, [patientId])

  useEffect(() => {
    void load()
  }, [load])

  const pendingRequests = connections.filter((c) => c.status === 'pending')
  const activeConnections = connections.filter((c) => c.status === 'active')

  function getScope(id: string): ConsentScope {
    return scopes[id] ?? { ...DEFAULT_CONSENT_SCOPE }
  }

  function setScopeField(id: string, field: keyof ConsentScope, val: boolean) {
    const cur = getScope(id)
    setScopes((prev) => ({
      ...prev,
      [id]: { ...cur, [field]: val },
    }))
  }

  async function handleResponse(connectionId: string, accept: boolean) {
    setRespondingId(connectionId)
    setActionMsg(null)
    const scope = getScope(connectionId)
    const res = await respondToConnectionRequest({
      connectionId,
      patientId,
      accept,
      consentScope: scope,
    })
    setRespondingId(null)
    if (res.success) {
      setActionMsg({
        tone: 'ok',
        text: accept
          ? 'Practitioner connection accepted with your customized consent scope.'
          : 'Practitioner connection request declined.',
      })
      await load()
    } else {
      setActionMsg({ tone: 'error', text: res.error || 'Failed to update connection.' })
    }
  }

  async function handleRevoke(connectionId: string) {
    if (!window.confirm('Are you sure you want to revoke this practitioner connection? They will immediately lose access to your shared session telemetry.')) {
      return
    }
    setRevokingId(connectionId)
    setActionMsg(null)
    const res = await revokeConnection(connectionId, patientId)
    setRevokingId(null)
    if (res.success) {
      setActionMsg({ tone: 'ok', text: 'Practitioner connection revoked. Data access has been severed immediately.' })
      await load()
    } else {
      setActionMsg({ tone: 'error', text: res.error || 'Failed to revoke connection.' })
    }
  }

  async function handleScopeUpdate(connectionId: string, updates: Partial<ConsentScope>) {
    const res = await updateConsentScope(connectionId, patientId, updates)
    if (res.success) {
      setActionMsg({ tone: 'ok', text: 'Consent permissions updated.' })
      await load()
    } else {
      setActionMsg({ tone: 'error', text: res.error || 'Failed to update consent.' })
    }
  }

  if (loading) {
    return (
      <Card className="p-5 text-center text-xs text-muted">
        Loading practitioner connections...
      </Card>
    )
  }

  // If condensed and nothing pending or active, return null
  if (condensed && pendingRequests.length === 0 && activeConnections.length === 0) {
    return null
  }

  return (
    <div className="space-y-6">
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

      {/* 1. Pending Incoming Requests */}
      {pendingRequests.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber" />
            <h3 className="font-display text-sm font-bold text-ink">
              Incoming Practitioner Connection Requests ({pendingRequests.length})
            </h3>
          </div>

          {pendingRequests.map((req) => {
            const scope = getScope(req.id)
            const isVerified = req.is_verified_professional

            return (
              <Card key={req.id} className="border-amber/40 bg-amber-soft/20 p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal text-white">
                      <Stethoscope className="h-5 w-5" aria-hidden />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-ink text-sm">
                          {req.professional_name || 'Practitioner'}
                        </span>
                        {isVerified ? (
                          <Badge tone="teal" className="flex items-center gap-1">
                            <ShieldCheck className="h-3 w-3" /> Verified Clinician
                          </Badge>
                        ) : (
                          <Badge tone="amber" className="flex items-center gap-1 border border-amber/30">
                            <AlertTriangle className="h-3 w-3 text-amber-600" /> Unverified Clinician (Restricted)
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted mt-0.5">
                        {req.professional_title || 'Physical Therapist'}
                        {req.professional_organization ? ` · ${req.professional_organization}` : ''}
                      </p>
                      {req.professional_notes && (
                        <p className="mt-2 text-xs italic text-ink/80 bg-white/70 p-2 rounded border border-rule/50">
                          "{req.professional_notes}"
                        </p>
                      )}
                    </div>
                  </div>

                  <span className="text-[11px] text-muted font-mono shrink-0">
                    Requested {new Date(req.requested_at).toLocaleDateString()}
                  </span>
                </div>

                {!isVerified && (
                  <div className="flex items-start gap-2 rounded-md bg-amber-50 p-2.5 text-xs text-amber-900 border border-amber-200">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                    <div>
                      <strong>Unverified Practitioner Notice:</strong> This practitioner has not yet completed administrative credential verification. If you accept, they will not be granted access to your session records until their license is officially verified.
                    </div>
                  </div>
                )}

                {/* Granular Consent Scoping Options */}
                <div className="rounded-lg border border-rule bg-white p-4 space-y-2.5 text-xs">
                  <span className="font-semibold text-ink block">
                    Privacy Consent Scoping (Customize what is shared):
                  </span>
                  <p className="text-muted text-[11px]">
                    A connection alone never automatically exposes your complete history. Select exactly what data is accessible:
                  </p>

                  <div className="grid gap-2 sm:grid-cols-2 pt-1">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={scope.share_recent_sessions}
                        onChange={(e) => setScopeField(req.id, 'share_recent_sessions', e.target.checked)}
                        className="rounded mt-0.5"
                      />
                      <div>
                        <span className="font-medium text-ink">Share recent sessions</span>
                        <p className="text-[11px] text-muted">Movement sessions within the last 30 days only</p>
                      </div>
                    </label>

                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={scope.share_rom_metrics}
                        onChange={(e) => setScopeField(req.id, 'share_rom_metrics', e.target.checked)}
                        className="rounded mt-0.5"
                      />
                      <div>
                        <span className="font-medium text-ink">Share calculated ROM metrics</span>
                        <p className="text-[11px] text-muted">Joint angles, rep counts, and tracking quality</p>
                      </div>
                    </label>

                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={scope.share_all_history}
                        onChange={(e) => setScopeField(req.id, 'share_all_history', e.target.checked)}
                        className="rounded mt-0.5"
                      />
                      <div>
                        <span className="font-medium text-ink">Share entire historical archive</span>
                        <p className="text-[11px] text-muted">Includes all past sessions older than 30 days</p>
                      </div>
                    </label>

                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={scope.allow_plan_assignment}
                        onChange={(e) => setScopeField(req.id, 'allow_plan_assignment', e.target.checked)}
                        className="rounded mt-0.5"
                      />
                      <div>
                        <span className="font-medium text-ink">Allow rehabilitation protocol guidance</span>
                        <p className="text-[11px] text-muted">Permit clinician to suggest exercise routines</p>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-1">
                  <Button
                    variant="ghost"
                    onClick={() => handleResponse(req.id, false)}
                    disabled={respondingId === req.id}
                    className="text-xs text-muted hover:text-danger"
                  >
                    <XCircle className="h-4 w-4" /> Decline
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => handleResponse(req.id, true)}
                    disabled={respondingId === req.id}
                    className="text-xs"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {respondingId === req.id ? 'Accepting…' : 'Accept Connection'}
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* 2. Active Connections List */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-sm font-bold text-ink flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-teal" />
            Connected Practitioners ({activeConnections.length})
          </h3>
          <span className="text-[11px] text-muted">Explicit consent active · Revocable anytime</span>
        </div>

        {activeConnections.length === 0 ? (
          <Card className="p-6 text-center bg-paper">
            <p className="text-sm font-semibold text-ink">No active practitioner connections</p>
            <p className="text-xs text-muted mt-1 max-w-md mx-auto">
              When your doctor or physiotherapist requests a connection, it will appear here for your explicit review and consent.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {activeConnections.map((conn) => (
              <Card key={conn.id} className="p-5 border-rule space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-soft text-teal">
                      <Stethoscope className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-ink">
                          {conn.professional_name || 'Practitioner'}
                        </span>
                        {conn.is_verified_professional ? (
                          <span className="rounded bg-teal-soft px-1.5 py-0.5 text-[10px] font-semibold text-teal">
                            Verified
                          </span>
                        ) : (
                          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 border border-amber-200">
                            Unverified (Data Locked)
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted">
                        {conn.professional_title || 'Physiotherapist'}
                        {conn.responded_at ? ` · Connected since ${new Date(conn.responded_at).toLocaleDateString()}` : ''}
                      </p>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    onClick={() => handleRevoke(conn.id)}
                    disabled={revokingId === conn.id}
                    className="text-xs text-muted hover:text-danger hover:bg-rose-50"
                  >
                    <Trash2 className="h-4 w-4" /> Revoke Access
                  </Button>
                </div>

                {/* Consent Scope Summary & Toggles */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-rule text-xs">
                  <span className="text-muted text-[11px] font-semibold uppercase tracking-wider">Active Permissions:</span>

                  <label className="inline-flex items-center gap-1.5 rounded bg-paper px-2 py-1 border border-rule/70 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={conn.consent_scope.share_recent_sessions}
                      onChange={(e) => handleScopeUpdate(conn.id, { share_recent_sessions: e.target.checked })}
                      className="rounded text-xs"
                    />
                    <span className="text-[11px] text-ink">Recent 30 Days</span>
                  </label>

                  <label className="inline-flex items-center gap-1.5 rounded bg-paper px-2 py-1 border border-rule/70 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={conn.consent_scope.share_rom_metrics}
                      onChange={(e) => handleScopeUpdate(conn.id, { share_rom_metrics: e.target.checked })}
                      className="rounded text-xs"
                    />
                    <span className="text-[11px] text-ink">ROM Angles & Quality</span>
                  </label>

                  <label className="inline-flex items-center gap-1.5 rounded bg-paper px-2 py-1 border border-rule/70 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={conn.consent_scope.share_all_history}
                      onChange={(e) => handleScopeUpdate(conn.id, { share_all_history: e.target.checked })}
                      className="rounded text-xs"
                    />
                    <span className="text-[11px] text-ink">Full History Archive</span>
                  </label>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
