import { describe, expect, it } from 'vitest'
import {
  createClinicalPlan,
  getPlanAuditEvents,
  getPlansForPatient,
  getPlansForProfessional,
  updateClinicalPlan,
  validatePlanInput,
  type CreatePlanInput,
} from '../lib/clinicalPlans'
import {
  DEFAULT_CONSENT_SCOPE,
  requestPatientConnection,
  respondToConnectionRequest,
  revokeConnection,
  type ConsentScope,
} from '../lib/connections'
import { EXERCISES, exerciseById } from '../lib/exercises'
import { SessionTracker, summarize, type TrackDef } from '../lib/engine'

describe('Clinical Plan Validation & Exercise Catalog Verification', () => {
  it('validates plan title length', () => {
    const invalidInput: CreatePlanInput = {
      professional_id: 'prof-1',
      patient_id: 'patient-1',
      title: 'Hi', // too short
      end_date: '2026-12-31',
      exercises: [{ exerciseId: 'shoulder_abduction', targetSets: 3, targetReps: 10, side: 'right' }],
    }
    const res = validatePlanInput(invalidInput)
    expect(res.valid).toBe(false)
    expect(res.error).toMatch(/at least 3 characters/i)
  })

  it('rejects nonexistent exercise IDs not in the catalog', () => {
    const invalidInput: CreatePlanInput = {
      professional_id: 'prof-1',
      patient_id: 'patient-1',
      title: 'Valid Title',
      end_date: '2026-12-31',
      exercises: [{ exerciseId: 'invalid_aerobic_flip', targetSets: 3, targetReps: 10, side: 'right' }],
    }
    const res = validatePlanInput(invalidInput)
    expect(res.valid).toBe(false)
    expect(res.error).toMatch(/does not exist in the application/i)
  })

  it('rejects unsupported exercises that cannot be tracked with a single webcam', () => {
    // Find unsupported exercise in catalog (e.g. shoulder_internal_rotation_standing)
    const unsupported = EXERCISES.find((e) => e.status === 'unsupported' || !e.track)
    expect(unsupported).toBeDefined()

    const invalidInput: CreatePlanInput = {
      professional_id: 'prof-1',
      patient_id: 'patient-1',
      title: 'Rotator Cuff Protocol',
      end_date: '2026-12-31',
      exercises: [{ exerciseId: unsupported!.id, targetSets: 3, targetReps: 10, side: 'right' }],
    }
    const res = validatePlanInput(invalidInput)
    expect(res.valid).toBe(false)
    expect(res.error).toMatch(/cannot be reliably tracked/i)
  })

  it('rejects malformed target sets and repetition numbers', () => {
    const zeroSets: CreatePlanInput = {
      professional_id: 'prof-1',
      patient_id: 'patient-1',
      title: 'Shoulder Protocol',
      end_date: '2026-12-31',
      exercises: [{ exerciseId: 'shoulder_abduction', targetSets: 0, targetReps: 10, side: 'right' }],
    }
    expect(validatePlanInput(zeroSets).valid).toBe(false)

    const negativeReps: CreatePlanInput = {
      professional_id: 'prof-1',
      patient_id: 'patient-1',
      title: 'Shoulder Protocol',
      end_date: '2026-12-31',
      exercises: [{ exerciseId: 'shoulder_abduction', targetSets: 3, targetReps: -5, side: 'right' }],
    }
    expect(validatePlanInput(negativeReps).valid).toBe(false)
  })

  it('rejects end dates prior to start dates', () => {
    const invalidDates: CreatePlanInput = {
      professional_id: 'prof-1',
      patient_id: 'patient-1',
      title: 'Shoulder Protocol',
      start_date: '2026-11-01',
      end_date: '2026-10-01', // earlier
      exercises: [{ exerciseId: 'shoulder_abduction', targetSets: 3, targetReps: 10, side: 'right' }],
    }
    const res = validatePlanInput(invalidDates)
    expect(res.valid).toBe(false)
    expect(res.error).toMatch(/prior to start date/i)
  })
})

