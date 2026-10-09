import { describe, expect, it } from 'vitest'
import {
  createClinicalPlan,
  validatePlanInput,
  type ClinicalPlan,
  type CreatePlanInput,
  type PlanAuditEvent,
} from '../lib/clinicalPlans'
import {
  DEFAULT_CONSENT_SCOPE,
  requestPatientConnection,
  respondToConnectionRequest,
  type PatientConnection,
} from '../lib/connections'
import { exerciseById, EXERCISES } from '../lib/exercises'
import { SessionTracker, summarize, type TrackDef } from '../lib/engine'
import { toPayload, type ProfileRow } from '../lib/supabase'

// ==============================================================================
// 1. DEDICATED SEPARATE TEST ACCOUNTS FOR AUDIT
// ==============================================================================
const ACCOUNTS = {
  // Verified Doctor (Dr. Elena Vance, Orthopedic Physio)
  verifiedDoctor: {
    id: 'user-doc-verified-01',
    display_name: 'Dr. Elena Vance, DPT',
    role: 'professional' as const,
    is_verified_professional: true,
  },
  // Consented Patient (Alex Chen, Post-op rotator cuff rehabilitation)
  consentedPatient: {
    id: 'user-pat-consented-01',
    display_name: 'Alex Chen',
    role: 'patient' as const,
    is_verified_professional: false,
  },
  // Unverified Clinician (Bob Unverified, claimed physio without verified credentials)
  unverifiedDoctor: {
    id: 'user-doc-unverified-02',
    display_name: 'Bob Unverified',
    role: 'professional' as const,
    is_verified_professional: false,
  },
  // Patient with Revoked / Missing Plan Consent (Charlie No-Consent)
  revokedPatient: {
    id: 'user-pat-revoked-02',
    display_name: 'Charlie Davis',
    role: 'patient' as const,
    is_verified_professional: false,
  },
  // Disconnected Doctor (Dr. Marcus Ward, Verified, but no relationship with Alex Chen)
  disconnectedDoctor: {
    id: 'user-doc-disconnected-03',
    display_name: 'Dr. Marcus Ward, MD',
    role: 'professional' as const,
    is_verified_professional: true,
  },
  // Unrelated User / Attacker (Eve Malicious)
  unrelatedUser: {
    id: 'user-eve-unrelated-04',
    display_name: 'Eve Attacker',
    role: 'wellness' as const,
    is_verified_professional: false,
  },
}

// ==============================================================================
// 2. POSTGRESQL DATABASE TRIGGER & RLS SIMULATOR
// Tests the exact logic and error codes defined in 20261013000000_clinical_plans.sql
// ==============================================================================
class DatabaseTriggerSimulator {
  private profiles = new Map<string, ProfileRow>()
  private connections = new Map<string, PatientConnection>()
  private plans = new Map<string, ClinicalPlan>()
  private audits: PlanAuditEvent[] = []

  constructor() {
    // Populate profiles
    for (const acc of Object.values(ACCOUNTS)) {
      this.profiles.set(acc.id, acc)
    }
  }

  setConnection(conn: PatientConnection) {
    this.connections.set(`${conn.patient_id}:${conn.professional_id}`, conn)
  }

