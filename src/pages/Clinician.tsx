import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  Clock,
  Edit3,
  FileCheck,
  FolderLock,
  History,
  ListChecks,
  Lock,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { Badge, Button, Card, PageTitle, deg, pct } from '../components/ui'
import { ProgressChart } from '../components/ProgressChart'
import { useAuth, useUser } from '../lib/auth'
import { useSessions } from '../lib/useSessions'
import { RequireUser } from './History'
import {
  getProfessionalCredentials,
  submitProfessionalCredentials,
  getProfessionalConnections,
  requestPatientConnection,
  revokeConnection,
  type ProfessionalCredential,
  type PatientConnection,
} from '../lib/connections'
import { EXERCISES, exerciseById } from '../lib/exercises'
import {
  createClinicalPlan,
  getPlanAuditEvents,
  getPlansForProfessional,
  updateClinicalPlan,
  type ClinicalPlan,
  type PlanAuditEvent,
  type PlanExerciseItem,
} from '../lib/clinicalPlans'

export default function Clinician() {
  const { profile } = useAuth()
  const isProfessional = profile?.role === 'professional'

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <PageTitle eyebrow="Clinician Hub" title="Physiotherapist & Doctor Portal" />

      {isProfessional ? (
        <RequireUser>
          {(u) => <ClinicianPortal user={u} isVerified={!!profile.is_verified_professional} />}
        </RequireUser>
      ) : (
        <Card className="mb-8 flex gap-4 border-amber/40 bg-amber-soft p-5">
          <Lock className="mt-0.5 h-5 w-5 shrink-0 text-amber" aria-hidden />
          <div>
            <h2 className="font-semibold text-ink">Clinician Portal Access</h2>
            <p className="mt-1 text-sm text-[#5c3d0b] leading-relaxed">
              This area is dedicated to certified physiotherapists, orthopedists, and rehabilitation physicians.
              Your account currently has the <strong>{profile?.role ?? 'patient'}</strong> role.
            </p>
            <p className="mt-2 text-xs text-muted">
              To evaluate clinician tools, sign up or switch to a clinician account with the role set to "Physiotherapist / Clinician".
            </p>
          </div>
        </Card>
      )}

      {/* Own demonstrative tracking history */}
      <div className="mt-12 pt-8 border-t border-rule">
        <h2 className="font-display text-xl font-bold text-ink mb-2">Practitioner Sandbox Telemetry</h2>
        <p className="text-xs text-muted mb-6">
          Use the camera on your local workstation to test exercise routines and verify biomechanical tracking algorithms.
        </p>
        <RequireUser>{(u) => <OwnDashboard user={u} isProfessional={isProfessional} />}</RequireUser>
      </div>
    </div>
  )
}