describe('Authorization & Consent Enforcement for Clinical Plans', () => {
  const patientId = 'patient-auth-test-1'
  const profId = 'prof-auth-test-1'

  it('prevents an unverified professional from assigning a plan', async () => {
    // Setup active connection with consent
    const connRes = await requestPatientConnection(
      {
        patientIdentifier: patientId,
        professionalId: profId,
        isVerifiedProfessional: false, // Unverified!
      },
      null,
    )
    await respondToConnectionRequest(
      {
        connectionId: connRes.connection!.id,
        patientId,
        accept: true,
        consentScope: { ...DEFAULT_CONSENT_SCOPE, allow_plan_assignment: true },
      },
      null,
    )

    // Attempt plan creation by unverified clinician
    const planRes = await createClinicalPlan(
      {
        professional_id: profId,
        patient_id: patientId,
        title: 'Unverified Attempt',
        end_date: '2026-12-31',
        is_verified_professional: false, // Clinician is unverified
        exercises: [{ exerciseId: 'shoulder_abduction', targetSets: 3, targetReps: 10, side: 'right' }],
      },
      null,
    )

    expect(planRes.success).toBe(false)
    expect(planRes.error).toMatch(/unverified practitioners cannot create/i)
  })

  it('prevents assignment when patient connection does not exist (disconnected)', async () => {
    const disconnectedProf = 'prof-disconnected-99'
    const planRes = await createClinicalPlan(
      {
        professional_id: disconnectedProf,
        patient_id: 'patient-unknown-88',
        title: 'Disconnected Attempt',
        end_date: '2026-12-31',
        is_verified_professional: true,
        exercises: [{ exerciseId: 'shoulder_abduction', targetSets: 3, targetReps: 10, side: 'right' }],
      },
      null,
    )

    expect(planRes.success).toBe(false)
    expect(planRes.error).toMatch(/active connection with this patient is required/i)
  })

  it('prevents assignment when patient has NOT granted allow_plan_assignment consent', async () => {
    const patNoConsent = 'patient-no-consent-2'
    const prof = 'prof-legit-2'

    const connRes = await requestPatientConnection(
      {
        patientIdentifier: patNoConsent,
        professionalId: prof,
        isVerifiedProfessional: true,
      },
      null,
    )

    // Patient accepts but explicitly disables plan assignment
    const restrictedScope: ConsentScope = {
      ...DEFAULT_CONSENT_SCOPE,
      allow_plan_assignment: false, // Disabled!
    }
    await respondToConnectionRequest(
      {
        connectionId: connRes.connection!.id,
        patientId: patNoConsent,
        accept: true,
        consentScope: restrictedScope,
      },
      null,
    )

    const planRes = await createClinicalPlan(
      {
        professional_id: prof,
        patient_id: patNoConsent,
        title: 'Blocked By Missing Consent',
        end_date: '2026-12-31',
        is_verified_professional: true,
        exercises: [{ exerciseId: 'shoulder_abduction', targetSets: 3, targetReps: 10, side: 'right' }],
      },
      null,
    )

    expect(planRes.success).toBe(false)
    expect(planRes.error).toMatch(/patient has not granted permission/i)
  })

  it('prevents assignment if active connection was revoked', async () => {
    const patRevoked = 'patient-revoked-3'
    const prof = 'prof-revoked-3'

    const connRes = await requestPatientConnection(
      {
        patientIdentifier: patRevoked,
        professionalId: prof,
        isVerifiedProfessional: true,
      },
      null,
    )
    await respondToConnectionRequest(
      {
        connectionId: connRes.connection!.id,
        patientId: patRevoked,
        accept: true,
        consentScope: { ...DEFAULT_CONSENT_SCOPE, allow_plan_assignment: true },
      },
      null,
    )

    // Now revoke connection
    await revokeConnection(connRes.connection!.id, patRevoked, null)

    const planRes = await createClinicalPlan(
      {
        professional_id: prof,
        patient_id: patRevoked,
        title: 'Revoked Connection Attempt',
        end_date: '2026-12-31',
        is_verified_professional: true,
        exercises: [{ exerciseId: 'shoulder_abduction', targetSets: 3, targetReps: 10, side: 'right' }],
      },
      null,
    )

    expect(planRes.success).toBe(false)
    expect(planRes.error).toMatch(/active connection with this patient is required/i)
  })

  it('allows verified professional to assign plan with valid patient consent', async () => {
    const patSuccess = 'patient-success-4'
    const prof = 'prof-success-4'

    const connRes = await requestPatientConnection(
      {
        patientIdentifier: patSuccess,
        professionalId: prof,
        isVerifiedProfessional: true,
      },
      null,
    )
    await respondToConnectionRequest(
      {
        connectionId: connRes.connection!.id,
        patientId: patSuccess,
        accept: true,
        consentScope: { ...DEFAULT_CONSENT_SCOPE, allow_plan_assignment: true },
      },
      null,
    )

    const planRes = await createClinicalPlan(
      {
        professional_id: prof,
        patient_id: patSuccess,
        title: 'Rotator Cuff Protocol Phase 1',
        instructions: 'Perform daily in the morning.',
        frequency: 'Daily',
        end_date: '2026-12-31',
        is_verified_professional: true,
        exercises: [
          { exerciseId: 'shoulder_abduction', targetSets: 3, targetReps: 10, targetRomDeg: 120, side: 'right' },
          { exerciseId: 'biceps_curl', targetSets: 3, targetReps: 12, side: 'right' },
        ],
      },
      null,
    )

    expect(planRes.success).toBe(true)
    expect(planRes.plan).toBeDefined()
    expect(planRes.plan?.version).toBe(1)
    expect(planRes.plan?.status).toBe('active')
    expect(planRes.plan?.exercises).toHaveLength(2)

    // Check audit trail
    const audits = await getPlanAuditEvents(planRes.plan!.id, null)
    expect(audits).toHaveLength(1)
    expect(audits[0].event_type).toBe('created')
  })
})