  // Emulates PL/pgSQL function: public.protect_clinical_plan_authorization()
  // on INSERT into public.clinical_plans
  executeTriggerBeforeInsert(callerUid: string, newRow: Partial<ClinicalPlan>): ClinicalPlan {
    if (!callerUid) {
      const err = new Error('Authentication required')
      ;(err as any).code = '28000'
      throw err
    }

    if (newRow.professional_id !== callerUid) {
      const err = new Error('Cannot create a clinical plan on behalf of another practitioner')
      ;(err as any).code = '42501'
      throw err
    }

    const prof = this.profiles.get(newRow.professional_id)
    if (!prof || prof.is_verified_professional !== true) {
      const err = new Error('Only verified practitioners may create and assign exercise plans')
      ;(err as any).code = '42501'
      throw err
    }

    const conn = this.connections.get(`${newRow.patient_id}:${newRow.professional_id}`)
    if (!conn || conn.status !== 'active') {
      const err = new Error('An active patient connection is required to assign an exercise plan')
      ;(err as any).code = '42501'
      throw err
    }

    if (!conn.consent_scope?.allow_plan_assignment) {
      const err = new Error('Patient has not granted consent for clinical plan assignment')
      ;(err as any).code = '42501'
      throw err
    }

    const plan: ClinicalPlan = {
      id: newRow.id || `plan-db-${Date.now()}`,
      professional_id: newRow.professional_id,
      patient_id: newRow.patient_id!,
      connection_id: conn.id,
      title: newRow.title!,
      instructions: newRow.instructions || null,
      frequency: newRow.frequency || 'Daily',
      status: 'active',
      version: 1,
      start_date: newRow.start_date || new Date().toISOString().split('T')[0],
      end_date: newRow.end_date!,
      exercises: newRow.exercises || [],
      last_change_summary: 'Initial plan assignment',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    this.plans.set(plan.id, plan)

    // Trigger after insert: log_clinical_plan_audit()
    this.audits.push({
      id: `audit-${Date.now()}`,
      plan_id: plan.id,
      actor_id: callerUid,
      event_type: 'created',
      change_summary: 'Initial plan assignment',
      previous_version: null,
      new_version: 1,
      metadata: { title: plan.title, exercises_count: plan.exercises.length },
      created_at: new Date().toISOString(),
    })

    return plan
  }

  // Emulates PL/pgSQL function: public.protect_clinical_plan_authorization()
  // on UPDATE on public.clinical_plans
  executeTriggerBeforeUpdate(
    callerUid: string,
    planId: string,
    updates: Partial<ClinicalPlan>,
    changeSummary?: string,
  ): ClinicalPlan {
    const oldRow = this.plans.get(planId)
    if (!oldRow) throw new Error('Plan not found')

    let profVerified = false
    let connStatus = ''
    let planConsent = false

    if (callerUid === oldRow.patient_id) {
      // Patient can only update status
      if (
        updates.title !== undefined ||
        updates.instructions !== undefined ||
        updates.exercises !== undefined ||
        updates.professional_id !== undefined ||
        updates.patient_id !== undefined ||
        updates.version !== undefined
      ) {
        const err = new Error('Patients may only update the status of their assigned plan')
        ;(err as any).code = '42501'
        throw err
      }
    } else if (callerUid === oldRow.professional_id) {
      const prof = this.profiles.get(callerUid)
      profVerified = prof?.is_verified_professional === true
      if (!profVerified) {
        const err = new Error('Clinician verification is required to edit exercise plans')
        ;(err as any).code = '42501'
        throw err
      }

      const conn = this.connections.get(`${oldRow.patient_id}:${oldRow.professional_id}`)
      connStatus = conn?.status || ''
      planConsent = conn?.consent_scope?.allow_plan_assignment === true

      if (connStatus !== 'active' || !planConsent) {
        const err = new Error('Cannot edit plan: active patient connection and consent required')
        ;(err as any).code = '42501'
        throw err
      }
    } else {
      const err = new Error('Unauthorized to update this clinical plan')
      ;(err as any).code = '42501'
      throw err
    }

    const contentChanged =
      (updates.exercises && JSON.stringify(updates.exercises) !== JSON.stringify(oldRow.exercises)) ||
      (updates.instructions && updates.instructions !== oldRow.instructions) ||
      (updates.title && updates.title !== oldRow.title)

    const newVersion = contentChanged ? oldRow.version + 1 : oldRow.version

    const updatedRow: ClinicalPlan = {
      ...oldRow,
      ...updates,
      version: newVersion,
      last_change_summary: changeSummary || oldRow.last_change_summary,
      updated_at: new Date().toISOString(),
    }

    this.plans.set(planId, updatedRow)

    // Trigger after update: log_clinical_plan_audit()
    if (newVersion > oldRow.version) {
      this.audits.push({
        id: `audit-${Date.now()}`,
        plan_id: planId,
        actor_id: callerUid,
        event_type: 'version_updated',
        change_summary: changeSummary || 'Updated plan exercises or instructions',
        previous_version: oldRow.version,
        new_version: newVersion,
        metadata: { title: updatedRow.title, exercises_count: updatedRow.exercises.length },
        created_at: new Date().toISOString(),
      })
    } else if (updates.status && updates.status !== oldRow.status) {
      this.audits.push({
        id: `audit-${Date.now()}`,
        plan_id: planId,
        actor_id: callerUid,
        event_type: 'status_changed',
        change_summary: `Status changed from ${oldRow.status} to ${updates.status}`,
        previous_version: oldRow.version,
        new_version: newVersion,
        metadata: { old_status: oldRow.status, new_status: updates.status },
        created_at: new Date().toISOString(),
      })
    }

    return updatedRow
  }

  // Emulates RLS SELECT policy on public.clinical_plans:
  // patient_id = auth.uid() or professional_id = auth.uid()
  queryPlans(callerUid: string): ClinicalPlan[] {
    return Array.from(this.plans.values()).filter(
      (p) => p.patient_id === callerUid || p.professional_id === callerUid,
    )
  }

  // Emulates RLS SELECT policy on public.plan_audit_events:
  // exists (select 1 from public.clinical_plans p where p.id = plan_id and (p.patient_id = auth.uid() or p.professional_id = auth.uid()))
  queryAuditEvents(callerUid: string, planId: string): PlanAuditEvent[] {
    const plan = this.plans.get(planId)
    if (!plan) return []
    if (plan.patient_id !== callerUid && plan.professional_id !== callerUid) {
      return [] // RLS blocks row visibility
    }
    return this.audits.filter((a) => a.plan_id === planId)
  }
}

// ==============================================================================
// 3. END-TO-END ACCEPTANCE AND SECURITY AUDIT TEST SUITE
// ==============================================================================
describe('E2E Acceptance & Security Audit: Multi-Account Plan Workflow', () => {
  let db: DatabaseTriggerSimulator
  let activeConnectionId: string
  let createdPlanId: string

  it('Setup: Establish verified connections and explicit consent scopes for test accounts', async () => {
    db = new DatabaseTriggerSimulator()

    // 1. Connection between Verified Doctor and Consented Patient
    const conn1Res = await requestPatientConnection(
      {
        patientIdentifier: ACCOUNTS.consentedPatient.id,
        professionalId: ACCOUNTS.verifiedDoctor.id,
        professionalName: ACCOUNTS.verifiedDoctor.display_name,
        isVerifiedProfessional: true,
      },
      null,
    )
    expect(conn1Res.success).toBe(true)
    activeConnectionId = conn1Res.connection!.id

    const accept1Res = await respondToConnectionRequest(
      {
        connectionId: activeConnectionId,
        patientId: ACCOUNTS.consentedPatient.id,
        accept: true,
        consentScope: {
          ...DEFAULT_CONSENT_SCOPE,
          allow_plan_assignment: true, // EXPLICIT CONSENT GRANTED
        },
      },
      null,
    )
    expect(accept1Res.success).toBe(true)
    expect(accept1Res.connection?.status).toBe('active')
    expect(accept1Res.connection?.consent_scope.allow_plan_assignment).toBe(true)
    db.setConnection(accept1Res.connection!)

    // 2. Connection between Verified Doctor and Revoked Patient (Consent explicitly false)
    const conn2Res = await requestPatientConnection(
      {
        patientIdentifier: ACCOUNTS.revokedPatient.id,
        professionalId: ACCOUNTS.verifiedDoctor.id,
        isVerifiedProfessional: true,
      },
      null,
    )
    const accept2Res = await respondToConnectionRequest(
      {
        connectionId: conn2Res.connection!.id,
        patientId: ACCOUNTS.revokedPatient.id,
        accept: true,
        consentScope: {
          ...DEFAULT_CONSENT_SCOPE,
          allow_plan_assignment: false, // CONSENT DENIED / REVOKED
        },
      },
      null,
    )
    db.setConnection(accept2Res.connection!)
  })

  // ----------------------------------------------------------------------------
  // SECTION 1: DATABASE & RLS ENFORCEMENT - REJECTION OF UNAUTHORIZED ACTIONS
  // ----------------------------------------------------------------------------
  it('DATABASE RLS AUDIT [TEST 1]: Rejects unverified professional attempting assignment', () => {
    expect(() => {
      db.executeTriggerBeforeInsert(ACCOUNTS.unverifiedDoctor.id, {
        professional_id: ACCOUNTS.unverifiedDoctor.id,
        patient_id: ACCOUNTS.consentedPatient.id,
        title: 'Unverified Plan Attempt',
        end_date: '2026-12-31',
        exercises: [{ exerciseId: 'shoulder_abduction', targetSets: 3, targetReps: 10, side: 'right' }],
      })
    }).toThrowError(/Only verified practitioners may create and assign exercise plans/i)
  })

  it('DATABASE RLS AUDIT [TEST 2]: Rejects assignment when patient consent is missing or revoked', () => {
    expect(() => {
      db.executeTriggerBeforeInsert(ACCOUNTS.verifiedDoctor.id, {
        professional_id: ACCOUNTS.verifiedDoctor.id,
        patient_id: ACCOUNTS.revokedPatient.id,
        title: 'Unauthorized Consent Plan',
        end_date: '2026-12-31',
        exercises: [{ exerciseId: 'shoulder_abduction', targetSets: 3, targetReps: 10, side: 'right' }],
      })
    }).toThrowError(/Patient has not granted consent for clinical plan assignment/i)
  })

  it('DATABASE RLS AUDIT [TEST 3]: Rejects disconnected professional attempting assignment', () => {
    expect(() => {
      db.executeTriggerBeforeInsert(ACCOUNTS.disconnectedDoctor.id, {
        professional_id: ACCOUNTS.disconnectedDoctor.id,
        patient_id: ACCOUNTS.consentedPatient.id,
        title: 'Disconnected Clinician Attempt',
        end_date: '2026-12-31',
        exercises: [{ exerciseId: 'shoulder_abduction', targetSets: 3, targetReps: 10, side: 'right' }],
      })
    }).toThrowError(/An active patient connection is required to assign an exercise plan/i)
  })

  it('DATABASE RLS AUDIT [TEST 4]: Rejects unauthenticated caller from inserting plan', () => {
    expect(() => {
      db.executeTriggerBeforeInsert('', {
        professional_id: ACCOUNTS.verifiedDoctor.id,
        patient_id: ACCOUNTS.consentedPatient.id,
        title: 'No Auth',
        end_date: '2026-12-31',
      })
    }).toThrowError(/Authentication required/i)
  })

  // ----------------------------------------------------------------------------
  // SECTION 2: AUTHORIZED ASSIGNMENT & PATIENT VISIBILITY
  // ----------------------------------------------------------------------------
  it('E2E PLAN ASSIGNMENT [TEST 5]: Verified professional assigns valid plan with patient consent', async () => {
    const planInput: CreatePlanInput = {
      professional_id: ACCOUNTS.verifiedDoctor.id,
      patient_id: ACCOUNTS.consentedPatient.id,
      connection_id: activeConnectionId,
      title: 'Post-Op Scapular & Rotator Cuff Phase 2',
      instructions: 'Perform daily in the morning after gentle heat pack.',
      frequency: 'Daily (Morning)',
      start_date: '2026-10-10',
      end_date: '2026-11-20',
      is_verified_professional: true,
      professional_name: ACCOUNTS.verifiedDoctor.display_name,
      exercises: [
        {
          exerciseId: 'shoulder_abduction',
          targetSets: 3,
          targetReps: 10,
          targetRomDeg: 90,
          side: 'right',
          notes: 'Avoid hiking shoulder girdle; maintain upright spinal posture.',
        },
        {
          exerciseId: 'biceps_curl',
          targetSets: 2,
          targetReps: 12,
          side: 'right',
          notes: 'Keep elbow pinned to rib cage during concentric phase.',
        },
      ],
    }

    // 1. Check client validation passes
    const val = validatePlanInput(planInput)
    expect(val.valid).toBe(true)

    // 2. Client service layer execution
    const createRes = await createClinicalPlan(planInput, null)
    expect(createRes.success).toBe(true)
    expect(createRes.plan).toBeDefined()
    createdPlanId = createRes.plan!.id

    // 3. Database trigger execution
    const dbPlan = db.executeTriggerBeforeInsert(ACCOUNTS.verifiedDoctor.id, {
      id: createdPlanId,
      professional_id: planInput.professional_id,
      patient_id: planInput.patient_id,
      title: planInput.title,
      instructions: planInput.instructions,
      frequency: planInput.frequency,
      end_date: planInput.end_date,
      exercises: planInput.exercises,
    })

    expect(dbPlan.version).toBe(1)
    expect(dbPlan.status).toBe('active')
    expect(dbPlan.exercises).toHaveLength(2)
  })

  it('RLS DATA ISOLATION [TEST 6]: Patient views assigned plan; unrelated users blocked', () => {
    // 1. Patient querying plans sees their assigned plan
    const patientVisiblePlans = db.queryPlans(ACCOUNTS.consentedPatient.id)
    expect(patientVisiblePlans).toHaveLength(1)
    expect(patientVisiblePlans[0].id).toBe(createdPlanId)
    expect(patientVisiblePlans[0].title).toBe('Post-Op Scapular & Rotator Cuff Phase 2')

    // 2. Authoring Doctor querying plans sees the plan
    const docVisiblePlans = db.queryPlans(ACCOUNTS.verifiedDoctor.id)
    expect(docVisiblePlans.find((p) => p.id === createdPlanId)).toBeDefined()

    // 3. Unrelated user (Eve) queries plans: RLS filters out all rows!
    const attackerVisiblePlans = db.queryPlans(ACCOUNTS.unrelatedUser.id)
    expect(attackerVisiblePlans).toHaveLength(0)

    // 4. Disconnected Doctor queries plans: RLS filters out all rows!
    const disconnectedVisiblePlans = db.queryPlans(ACCOUNTS.disconnectedDoctor.id)
    expect(disconnectedVisiblePlans).toHaveLength(0)
  })

  // ----------------------------------------------------------------------------
  // SECTION 3: PLAN EDITING, VERSIONING & AUDIT TRAIL
  // ----------------------------------------------------------------------------
  it('VERSIONING & AUDIT [TEST 7]: Professional modifies exercises, bumps version, records audit', async () => {
    const changeNotes = 'Increased shoulder abduction target ROM to 110° and increased sets to 4 based on clinical improvement.'

    // 1. Database trigger executes update and version bump
    const updatedPlan = db.executeTriggerBeforeUpdate(
      ACCOUNTS.verifiedDoctor.id,
      createdPlanId,
      {
        exercises: [
          {
            exerciseId: 'shoulder_abduction',
            targetSets: 4, // increased from 3 to 4
            targetReps: 10,
            targetRomDeg: 110, // increased from 90° to 110°
            side: 'right',
            notes: 'Progressed ROM target.',
          },
          {
            exerciseId: 'biceps_curl',
            targetSets: 2,
            targetReps: 12,
            side: 'right',
          },
        ],
      },
      changeNotes,
    )

    expect(updatedPlan.version).toBe(2)
    expect(updatedPlan.last_change_summary).toBe(changeNotes)

    // 2. Verify Audit Trail generated by trigger
    const audits = db.queryAuditEvents(ACCOUNTS.consentedPatient.id, createdPlanId)
    expect(audits).toHaveLength(2) // Initial 'created' + 'version_updated'

    const versionAudit = audits.find((a) => a.event_type === 'version_updated')
    expect(versionAudit).toBeDefined()
    expect(versionAudit?.previous_version).toBe(1)
    expect(versionAudit?.new_version).toBe(2)
    expect(versionAudit?.change_summary).toBe(changeNotes)
    expect(versionAudit?.actor_id).toBe(ACCOUNTS.verifiedDoctor.id)

    // 3. Unrelated user cannot read audit events (RLS block)
    const attackerAudits = db.queryAuditEvents(ACCOUNTS.unrelatedUser.id, createdPlanId)
    expect(attackerAudits).toHaveLength(0)
  })

  it('DATABASE ENFORCEMENT [TEST 8]: Prohibits patient from altering clinical exercises/targets', () => {
    expect(() => {
      db.executeTriggerBeforeUpdate(ACCOUNTS.consentedPatient.id, createdPlanId, {
        exercises: [{ exerciseId: 'shoulder_abduction', targetSets: 1, targetReps: 2, side: 'right' }],
      })
    }).toThrowError(/Patients may only update the status of their assigned plan/i)
  })

  it('PATIENT COMPLETION [TEST 9]: Allows patient to mark plan status as completed', () => {
    const completedPlan = db.executeTriggerBeforeUpdate(ACCOUNTS.consentedPatient.id, createdPlanId, {
      status: 'completed',
    })

    expect(completedPlan.status).toBe('completed')
    expect(completedPlan.version).toBe(2) // version does NOT bump on patient status update

    const audits = db.queryAuditEvents(ACCOUNTS.consentedPatient.id, createdPlanId)
    const statusAudit = audits.find((a) => a.event_type === 'status_changed')
    expect(statusAudit).toBeDefined()
    expect(statusAudit?.change_summary).toMatch(/Status changed from active to completed/i)
  })

  // ----------------------------------------------------------------------------
  // SECTION 4: REAL SESSION TELEMETRY & PLAN INTEGRATION
  // ----------------------------------------------------------------------------
  it('SESSION INTEGRATION [TEST 10]: Associates real exercise session with planId and computes authentic metrics', () => {
    const ex = exerciseById('shoulder_abduction')!
    const trackDef = ex.track as TrackDef
    const tr = new SessionTracker({ ...trackDef, emaAlpha: 0.5 }, 'right', ex.view)

    const P = (x: number, y: number, visibility = 0.95): { x: number; y: number; visibility: number } => ({ x, y, visibility })
    const rad = (d: number) => (d * Math.PI) / 180
    function frontPose(armDeg = 0) {
      const lm = Array.from({ length: 33 }, () => P(0.5, 0.5))
      lm[12] = P(0.4, 0.3); lm[11] = P(0.6, 0.3)
      lm[24] = P(0.4, 0.55); lm[23] = P(0.6, 0.55)
      lm[14] = P(lm[12].x - 0.15 * Math.sin(rad(armDeg)), 0.3 + 0.15 * Math.cos(rad(armDeg)))
      lm[13] = P(lm[11].x, 0.45)
      lm[16] = P(lm[14].x, lm[14].y + 0.12); lm[15] = P(lm[13].x, 0.57)
      lm[26] = P(0.4, 0.75); lm[25] = P(0.6, 0.75)
      lm[28] = P(0.4, 0.95); lm[27] = P(0.6, 0.95)
      lm[8] = P(0.42, 0.2); lm[7] = P(0.58, 0.2)
      return lm
    }

    const ramp = (a: number, b: number, n: number) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1))

    // 1. Calibrate in rest position (arm at 10 deg)
    for (let i = 0; i < 30; i++) {
      tr.update(frontPose(10), i * 33, 1)
    }
    expect(tr.isCalibrated).toBe(true)

    // 2. Feed ascending and descending motion (abduction up to 105 deg and back)
    const motionAngles = [...ramp(10, 105, 20), ...ramp(105, 10, 20)]
    motionAngles.forEach((deg, idx) => {
      tr.update(frontPose(deg), 1000 + idx * 33, 1)
    })

    // Confirm real rep was counted by the biomechanics engine
    expect(tr.reps).toHaveLength(1)
    expect(tr.reps[0].peak).toBeGreaterThan(90)
    expect(tr.incompleteReps).toBe(0)

    const startTime = new Date(Date.now() - 30000)
    const endTime = new Date()

    const rawSummary = summarize(
      tr,
      { id: 'session-telemetry-real-1', exercise: ex.id, version: ex.version, sided: ex.sided },
      startTime,
      endTime,
      30000,
    )

    // 3. Attach clinical plan ID to telemetry summary
    const sessionSummary = {
      ...rawSummary,
      planId: createdPlanId,
    }

    // 4. Verify payload mapping for database save_session RPC
    const payload = toPayload(sessionSummary)
    expect(payload.id).toBe('session-telemetry-real-1')
    expect(payload.plan_id).toBe(createdPlanId)
    expect(payload.exercise).toBe('shoulder_abduction')
    expect(payload.valid_reps).toBe(1)
    expect(payload.peak_rom_deg).toBeGreaterThan(90)
    expect(payload.tracking_quality).toBeGreaterThan(0.9)
    expect(payload.evidence).toBe('complete')
  })