function ClinicianPortal({
  user,
  isVerified,
}: {
  user: NonNullable<ReturnType<typeof useUser>>
  isVerified: boolean
}) {
  const [credential, setCredential] = useState<ProfessionalCredential | null>(null)
  const [connections, setConnections] = useState<PatientConnection[]>([])
  const [plans, setPlans] = useState<ClinicalPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'roster' | 'plans' | 'pending'>('roster')

  // Modals
  const [showCredModal, setShowCredModal] = useState(false)
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<PatientConnection | null>(null)

  // Plan Modals & State
  const [showPlanBuilder, setShowPlanBuilder] = useState(false)
  const [selectedPatientForPlan, setSelectedPatientForPlan] = useState<PatientConnection | null>(null)
  const [editingPlan, setEditingPlan] = useState<ClinicalPlan | null>(null)
  const [viewingAudits, setViewingAudits] = useState<PlanAuditEvent[] | null>(null)

  // Credential Form
  const [fullName, setFullName] = useState('')
  const [title, setTitle] = useState('Physiotherapist')
  const [licenseNumber, setLicenseNumber] = useState('')
  const [jurisdiction, setJurisdiction] = useState('')
  const [organization, setOrganization] = useState('')
  const [docRef, setDocRef] = useState('')
  const [credSubmitting, setCredSubmitting] = useState(false)
  const [credMsg, setCredMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  // Connection Request Form
  const [patientIdInput, setPatientIdInput] = useState('')
  const [clinicalNotesInput, setClinicalNotesInput] = useState('')
  const [connectSubmitting, setConnectSubmitting] = useState(false)
  const [connectMsg, setConnectMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  // Plan Builder Form State
  const [planTitle, setPlanTitle] = useState('')
  const [planInstructions, setPlanInstructions] = useState('')
  const [planFrequency, setPlanFrequency] = useState('Daily')
  const [planStartDate, setPlanStartDate] = useState(() => new Date().toISOString().split('T')[0])
  const [planEndDate, setPlanEndDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 28) // 4 weeks
    return d.toISOString().split('T')[0]
  })
  const [planItems, setPlanItems] = useState<PlanExerciseItem[]>([
    { exerciseId: 'shoulder_abduction', targetSets: 3, targetReps: 10, targetRomDeg: 120, side: 'right' },
  ])
  const [planSubmitting, setPlanSubmitting] = useState(false)
  const [planMsg, setPlanMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  // Plan Editor State
  const [editChangeSummary, setEditChangeSummary] = useState('')
  const [editStatus, setEditStatus] = useState<'active' | 'completed' | 'paused' | 'archived'>('active')

  const loadData = useCallback(async () => {
    setLoading(true)
    const [cred, conns, planList] = await Promise.all([
      getProfessionalCredentials(user.id),
      getProfessionalConnections(user.id),
      getPlansForProfessional(user.id),
    ])
    setCredential(cred)
    setConnections(conns)
    setPlans(planList)
    setLoading(false)
  }, [user.id])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // Effective verification state (database column or verified credential)
  const verifiedEffective = isVerified || credential?.status === 'approved'

  const activePatients = connections.filter((c) => c.status === 'active')
  const pendingInvitations = connections.filter((c) => c.status === 'pending')

  async function handleCredentialSubmit(e: FormEvent) {
    e.preventDefault()
    setCredSubmitting(true)
    setCredMsg(null)
    const res = await submitProfessionalCredentials({
      professional_id: user.id,
      full_name: fullName,
      title,
      license_number: licenseNumber,
      license_jurisdiction: jurisdiction,
      organization: organization || undefined,
      document_reference: docRef || undefined,
    })
    setCredSubmitting(false)
    if (res.success) {
      setCredMsg({
        tone: 'ok',
        text: 'Credentials submitted for verification. An administrator will review your medical credentials. Self-verification is prohibited by database security triggers.',
      })
      await loadData()
      setTimeout(() => setShowCredModal(false), 2000)
    } else {
      setCredMsg({ tone: 'error', text: res.error || 'Failed to submit credentials.' })
    }
  }

  async function handleConnectSubmit(e: FormEvent) {
    e.preventDefault()
    setConnectSubmitting(true)
    setConnectMsg(null)
    const res = await requestPatientConnection({
      patientIdentifier: patientIdInput,
      professionalId: user.id,
      professionalNotes: clinicalNotesInput,
      professionalName: credential?.full_name || user.email?.split('@')[0],
      professionalTitle: credential?.title || 'Physiotherapist',
      isVerifiedProfessional: verifiedEffective,
    })
    setConnectSubmitting(false)
    if (res.success) {
      setConnectMsg({
        tone: 'ok',
        text: 'Connection request sent to patient. Patient must explicitly review and accept before any connection is active.',
      })
      setPatientIdInput('')
      setClinicalNotesInput('')
      await loadData()
      setTimeout(() => setShowConnectModal(false), 2000)
    } else {
      setConnectMsg({ tone: 'error', text: res.error || 'Failed to send request.' })
    }
  }

  async function handleCancelInvitation(connectionId: string) {
    await revokeConnection(connectionId, user.id)
    await loadData()
  }

  function openPlanBuilderForPatient(patient: PatientConnection) {
    setSelectedPatientForPlan(patient)
    setPlanTitle(`Rehabilitation Protocol - ${patient.patient_name || 'Patient'}`)
    setPlanInstructions('')
    setPlanFrequency('Daily')
    setPlanStartDate(new Date().toISOString().split('T')[0])
    const end = new Date()
    end.setDate(end.getDate() + 28)
    setPlanEndDate(end.toISOString().split('T')[0])
    setPlanItems([
      { exerciseId: 'shoulder_abduction', targetSets: 3, targetReps: 10, targetRomDeg: 120, side: 'right' },
    ])
    setPlanMsg(null)
    setShowPlanBuilder(true)
  }

  function addPlanExerciseRow() {
    setPlanItems((prev) => [
      ...prev,
      { exerciseId: 'biceps_curl', targetSets: 3, targetReps: 12, side: 'right' },
    ])
  }

  function updatePlanExerciseRow(idx: number, patch: Partial<PlanExerciseItem>) {
    setPlanItems((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)))
  }

  function removePlanExerciseRow(idx: number) {
    if (planItems.length <= 1) return
    setPlanItems((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleCreatePlanSubmit(e: FormEvent) {
    e.preventDefault()
    if (!selectedPatientForPlan) return
    setPlanSubmitting(true)
    setPlanMsg(null)

    const res = await createClinicalPlan({
      professional_id: user.id,
      patient_id: selectedPatientForPlan.patient_id,
      connection_id: selectedPatientForPlan.id,
      title: planTitle,
      instructions: planInstructions,
      frequency: planFrequency,
      start_date: planStartDate,
      end_date: planEndDate,
      exercises: planItems,
      professional_name: credential?.full_name || user.email?.split('@')[0],
      is_verified_professional: verifiedEffective,
    })

    setPlanSubmitting(false)
    if (res.success) {
      setPlanMsg({ tone: 'ok', text: 'Clinical exercise plan prescribed and assigned to patient.' })
      await loadData()
      setTimeout(() => setShowPlanBuilder(false), 1500)
    } else {
      setPlanMsg({ tone: 'error', text: res.error || 'Failed to create plan.' })
    }
  }

  async function handleEditPlanSubmit(e: FormEvent) {
    e.preventDefault()
    if (!editingPlan) return
    if (!editChangeSummary.trim()) {
      setPlanMsg({ tone: 'error', text: 'A change summary is required so the patient understands why the plan was modified.' })
      return
    }

    setPlanSubmitting(true)
    setPlanMsg(null)

    const res = await updateClinicalPlan(editingPlan.id, user.id, {
      title: planTitle,
      instructions: planInstructions,
      frequency: planFrequency,
      end_date: planEndDate,
      status: editStatus,
      exercises: planItems,
      change_summary: editChangeSummary,
    })

    setPlanSubmitting(false)
    if (res.success) {
      setPlanMsg({ tone: 'ok', text: `Plan updated to version ${res.plan?.version}. Patient will be notified of the change summary.` })
      await loadData()
      setTimeout(() => setEditingPlan(null), 1500)
    } else {
      setPlanMsg({ tone: 'error', text: res.error || 'Failed to update plan.' })
    }
  }

  async function openAuditsForPlan(planId: string) {
    const list = await getPlanAuditEvents(planId)
    setViewingAudits(list)
  }

  if (loading) {
    return (
      <Card className="p-8 text-center text-xs text-muted">
        Loading clinician workspace and patient connections…
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Clinician Identity & Verification Status Banner */}
      <Card className={`p-6 border ${verifiedEffective ? 'border-teal/40 bg-teal-soft/20' : 'border-amber/40 bg-amber-soft/20'}`}>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${verifiedEffective ? 'bg-teal text-white' : 'bg-amber-600 text-white'}`}>
              <Stethoscope className="h-6 w-6" aria-hidden />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-lg font-bold text-ink">
                  {credential?.full_name || user.email?.split('@')[0] || 'Clinician Workspace'}
                </h2>
                {verifiedEffective ? (
                  <Badge tone="teal" className="flex items-center gap-1 font-semibold">
                    <ShieldCheck className="h-3.5 w-3.5" /> Verified Practitioner
                  </Badge>
                ) : credential?.status === 'pending' ? (
                  <Badge tone="amber" className="flex items-center gap-1 font-semibold border border-amber/30">
                    <Clock className="h-3.5 w-3.5 text-amber-600" /> Verification Pending Review
                  </Badge>
                ) : credential?.status === 'rejected' ? (
                  <Badge tone="neutral" className="flex items-center gap-1 font-semibold text-danger border border-danger/30">
                    <ShieldAlert className="h-3.5 w-3.5 text-danger" /> Credential Rejected
                  </Badge>
                ) : (
                  <Badge tone="amber" className="flex items-center gap-1 font-semibold border border-amber/30">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600" /> Unverified (Credentials Needed)
                  </Badge>
                )}
              </div>

              <p className="mt-1 text-xs text-muted">
                {credential ? (
                  <>
                    <strong className="text-ink">{credential.title}</strong>
                    {credential.organization ? ` · ${credential.organization}` : ''}
                    {` · License: ${credential.license_number} (${credential.license_jurisdiction})`}
                  </>
                ) : (
                  'No professional credentials submitted yet.'
                )}
              </p>

              {/* Status explanation */}
              <div className="mt-3 text-xs leading-relaxed max-w-2xl">
                {verifiedEffective ? (
                  <p className="text-teal-900 bg-white/70 rounded-md p-2.5 border border-teal/20">
                    ✓ <strong>Certified Clinical Access:</strong> Your professional credentials are fully verified. You may review session telemetry, prescribe exercise routines, and audit patient recovery protocols.
                  </p>
                ) : (
                  <div className="rounded-md bg-white/80 p-3 border border-amber/30 text-amber-900 space-y-1">
                    <p className="font-semibold flex items-center gap-1.5">
                      <FolderLock className="h-4 w-4 text-amber-600" />
                      Patient Data Access Restricted (Preview Sandbox Mode)
                    </p>
                    <p className="text-[11px] text-muted">
                      Under medical privacy regulations, unverified clinicians cannot view patient movement history, raw ROM metrics, or assign exercise plans. Self-verification is strictly prohibited by database security triggers.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:items-end gap-2 shrink-0">
            <Button
              variant={verifiedEffective ? 'ghost' : 'primary'}
              onClick={() => {
                if (credential) {
                  setFullName(credential.full_name)
                  setTitle(credential.title)
                  setLicenseNumber(credential.license_number)
                  setJurisdiction(credential.license_jurisdiction)
                  setOrganization(credential.organization || '')
                  setDocRef(credential.document_reference || '')
                }
                setShowCredModal(true)
              }}
              className="text-xs"
            >
              <FileCheck className="h-4 w-4" />
              {credential ? 'Update Credentials' : 'Submit Credentials'}
            </Button>
            <span className="text-[10px] text-muted font-mono">Zero-Video Architecture</span>
          </div>
        </div>
      </Card>

      {/* Navigation Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 border-b sm:border-b-0 border-rule pb-2 sm:pb-0">
          <button
            type="button"
            onClick={() => setActiveTab('roster')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition ${
              activeTab === 'roster'
                ? 'bg-ink text-white'
                : 'text-muted hover:text-ink hover:bg-paper'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            Active Patients ({activePatients.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('plans')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition ${
              activeTab === 'plans'
                ? 'bg-ink text-white'
                : 'text-muted hover:text-ink hover:bg-paper'
            }`}
          >
            <ListChecks className="h-3.5 w-3.5" />
            Prescribed Plans ({plans.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition ${
              activeTab === 'pending'
                ? 'bg-ink text-white'
                : 'text-muted hover:text-ink hover:bg-paper'
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            Pending Invitations ({pendingInvitations.length})
          </button>
        </div>

        <Button
          variant="primary"
          onClick={() => setShowConnectModal(true)}
          className="text-xs"
        >
          <UserPlus className="h-4 w-4" /> Connect New Patient
        </Button>
      </div>

      {/* Tab 1: Active Patients Roster */}
      {activeTab === 'roster' && (
        <div className="space-y-4">
          {activePatients.length === 0 ? (
            <Card className="p-10 text-center bg-paper">
              <Users className="mx-auto h-8 w-8 text-muted mb-3" />
              <h3 className="font-display text-base font-bold text-ink">No connected patients yet</h3>
              <p className="mt-1 text-xs text-muted max-w-md mx-auto">
                Connect with your patients by inviting their email or patient account ID. Once they explicitly review and accept, they will appear in your clinical roster.
              </p>
              <Button
                variant="primary"
                onClick={() => setShowConnectModal(true)}
                className="mt-4 text-xs"
              >
                <Plus className="h-3.5 w-3.5" /> Send Patient Invitation
              </Button>
            </Card>
          ) : (
            <div className="grid gap-4">
              {activePatients.map((pat) => {
                const canAssignPlan = verifiedEffective && pat.consent_scope.allow_plan_assignment
                const patientPlans = plans.filter((p) => p.patient_id === pat.patient_id)

                return (
                  <Card key={pat.id} className="p-5 border-rule space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-ink">
                            {pat.patient_name || pat.patient_email || `Patient (${pat.patient_id.slice(0, 8)})`}
                          </span>
                          <span className="rounded bg-teal-soft px-1.5 py-0.5 text-[10px] font-semibold text-teal">
                            Active Connection
                          </span>
                          {patientPlans.length > 0 && (
                            <span className="rounded bg-paper px-1.5 py-0.5 text-[10px] font-mono text-muted border border-rule">
                              {patientPlans.length} {patientPlans.length === 1 ? 'plan' : 'plans'}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted mt-0.5">
                          Connected: {pat.responded_at ? new Date(pat.responded_at).toLocaleDateString() : 'Active'}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant={canAssignPlan ? 'primary' : 'ghost'}
                          onClick={() => {
                            if (canAssignPlan) openPlanBuilderForPatient(pat)
                          }}
                          disabled={!canAssignPlan}
                          className="text-xs"
                          title={
                            !verifiedEffective
                              ? 'Verification required to assign plans'
                              : !pat.consent_scope.allow_plan_assignment
                              ? 'Patient has not granted plan assignment consent'
                              : 'Prescribe exercise plan'
                          }
                        >
                          <Plus className="h-3.5 w-3.5" />
                          {canAssignPlan
                            ? 'Prescribe Plan'
                            : !verifiedEffective
                            ? 'Plan Locked (Unverified)'
                            : 'Consent Needed'}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => setSelectedPatient(pat)}
                          className="text-xs"
                        >
                          {verifiedEffective ? 'Review Telemetry' : 'Locked (Unverified)'}
                        </Button>
                      </div>
                    </div>

                    {/* Consent scope chips */}
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-rule text-xs">
                      <span className="text-muted text-[11px] font-semibold">Patient Consent Scope:</span>
                      <span className="rounded bg-paper px-2 py-0.5 text-[11px] font-mono border border-rule/70">
                        {pat.consent_scope.share_recent_sessions ? '✓ Recent 30 Days' : '✕ Recent Excluded'}
                      </span>
                      <span className="rounded bg-paper px-2 py-0.5 text-[11px] font-mono border border-rule/70">
                        {pat.consent_scope.share_rom_metrics ? '✓ ROM Metrics' : '✕ ROM Excluded'}
                      </span>
                      <span className="rounded bg-paper px-2 py-0.5 text-[11px] font-mono border border-rule/70">
                        {pat.consent_scope.allow_plan_assignment ? '✓ Plan Assignment Allowed' : '🔒 Plan Assignment Prohibited'}
                      </span>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Prescribed Plans */}
      {activeTab === 'plans' && (
        <div className="space-y-4">
          {plans.length === 0 ? (
            <Card className="p-10 text-center bg-paper">
              <ListChecks className="mx-auto h-8 w-8 text-muted mb-3" />
              <h3 className="font-display text-base font-bold text-ink">No exercise plans prescribed yet</h3>
              <p className="mt-1 text-xs text-muted max-w-md mx-auto">
                Create and assign tailored rehabilitation protocols to your active patients. Prescribed routines appear on the patient's recovery dashboard.
              </p>
            </Card>
          ) : (
            <div className="grid gap-4">
              {plans.map((plan) => (
                <Card key={plan.id} className="p-5 border-rule space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-base font-bold text-ink">
                          {plan.title}
                        </span>
                        <span className="rounded bg-paper px-2 py-0.5 text-[11px] font-mono text-muted border border-rule">
                          v{plan.version}
                        </span>
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-semibold capitalize ${
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
                      <p className="text-xs text-muted mt-1">
                        Patient: <strong>{plan.patient_id.slice(0, 8)}…</strong> · Schedule: <strong>{plan.frequency}</strong> ({plan.start_date} to {plan.end_date})
                      </p>
                      {plan.instructions && (
                        <p className="text-xs text-ink/80 mt-1 italic">
                          "{plan.instructions}"
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="ghost"
                        onClick={() => openAuditsForPlan(plan.id)}
                        className="text-xs"
                      >
                        <History className="h-3.5 w-3.5" /> Audit Log
                      </Button>
                      <Button
                        variant="primary"
                        onClick={() => {
                          setEditingPlan(plan)
                          setPlanTitle(plan.title)
                          setPlanInstructions(plan.instructions || '')
                          setPlanFrequency(plan.frequency)
                          setPlanEndDate(plan.end_date)
                          setEditStatus(plan.status)
                          setPlanItems([...plan.exercises])
                          setEditChangeSummary('')
                          setPlanMsg(null)
                        }}
                        className="text-xs"
                      >
                        <Edit3 className="h-3.5 w-3.5" /> Edit Plan
                      </Button>
                    </div>
                  </div>

                  {/* Exercises in plan */}
                  <div className="pt-2 border-t border-rule">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">
                      Prescribed Exercises ({plan.exercises.length}):
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {plan.exercises.map((item, idx) => {
                        const ex = exerciseById(item.exerciseId)
                        return (
                          <div key={idx} className="rounded border border-rule/70 bg-paper p-2.5 text-xs">
                            <div className="font-semibold text-ink flex items-center justify-between">
                              <span>{ex?.name ?? item.exerciseId}</span>
                              <span className="text-[10px] text-muted uppercase font-mono">{item.side}</span>
                            </div>
                            <div className="text-[11px] text-muted font-mono mt-0.5">
                              {item.targetSets} sets × {item.targetReps ? `${item.targetReps} reps` : `${item.targetHoldDurationS}s hold`}
                              {item.targetRomDeg ? ` · ROM: ${item.targetRomDeg}°` : ''}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Pending Outgoing Invitations */}
      {activeTab === 'pending' && (
        <div className="space-y-4">
          {pendingInvitations.length === 0 ? (
            <Card className="p-8 text-center bg-paper">
              <p className="text-sm font-semibold text-ink">No pending invitations</p>
              <p className="text-xs text-muted mt-1">All patient connection requests have been responded to.</p>
            </Card>
          ) : (
            <div className="grid gap-3">
              {pendingInvitations.map((inv) => (
                <Card key={inv.id} className="p-4 border-amber/30 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-ink">
                        {inv.patient_name || inv.patient_email || inv.patient_id}
                      </span>
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 border border-amber-300">
                        Awaiting Patient Consent
                      </span>
                    </div>
                    <p className="text-xs text-muted mt-0.5">
                      Invited on {new Date(inv.requested_at).toLocaleDateString()}
                      {inv.professional_notes ? ` · Note: "${inv.professional_notes}"` : ''}
                    </p>
                  </div>

                  <Button
                    variant="ghost"
                    onClick={() => handleCancelInvitation(inv.id)}
                    className="text-xs text-muted hover:text-danger hover:bg-rose-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Cancel Request
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL: Plan Builder (Create Plan) */}
      {showPlanBuilder && selectedPatientForPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <Card className="w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-rule pb-3">
              <div className="flex items-center gap-2">
                <ListChecks className="h-5 w-5 text-teal" />
                <h3 className="font-display text-base font-bold text-ink">
                  Prescribe Clinical Exercise Plan
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPlanBuilder(false)}
                className="text-muted hover:text-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-muted">
              Prescribing care plan for <strong>{selectedPatientForPlan.patient_name || selectedPatientForPlan.patient_id}</strong>.
              All exercises will be linked to the patient's recovery dashboard with real-time pose tracking targets.
            </p>

            <form onSubmit={handleCreatePlanSubmit} className="space-y-4 text-xs">
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="block text-ink font-medium">
                  Plan Title *
                  <input
                    type="text"
                    required
                    value={planTitle}
                    onChange={(e) => setPlanTitle(e.target.value)}
                    placeholder="e.g. Post-Op Shoulder Recovery Phase 1"
                    className="mt-1 w-full rounded border border-rule px-3 py-2 text-xs focus:border-teal focus:outline-none"
                  />
                </label>

                <label className="block text-ink font-medium">
                  Frequency *
                  <input
                    type="text"
                    required
                    value={planFrequency}
                    onChange={(e) => setPlanFrequency(e.target.value)}
                    placeholder="e.g. Daily or 3x per week"
                    className="mt-1 w-full rounded border border-rule px-3 py-2 text-xs focus:border-teal focus:outline-none"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-ink font-medium">
                  Start Date *
                  <input
                    type="date"
                    required
                    value={planStartDate}
                    onChange={(e) => setPlanStartDate(e.target.value)}
                    className="mt-1 w-full rounded border border-rule px-3 py-2 text-xs focus:border-teal focus:outline-none"
                  />
                </label>

                <label className="block text-ink font-medium">
                  End Date *
                  <input
                    type="date"
                    required
                    value={planEndDate}
                    onChange={(e) => setPlanEndDate(e.target.value)}
                    className="mt-1 w-full rounded border border-rule px-3 py-2 text-xs focus:border-teal focus:outline-none"
                  />
                </label>
              </div>

              <label className="block text-ink font-medium">
                Clinical Instructions & Precautions
                <textarea
                  value={planInstructions}
                  onChange={(e) => setPlanInstructions(e.target.value)}
                  rows={2}
                  placeholder="e.g. Perform following gentle heat application. Cease movement if sharp anterior pain occurs."
                  className="mt-1 w-full rounded border border-rule px-3 py-2 text-xs focus:border-teal focus:outline-none"
                />
              </label>

              {/* Prescribed Exercises Editor */}
              <div className="space-y-3 pt-2 border-t border-rule">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-ink uppercase tracking-wider text-[11px]">
                    Prescribed Exercise Routines ({planItems.length})
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={addPlanExerciseRow}
                    className="text-xs text-teal"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Exercise
                  </Button>
                </div>

                {planItems.map((item, idx) => {
                  const ex = exerciseById(item.exerciseId)
                  const isHold = ex?.track?.mode === 'hold'

                  return (
                    <div
                      key={idx}
                      className="rounded-lg border border-rule bg-paper/60 p-3.5 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <select
                          value={item.exerciseId}
                          onChange={(e) => updatePlanExerciseRow(idx, { exerciseId: e.target.value })}
                          className="rounded border border-rule bg-white px-2.5 py-1.5 text-xs font-semibold text-ink focus:border-teal focus:outline-none flex-1 max-w-xs"
                        >
                          {EXERCISES.filter((e) => !!e.track).map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.name} ({e.region})
                            </option>
                          ))}
                        </select>

                        {planItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removePlanExerciseRow(idx)}
                            className="text-muted hover:text-danger p-1"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <label className="text-[11px] text-muted">
                          Sets:
                          <input
                            type="number"
                            min={1}
                            max={10}
                            value={item.targetSets}
                            onChange={(e) => updatePlanExerciseRow(idx, { targetSets: parseInt(e.target.value) || 1 })}
                            className="mt-1 w-full rounded border border-rule bg-white px-2 py-1 text-xs text-ink"
                          />
                        </label>

                        {isHold ? (
                          <label className="text-[11px] text-muted">
                            Hold Seconds:
                            <input
                              type="number"
                              min={3}
                              max={300}
                              value={item.targetHoldDurationS ?? 15}
                              onChange={(e) => updatePlanExerciseRow(idx, { targetHoldDurationS: parseInt(e.target.value) || 15 })}
                              className="mt-1 w-full rounded border border-rule bg-white px-2 py-1 text-xs text-ink"
                            />
                          </label>
                        ) : (
                          <label className="text-[11px] text-muted">
                            Reps:
                            <input
                              type="number"
                              min={1}
                              max={100}
                              value={item.targetReps ?? 10}
                              onChange={(e) => updatePlanExerciseRow(idx, { targetReps: parseInt(e.target.value) || 10 })}
                              className="mt-1 w-full rounded border border-rule bg-white px-2 py-1 text-xs text-ink"
                            />
                          </label>
                        )}

                        <label className="text-[11px] text-muted">
                          Target ROM (°):
                          <input
                            type="number"
                            min={10}
                            max={180}
                            placeholder="Optional"
                            value={item.targetRomDeg ?? ''}
                            onChange={(e) => updatePlanExerciseRow(idx, { targetRomDeg: parseInt(e.target.value) || undefined })}
                            className="mt-1 w-full rounded border border-rule bg-white px-2 py-1 text-xs text-ink"
                          />
                        </label>

                        <label className="text-[11px] text-muted">
                          Side:
                          <select
                            value={item.side}
                            onChange={(e) => updatePlanExerciseRow(idx, { side: e.target.value as 'left' | 'right' | 'both' })}
                            className="mt-1 w-full rounded border border-rule bg-white px-2 py-1 text-xs text-ink"
                          >
                            <option value="right">Right</option>
                            <option value="left">Left</option>
                            <option value="both">Both sides</option>
                          </select>
                        </label>
                      </div>
                    </div>
                  )
                })}
              </div>

              {planMsg && (
                <div
                  role="alert"
                  className={`rounded p-2.5 text-xs font-medium border ${
                    planMsg.tone === 'ok'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-rose-50 text-danger border-rose-200'
                  }`}
                >
                  {planMsg.text}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-rule">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowPlanBuilder(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={planSubmitting || !planTitle.trim()}
                  className="text-xs"
                >
                  {planSubmitting ? 'Prescribing…' : 'Prescribe Plan'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* MODAL: Plan Editor (with Versioning & Change Summary) */}
      {editingPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <Card className="w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-rule pb-3">
              <div className="flex items-center gap-2">
                <Edit3 className="h-5 w-5 text-teal" />
                <h3 className="font-display text-base font-bold text-ink">
                  Edit Clinical Plan (v{editingPlan.version} → v{editingPlan.version + 1})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingPlan(null)}
                className="text-muted hover:text-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-amber-900 bg-amber-soft/40 p-2.5 rounded border border-amber/30">
              <strong>Non-Silent Modification Notice:</strong> Modifying an active plan automatically increments its version and notifies the patient with your change summary.
            </p>

            <form onSubmit={handleEditPlanSubmit} className="space-y-4 text-xs">
              <div className="grid sm:grid-cols-3 gap-3">
                <label className="block text-ink font-medium sm:col-span-2">
                  Plan Title *
                  <input
                    type="text"
                    required
                    value={planTitle}
                    onChange={(e) => setPlanTitle(e.target.value)}
                    className="mt-1 w-full rounded border border-rule px-3 py-2 text-xs focus:border-teal focus:outline-none"
                  />
                </label>

                <label className="block text-ink font-medium">
                  Plan Status
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as any)}
                    className="mt-1 w-full rounded border border-rule px-3 py-2 text-xs focus:border-teal focus:outline-none capitalize"
                  >
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="completed">Completed</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <label className="block text-ink font-medium">
                  Frequency
                  <input
                    type="text"
                    required
                    value={planFrequency}
                    onChange={(e) => setPlanFrequency(e.target.value)}
                    className="mt-1 w-full rounded border border-rule px-3 py-2 text-xs focus:border-teal focus:outline-none"
                  />
                </label>

                <label className="block text-ink font-medium">
                  End Date
                  <input
                    type="date"
                    required
                    value={planEndDate}
                    onChange={(e) => setPlanEndDate(e.target.value)}
                    className="mt-1 w-full rounded border border-rule px-3 py-2 text-xs focus:border-teal focus:outline-none"
                  />
                </label>
              </div>

              <label className="block text-ink font-medium">
                Clinical Instructions
                <textarea
                  value={planInstructions}
                  onChange={(e) => setPlanInstructions(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded border border-rule px-3 py-2 text-xs focus:border-teal focus:outline-none"
                />
              </label>

              <label className="block text-ink font-medium">
                Change Summary / Clinical Rationale *
                <input
                  type="text"
                  required
                  value={editChangeSummary}
                  onChange={(e) => setEditChangeSummary(e.target.value)}
                  placeholder="e.g. Increased target reps from 10 to 12 as shoulder strength improved."
                  className="mt-1 w-full rounded border border-amber-300 bg-amber-50/50 px-3 py-2 text-xs focus:border-teal focus:outline-none"
                />
              </label>

              {/* Prescribed Exercises Editor */}
              <div className="space-y-3 pt-2 border-t border-rule">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-ink uppercase tracking-wider text-[11px]">
                    Prescribed Exercise Routines ({planItems.length})
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={addPlanExerciseRow}
                    className="text-xs text-teal"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Exercise
                  </Button>
                </div>

                {planItems.map((item, idx) => {
                  const ex = exerciseById(item.exerciseId)
                  const isHold = ex?.track?.mode === 'hold'

                  return (
                    <div
                      key={idx}
                      className="rounded-lg border border-rule bg-paper/60 p-3.5 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <select
                          value={item.exerciseId}
                          onChange={(e) => updatePlanExerciseRow(idx, { exerciseId: e.target.value })}
                          className="rounded border border-rule bg-white px-2.5 py-1.5 text-xs font-semibold text-ink focus:border-teal focus:outline-none flex-1 max-w-xs"
                        >
                          {EXERCISES.filter((e) => !!e.track).map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.name} ({e.region})
                            </option>
                          ))}
                        </select>

                        {planItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removePlanExerciseRow(idx)}
                            className="text-muted hover:text-danger p-1"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <label className="text-[11px] text-muted">
                          Sets:
                          <input
                            type="number"
                            min={1}
                            max={10}
                            value={item.targetSets}
                            onChange={(e) => updatePlanExerciseRow(idx, { targetSets: parseInt(e.target.value) || 1 })}
                            className="mt-1 w-full rounded border border-rule bg-white px-2 py-1 text-xs text-ink"
                          />
                        </label>

                        {isHold ? (
                          <label className="text-[11px] text-muted">
                            Hold Seconds:
                            <input
                              type="number"
                              min={3}
                              max={300}
                              value={item.targetHoldDurationS ?? 15}
                              onChange={(e) => updatePlanExerciseRow(idx, { targetHoldDurationS: parseInt(e.target.value) || 15 })}
                              className="mt-1 w-full rounded border border-rule bg-white px-2 py-1 text-xs text-ink"
                            />
                          </label>
                        ) : (
                          <label className="text-[11px] text-muted">
                            Reps:
                            <input
                              type="number"
                              min={1}
                              max={100}
                              value={item.targetReps ?? 10}
                              onChange={(e) => updatePlanExerciseRow(idx, { targetReps: parseInt(e.target.value) || 10 })}
                              className="mt-1 w-full rounded border border-rule bg-white px-2 py-1 text-xs text-ink"
                            />
                          </label>
                        )}

                        <label className="text-[11px] text-muted">
                          Target ROM (°):
                          <input
                            type="number"
                            min={10}
                            max={180}
                            placeholder="Optional"
                            value={item.targetRomDeg ?? ''}
                            onChange={(e) => updatePlanExerciseRow(idx, { targetRomDeg: parseInt(e.target.value) || undefined })}
                            className="mt-1 w-full rounded border border-rule bg-white px-2 py-1 text-xs text-ink"
                          />
                        </label>

                        <label className="text-[11px] text-muted">
                          Side:
                          <select
                            value={item.side}
                            onChange={(e) => updatePlanExerciseRow(idx, { side: e.target.value as 'left' | 'right' | 'both' })}
                            className="mt-1 w-full rounded border border-rule bg-white px-2 py-1 text-xs text-ink"
                          >
                            <option value="right">Right</option>
                            <option value="left">Left</option>
                            <option value="both">Both sides</option>
                          </select>
                        </label>
                      </div>
                    </div>
                  )
                })}
              </div>

              {planMsg && (
                <div
                  role="alert"
                  className={`rounded p-2.5 text-xs font-medium border ${
                    planMsg.tone === 'ok'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-rose-50 text-danger border-rose-200'
                  }`}
                >
                  {planMsg.text}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-rule">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEditingPlan(null)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={planSubmitting || !planTitle.trim() || !editChangeSummary.trim()}
                  className="text-xs"
                >
                  {planSubmitting ? 'Saving…' : 'Save & Publish Updates'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* MODAL: Plan Audit Events Trail */}
      {viewingAudits && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <Card className="w-full max-w-lg p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-rule pb-3">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-teal" />
                <h3 className="font-display text-base font-bold text-ink">
                  Plan Modification Audit Trail
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setViewingAudits(null)}
                className="text-muted hover:text-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {viewingAudits.length === 0 ? (
              <p className="text-xs text-muted py-4">No audit events recorded for this plan.</p>
            ) : (
              <div className="space-y-3">
                {viewingAudits.map((a) => (
                  <div key={a.id} className="rounded border border-rule bg-paper p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-ink capitalize">
                        {a.event_type.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] text-muted font-mono">
                        {new Date(a.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-muted">
                      {a.change_summary}
                    </p>
                    {a.new_version && (
                      <span className="inline-block rounded bg-teal-soft text-teal px-1.5 py-0.2 text-[10px] font-mono">
                        Version {a.new_version}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* MODAL: Submit / Update Professional Credentials */}
      {showCredModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <Card className="w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-rule pb-3">
              <div className="flex items-center gap-2">
                <FileCheck className="h-5 w-5 text-teal" />
                <h3 className="font-display text-base font-bold text-ink">
                  Professional Credential Verification
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCredModal(false)}
                className="text-muted hover:text-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-muted leading-relaxed">
              To safeguard patient health information and comply with clinical privacy regulations, practitioner accounts require verified credentials. Verification is performed by authorized administrators.
            </p>

            <form onSubmit={handleCredentialSubmit} className="space-y-3.5 text-xs">
              <label className="block text-ink font-medium">
                Legal Full Name *
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Dr. Jennifer Hayes, PT, DPT"
                  className="mt-1 w-full rounded border border-rule px-3 py-2 text-xs focus:border-teal focus:outline-none"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-ink font-medium">
                  Professional Title *
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Senior Physical Therapist"
                    className="mt-1 w-full rounded border border-rule px-3 py-2 text-xs focus:border-teal focus:outline-none"
                  />
                </label>

                <label className="block text-ink font-medium">
                  License Number *
                  <input
                    type="text"
                    required
                    value={licenseNumber}
                    onChange={(e) => setLicenseNumber(e.target.value)}
                    placeholder="e.g. PT-948271"
                    className="mt-1 w-full rounded border border-rule px-3 py-2 text-xs focus:border-teal focus:outline-none"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-ink font-medium">
                  Licensing Jurisdiction / Board *
                  <input
                    type="text"
                    required
                    value={jurisdiction}
                    onChange={(e) => setJurisdiction(e.target.value)}
                    placeholder="e.g. State Physical Therapy Board"
                    className="mt-1 w-full rounded border border-rule px-3 py-2 text-xs focus:border-teal focus:outline-none"
                  />
                </label>

                <label className="block text-ink font-medium">
                  Clinic / Hospital / Organization
                  <input
                    type="text"
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    placeholder="e.g. Sports Orthopedic Institute"
                    className="mt-1 w-full rounded border border-rule px-3 py-2 text-xs focus:border-teal focus:outline-none"
                  />
                </label>
              </div>

              <label className="block text-ink font-medium">
                Registry ID / Credential Document Reference (Optional)
                <input
                  type="text"
                  value={docRef}
                  onChange={(e) => setDocRef(e.target.value)}
                  placeholder="e.g. NPI #1982736450 or Board Verification URL"
                  className="mt-1 w-full rounded border border-rule px-3 py-2 text-xs focus:border-teal focus:outline-none"
                />
              </label>

              {credMsg && (
                <div
                  role="alert"
                  className={`rounded p-2.5 text-xs font-medium border ${
                    credMsg.tone === 'ok'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-rose-50 text-danger border-rose-200'
                  }`}
                >
                  {credMsg.text}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-rule">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowCredModal(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={credSubmitting || !fullName || !licenseNumber || !jurisdiction}
                  className="text-xs"
                >
                  {credSubmitting ? 'Submitting…' : 'Submit for Verification'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* MODAL: Connect New Patient */}
      {showConnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <Card className="w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-rule pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-teal" />
                <h3 className="font-display text-base font-bold text-ink">
                  Connect with Patient
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowConnectModal(false)}
                className="text-muted hover:text-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-muted leading-relaxed">
              Send a connection invitation. Under platform privacy rules, patients must explicitly accept and choose their privacy consent boundaries before any movement telemetry is linked.
            </p>

            <form onSubmit={handleConnectSubmit} className="space-y-3.5 text-xs">
              <label className="block text-ink font-medium">
                Patient Email or Account ID *
                <input
                  type="text"
                  required
                  value={patientIdInput}
                  onChange={(e) => setPatientIdInput(e.target.value)}
                  placeholder="e.g. patient@example.com or user-uuid"
                  className="mt-1 w-full rounded border border-rule px-3 py-2 text-xs focus:border-teal focus:outline-none"
                />
              </label>

              <label className="block text-ink font-medium">
                Clinical Intake Note (Optional)
                <textarea
                  value={clinicalNotesInput}
                  onChange={(e) => setClinicalNotesInput(e.target.value)}
                  rows={3}
                  placeholder="e.g. Monitoring range of motion for 6-week post-op shoulder recovery protocol."
                  className="mt-1 w-full rounded border border-rule px-3 py-2 text-xs focus:border-teal focus:outline-none"
                />
              </label>

              {connectMsg && (
                <div
                  role="alert"
                  className={`rounded p-2.5 text-xs font-medium border ${
                    connectMsg.tone === 'ok'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-rose-50 text-danger border-rose-200'
                  }`}
                >
                  {connectMsg.text}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-rule">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowConnectModal(false)}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={connectSubmitting || !patientIdInput.trim()}
                  className="text-xs"
                >
                  {connectSubmitting ? 'Sending…' : 'Send Connection Request'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* MODAL: Inspect Patient Telemetry or Restricted Access Notice */}
      {selectedPatient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <Card className="w-full max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-rule pb-3">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-teal" />
                <h3 className="font-display text-base font-bold text-ink">
                  Patient Evidence Review: {selectedPatient.patient_name || selectedPatient.patient_email || selectedPatient.patient_id}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPatient(null)}
                className="text-muted hover:text-ink"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {!verifiedEffective ? (
              <div className="p-6 text-center space-y-3">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                  <Lock className="h-6 w-6" />
                </div>
                <h4 className="font-display text-base font-bold text-ink">
                  Clinical Verification Required
                </h4>
                <p className="text-xs text-muted max-w-md mx-auto leading-relaxed">
                  You are currently unverified. Privileged patient telemetry and movement recordings cannot be unlocked until your professional credentials have been confirmed by an administrator.
                </p>
                <Button
                  variant="primary"
                  onClick={() => {
                    setSelectedPatient(null)
                    setShowCredModal(true)
                  }}
                  className="text-xs"
                >
                  Submit Credentials for Verification
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg border border-teal/30 bg-teal-soft/20 p-3 text-xs flex items-start gap-2">
                  <ShieldCheck className="h-4 w-4 text-teal mt-0.5 shrink-0" />
                  <div>
                    <span className="font-semibold text-ink">Verified Clinical Review Mode:</span>
                    <p className="text-muted text-[11px] mt-0.5">
                      Displaying exercise session evidence adhering to patient's granted consent scope.
                      {selectedPatient.consent_scope.share_all_history
                        ? ' Full historical archive access granted.'
                        : ' Historical access bounded to the most recent 30 days.'}
                    </p>
                  </div>
                </div>

                <div className="p-8 text-center bg-paper rounded-lg border border-rule">
                  <p className="font-semibold text-sm text-ink">No telemetry sessions available in this window</p>
                  <p className="text-xs text-muted mt-1 max-w-md mx-auto">
                    The patient has not completed any exercise sets within the permitted consent timeframe. Telemetry will sync here once completed.
                  </p>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}

function OwnDashboard({
  user,
  isProfessional,
}: {
  user: NonNullable<ReturnType<typeof useUser>>
  isProfessional?: boolean
}) {
  const { state } = useSessions(user)
  if (state.kind === 'loading') return <div className="text-xs text-muted py-4">Loading sessions…</div>
  if (state.kind === 'error') return <p role="alert" className="text-danger text-xs">Sessions could not load: {state.message}</p>
  const rows = state.data
  const withPeak = rows.filter((r) => r.peak_rom_deg != null)
  const q = rows.filter((r) => r.tracking_quality != null)
  const tiles = [
    ['Sessions saved', String(rows.length)],
    ['Valid reps, all sessions', String(rows.reduce((a, r) => a + r.valid_reps, 0))],
    ['Best peak elevation', withPeak.length ? deg(Math.max(...withPeak.map((r) => r.peak_rom_deg!))) : '—'],
    ['Avg reliable tracking', q.length ? pct(q.reduce((a, r) => a + r.tracking_quality!, 0) / q.length) : '—'],
  ]
  return (
    <>
      <p className="mb-4 text-xs text-muted">
        {isProfessional ? 'Practitioner demonstration telemetry for' : 'Records for'}{' '}
        <span className="font-medium text-ink">{user.email}</span> (your own account)
      </p>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-rule bg-rule md:grid-cols-4">
        {tiles.map(([k, v]) => (
          <div key={k} className="bg-white p-5"><dt className="text-xs text-muted">{k}</dt><dd className="mt-1 font-mono text-2xl font-bold">{v}</dd></div>
        ))}
      </dl>
      <Card className="mt-6 p-5">
        <h2 className="mb-4 font-display text-base font-bold">Peak elevation trend</h2>
        <ProgressChart sessions={rows} />
      </Card>
      <Card className="mt-6 p-5">
        <h2 className="font-display text-base font-bold">Evidence completeness</h2>
        {rows.length === 0 ? <p className="mt-2 text-xs text-muted">No saved sessions yet.</p> : (
          <ul className="mt-3 space-y-2 text-xs">
            {(['complete', 'partial', 'insufficient'] as const).map((k) => {
              const n = rows.filter((r) => r.evidence === k).length
              return (
                <li key={k} className="flex items-center gap-3">
                  <span className="w-24 capitalize">{k}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded bg-paper"><span className={`block h-full ${k === 'complete' ? 'bg-teal' : k === 'partial' ? 'bg-amber' : 'bg-muted'}`} style={{ width: `${(n / rows.length) * 100}%` }} /></span>
                  <span className="w-8 text-right font-mono">{n}</span>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </>
  )
}