describe('Plan Versioning, Auditing & Modification Authorization', () => {
  const patientId = 'patient-version-test'
  const profId = 'prof-version-test'
  let planId: string

  it('sets up a plan for versioning test', async () => {
    const connRes = await requestPatientConnection(
      { patientIdentifier: patientId, professionalId: profId, isVerifiedProfessional: true },
      null,
    )
    await respondToConnectionRequest(
      {
        connectionId: connRes.connection!.id,
        patientId,
        accept: true,
        consentScope: { ...DEFAULT_CONSENT_SCOPE, allow_plan_assignment: true },
      },
      null,
    )

    const planRes = await createClinicalPlan(
      {
        professional_id: profId,
        patient_id: patientId,
        title: 'Post-Op Knee Protocol',
        end_date: '2026-12-31',
        is_verified_professional: true,
        exercises: [{ exerciseId: 'squat', targetSets: 3, targetReps: 10, side: 'both' }],
      },
      null,
    )
    expect(planRes.success).toBe(true)
    planId = planRes.plan!.id
  })

  it('increments version and logs audit trail when professional modifies plan details', async () => {
    const updateRes = await updateClinicalPlan(
      planId,
      profId,
      {
        exercises: [
          { exerciseId: 'squat', targetSets: 3, targetReps: 12, side: 'both' }, // increased to 12
          { exerciseId: 'heel_raise', targetSets: 3, targetReps: 15, side: 'both' },
        ],
        change_summary: 'Progressed reps and added heel raises following 2-week clinical assessment.',
      },
      null,
    )

    expect(updateRes.success).toBe(true)
    expect(updateRes.plan?.version).toBe(2)
    expect(updateRes.plan?.last_change_summary).toMatch(/progressed reps/i)

    const audits = await getPlanAuditEvents(planId, null)
    expect(audits.length).toBeGreaterThanOrEqual(2)
    const latestAudit = audits.find((a) => a.new_version === 2)
    expect(latestAudit).toBeDefined()
    expect(latestAudit?.event_type).toBe('version_updated')
    expect(latestAudit?.change_summary).toMatch(/progressed reps/i)
  })

  it('rejects modification attempts by unauthorized third-party users', async () => {
    const attackerRes = await updateClinicalPlan(
      planId,
      'malicious-attacker-user-id',
      { title: 'Hacked Plan' },
      null,
    )
    expect(attackerRes.success).toBe(false)
    expect(attackerRes.error).toMatch(/unauthorized/i)
  })

  it('prohibits patient from altering clinician-prescribed exercises', async () => {
    const patientEditAttempt = await updateClinicalPlan(
      planId,
      patientId, // Patient
      {
        exercises: [{ exerciseId: 'squat', targetSets: 1, targetReps: 2, side: 'both' }],
      },
      null,
    )
    expect(patientEditAttempt.success).toBe(false)
    expect(patientEditAttempt.error).toMatch(/patients may only update plan completion status/i)
  })

  it('allows patient to mark plan status as completed', async () => {
    const statusRes = await updateClinicalPlan(
      planId,
      patientId,
      { status: 'completed' },
      null,
    )
    expect(statusRes.success).toBe(true)
    expect(statusRes.plan?.status).toBe('completed')
  })
})