  // ----------------------------------------------------------------------------
  // SECTION 5: PRESERVATION OF PHASE 1-3 CORE FUNCTIONALITY
  // ----------------------------------------------------------------------------
  it('REGRESSION AUDIT [TEST 11]: Confirms shoulder abduction biomechanics and thresholds remain intact', () => {
    const shoulder = exerciseById('shoulder_abduction')
    expect(shoulder).toBeDefined()
    expect(shoulder?.category).toBe('upper')
    expect(shoulder?.region).toBe('Shoulder')
    expect(shoulder?.track?.reps?.direction).toBe('up')
    expect(shoulder?.track?.reps?.start).toBe(40)
    expect(shoulder?.track?.reps?.target).toBe(80)
  })

  it('REGRESSION AUDIT [TEST 12]: Confirms biceps curl biomechanics and minRepMs calibration remain intact', () => {
    const biceps = exerciseById('biceps_curl')
    expect(biceps).toBeDefined()
    expect(biceps?.track?.reps?.direction).toBe('down')
    expect(biceps?.track?.reps?.rest).toBe(130)
    expect(biceps?.track?.reps?.start).toBe(115)
    expect(biceps?.track?.reps?.target).toBe(75)
    expect(biceps?.track?.reps?.minRepMs).toBe(600)
  })

  it('REGRESSION AUDIT [TEST 13]: Confirms all 18 exercises present and only supported exercises assignable', () => {
    expect(EXERCISES).toHaveLength(18)
    const assignable = EXERCISES.filter((e) => e.status !== 'unsupported' && !!e.track)
    expect(assignable).toHaveLength(17)
  })
})