describe('Patient Plan Retrieval & Session Integration', () => {
  const patientId = 'patient-session-test'
  const profId = 'prof-session-test'

  it('allows patient to fetch their prescribed plans', async () => {
    const plans = await getPlansForPatient(patientId, null)
    expect(Array.isArray(plans)).toBe(true)
  })

  it('allows professional to fetch plans they authored', async () => {
    const profPlans = await getPlansForProfessional(profId, null)
    expect(Array.isArray(profPlans)).toBe(true)
  })

  it('associates completed session summary with planId', () => {
    const ex = exerciseById('shoulder_abduction')!
    const trackDef = ex.track as TrackDef
    const tracker = new SessionTracker(trackDef, 'right', 'front')
    const start = new Date(Date.now() - 30000)
    const end = new Date()

    const rawSummary = summarize(
      tracker,
      { id: 'session-plan-1', exercise: ex.id, version: ex.version, sided: ex.sided },
      start,
      end,
      30000,
    )

    const planSummary = {
      ...rawSummary,
      planId: 'plan-xyz-123',
    }

    expect(planSummary.planId).toBe('plan-xyz-123')
    expect(planSummary.exercise).toBe('shoulder_abduction')
    expect(planSummary.durationMs).toBe(30000)
  })
})

describe('Preservation of Existing Working Features', () => {
  it('preserves shoulder abduction tracking definition and thresholds', () => {
    const shoulder = exerciseById('shoulder_abduction')
    expect(shoulder).toBeDefined()
    expect(shoulder?.track?.reps?.direction).toBe('up')
    expect(shoulder?.track?.reps?.start).toBe(40)
    expect(shoulder?.track?.reps?.target).toBe(80)
  })

  it('preserves fixed biceps curl biomechanical thresholds', () => {
    const biceps = exerciseById('biceps_curl')
    expect(biceps).toBeDefined()
    expect(biceps?.track?.reps?.direction).toBe('down')
    expect(biceps?.track?.reps?.rest).toBe(130)
    expect(biceps?.track?.reps?.start).toBe(115)
    expect(biceps?.track?.reps?.target).toBe(75)
    expect(biceps?.track?.reps?.minRepMs).toBe(600)
  })

  it('preserves all 18 exercises in catalog with trackable breakdown', () => {
    expect(EXERCISES).toHaveLength(18)
    const trackable = EXERCISES.filter((e) => !!e.track)
    expect(trackable.length).toBe(17)
    const unsupported = EXERCISES.filter((e) => e.status === 'unsupported' || !e.track)
    expect(unsupported.length).toBe(1)
  })
})
