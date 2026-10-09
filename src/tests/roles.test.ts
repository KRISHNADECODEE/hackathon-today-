import { describe, expect, it } from 'vitest'
import type { ProfileRow, SessionRow, UserRole } from '../lib/supabase'
import {
  DEFAULT_CONSENT_SCOPE,
  filterSessionsByConsent,
  getProfessionalCredentials,
  requestPatientConnection,
  respondToConnectionRequest,
  revokeConnection,
  submitProfessionalCredentials,
  updateConsentScope,
  type ConsentScope,
  type PatientConnection,
} from '../lib/connections'

describe('Role and Profile Types', () => {
  it('validates role values conform to the tripartite model', () => {
    const validRoles: UserRole[] = ['patient', 'professional', 'wellness']
    expect(validRoles).toHaveLength(3)
    expect(validRoles).toContain('patient')
    expect(validRoles).toContain('professional')
    expect(validRoles).toContain('wellness')
  })

  it('correctly models professional verification state', () => {
    const unverifiedProfile: ProfileRow = {
      id: 'test-user-1',
      display_name: 'Dr. Smith',
      role: 'professional',
      is_verified_professional: false,
    }
    expect(unverifiedProfile.is_verified_professional).toBe(false)

    const verifiedProfile: ProfileRow = {
      id: 'test-user-2',
      display_name: 'Dr. Jones',
      role: 'professional',
      is_verified_professional: true,
    }
    expect(verifiedProfile.is_verified_professional).toBe(true)
  })

  it('defaults non-clinicians to is_verified_professional = false', () => {
    const wellnessProfile: ProfileRow = {
      id: 'test-user-3',
      display_name: 'Alex',
      role: 'wellness',
      is_verified_professional: false,
    }
    expect(wellnessProfile.role).toBe('wellness')
    expect(wellnessProfile.is_verified_professional).toBe(false)
  })
})

describe('Professional Credential Submission & Verification Status', () => {
  it('submits credentials with pending status by default (preventing self-approval)', async () => {
    const res = await submitProfessionalCredentials(
      {
        professional_id: 'prof-test-1',
        full_name: 'Dr. Sarah Jenkins',
        title: 'Physical Therapist',
        license_number: 'PT-123456',
        license_jurisdiction: 'California Board of Physical Therapy',
        organization: 'Bay Area Rehab Clinic',
      },
      null, // uses local storage fallback
    )

    expect(res.success).toBe(true)
    expect(res.credential).toBeDefined()
    expect(res.credential?.status).toBe('pending')
    expect(res.credential?.reviewed_at).toBeNull()

    // Verify retrieving credential
    const fetched = await getProfessionalCredentials('prof-test-1', null)
    expect(fetched?.full_name).toBe('Dr. Sarah Jenkins')
    expect(fetched?.status).toBe('pending')
  })

  it('rejects credential submission with missing required license information', async () => {
    const res = await submitProfessionalCredentials(
      {
        professional_id: 'prof-test-2',
        full_name: '',
        title: 'Physiotherapist',
        license_number: '',
        license_jurisdiction: '',
      },
      null,
    )

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/required/i)
  })
})

describe('Patient Connection Requests & Scoped Consent', () => {
  const patientId = 'patient-test-abc'
  const professionalId = 'prof-test-xyz'

  it('creates connection request in pending status awaiting patient consent', async () => {
    const res = await requestPatientConnection(
      {
        patientIdentifier: patientId,
        professionalId,
        professionalNotes: 'Post-op rehabilitation monitoring',
        professionalName: 'Dr. Evans',
      },
      null,
    )

    expect(res.success).toBe(true)
    expect(res.connection).toBeDefined()
    expect(res.connection?.status).toBe('pending')
    expect(res.connection?.responded_at).toBeNull()

    // Default consent scope must NOT expose all history
    expect(res.connection?.consent_scope.share_all_history).toBe(false)
    expect(res.connection?.consent_scope.share_recent_sessions).toBe(true)
    expect(res.connection?.consent_scope.share_rom_metrics).toBe(true)
  })

  it('prohibits self-connections (user connecting to themselves)', async () => {
    const res = await requestPatientConnection(
      {
        patientIdentifier: 'same-user-id',
        professionalId: 'same-user-id',
      },
      null,
    )

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/cannot connect to your own/i)
  })

  it('allows patient to explicitly accept connection and customize consent scope', async () => {
    const init = await requestPatientConnection(
      {
        patientIdentifier: 'patient-custom',
        professionalId: 'prof-custom',
      },
      null,
    )
    const connId = init.connection!.id

    const customScope: ConsentScope = {
      share_recent_sessions: true,
      share_rom_metrics: false, // patient opts out of raw metrics
      share_all_history: false, // default remains restricted
      allow_plan_assignment: true,
    }

    const res = await respondToConnectionRequest(
      {
        connectionId: connId,
        patientId: 'patient-custom',
        accept: true,
        consentScope: customScope,
      },
      null,
    )

    expect(res.success).toBe(true)
    expect(res.connection?.status).toBe('active')
    expect(res.connection?.responded_at).not.toBeNull()
    expect(res.connection?.consent_scope.share_rom_metrics).toBe(false)
  })

  it('allows patient to reject a connection request', async () => {
    const init = await requestPatientConnection(
      {
        patientIdentifier: 'patient-decline',
        professionalId: 'prof-decline',
      },
      null,
    )
    const connId = init.connection!.id

    const res = await respondToConnectionRequest(
      {
        connectionId: connId,
        patientId: 'patient-decline',
        accept: false,
      },
      null,
    )

    expect(res.success).toBe(true)
    expect(res.connection?.status).toBe('rejected')
  })

  it('supports updating consent scope while connection is active', async () => {
    const init = await requestPatientConnection(
      {
        patientIdentifier: 'patient-scope-update',
        professionalId: 'prof-scope-update',
      },
      null,
    )
    const connId = init.connection!.id

    await respondToConnectionRequest(
      {
        connectionId: connId,
        patientId: 'patient-scope-update',
        accept: true,
      },
      null,
    )

    const updateRes = await updateConsentScope(
      connId,
      'patient-scope-update',
      { share_all_history: true },
      null,
    )

    expect(updateRes.success).toBe(true)
    expect(updateRes.connection?.consent_scope.share_all_history).toBe(true)
  })

  it('supports immediate revocation of connection by patient', async () => {
    const init = await requestPatientConnection(
      {
        patientIdentifier: 'patient-revoke',
        professionalId: 'prof-revoke',
      },
      null,
    )
    const connId = init.connection!.id

    await respondToConnectionRequest(
      {
        connectionId: connId,
        patientId: 'patient-revoke',
        accept: true,
      },
      null,
    )

    const revokeRes = await revokeConnection(connId, 'patient-revoke', null)
    expect(revokeRes.success).toBe(true)
    expect(revokeRes.connection?.status).toBe('revoked')
    expect(revokeRes.connection?.revoked_at).not.toBeNull()
  })
})

describe('Unauthorized Access Prevention & Scoped Data Filtering', () => {
  const dummyRecentSession: SessionRow = {
    id: 'session-recent',
    user_id: 'patient-1',
    exercise: 'shoulder_abduction',
    exercise_version: 1,
    mode: 'reps',
    metric_label: 'Shoulder elevation',
    metric_unit: 'deg',
    direction: 'up',
    side: 'right',
    started_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    ended_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 60000).toISOString(),
    duration_ms: 60000,
    valid_reps: 10,
    incomplete_reps: 0,
    peak_rom_deg: 145,
    mean_peak_rom_deg: 140,
    tracking_quality: 0.95,
    torso_calibrated: true,
    evidence: 'complete',
    summary: {},
    saved_at: new Date().toISOString(),
  }

  const dummyOldSession: SessionRow = {
    id: 'session-old',
    user_id: 'patient-1',
    exercise: 'shoulder_abduction',
    exercise_version: 1,
    mode: 'reps',
    metric_label: 'Shoulder elevation',
    metric_unit: 'deg',
    direction: 'up',
    side: 'right',
    started_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days ago
    ended_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000 + 60000).toISOString(),
    duration_ms: 60000,
    valid_reps: 8,
    incomplete_reps: 0,
    peak_rom_deg: 130,
    mean_peak_rom_deg: 125,
    tracking_quality: 0.9,
    torso_calibrated: true,
    evidence: 'complete',
    summary: {},
    saved_at: new Date().toISOString(),
  }

  const allSessions = [dummyRecentSession, dummyOldSession]

  const activeConnection: PatientConnection = {
    id: 'conn-active',
    patient_id: 'patient-1',
    professional_id: 'prof-1',
    initiated_by: 'professional',
    status: 'active',
    consent_scope: { ...DEFAULT_CONSENT_SCOPE }, // share_recent: true, share_all_history: false
    patient_notes: null,
    professional_notes: null,
    requested_at: new Date().toISOString(),
    responded_at: new Date().toISOString(),
    revoked_at: null,
  }

  it('denies all patient sessions if clinician is UNVERIFIED (even with active connection)', () => {
    // Unverified clinician trying to access patient sessions
    const visible = filterSessionsByConsent(allSessions, activeConnection, false)
    expect(visible).toHaveLength(0)
  })

  it('denies all patient sessions if connection is pending or revoked', () => {
    const pendingConn: PatientConnection = { ...activeConnection, status: 'pending' }
    const revokedConn: PatientConnection = { ...activeConnection, status: 'revoked' }

    expect(filterSessionsByConsent(allSessions, pendingConn, true)).toHaveLength(0)
    expect(filterSessionsByConsent(allSessions, revokedConn, true)).toHaveLength(0)
  })

  it('strictly bounds data access to recent sessions when share_all_history is false', () => {
    // Verified professional, default consent (recent only)
    const visible = filterSessionsByConsent(allSessions, activeConnection, true)
    expect(visible).toHaveLength(1)
    expect(visible[0].id).toBe('session-recent')
  })

  it('exposes full historical archive only when patient explicitly granted share_all_history', () => {
    const fullScopeConn: PatientConnection = {
      ...activeConnection,
      consent_scope: { ...DEFAULT_CONSENT_SCOPE, share_all_history: true },
    }

    const visible = filterSessionsByConsent(allSessions, fullScopeConn, true)
    expect(visible).toHaveLength(2)
  })

  it('returns zero sessions if patient disabled recent session sharing', () => {
    const noRecentConn: PatientConnection = {
      ...activeConnection,
      consent_scope: { ...DEFAULT_CONSENT_SCOPE, share_recent_sessions: false, share_all_history: false },
    }

    const visible = filterSessionsByConsent(allSessions, noRecentConn, true)
    expect(visible).toHaveLength(0)
  })

  it('immediately severs data access when connection is revoked', () => {
    const revokedConn: PatientConnection = {
      ...activeConnection,
      status: 'revoked',
      revoked_at: new Date().toISOString(),
    }
    const visible = filterSessionsByConsent(allSessions, revokedConn, true)
    expect(visible).toHaveLength(0)
  })
})

describe('Security Configuration & Non-Disclosure Verification', () => {
  it('verifies default consent scope never defaults to share_all_history: true', () => {
    expect(DEFAULT_CONSENT_SCOPE.share_all_history).toBe(false)
    expect(DEFAULT_CONSENT_SCOPE.share_recent_sessions).toBe(true)
    expect(DEFAULT_CONSENT_SCOPE.share_rom_metrics).toBe(true)
  })

  it('ensures unverified professionals are explicitly identified on incoming requests', async () => {
    const unverifiedReq = await requestPatientConnection(
      {
        patientIdentifier: 'patient-check-flag',
        professionalId: 'prof-unverified-1',
        isVerifiedProfessional: false,
      },
      null,
    )

    expect(unverifiedReq.success).toBe(true)
    expect(unverifiedReq.connection?.is_verified_professional).toBe(false)
  })

  it('rejects consent scope updates from unauthorized non-owner callers', async () => {
    const req = await requestPatientConnection(
      {
        patientIdentifier: 'patient-legit-owner',
        professionalId: 'prof-attacker',
      },
      null,
    )
    const connId = req.connection!.id

    const attackerAttempt = await updateConsentScope(
      connId,
      'different-attacker-id', // Not the patient
      { share_all_history: true },
      null,
    )

    expect(attackerAttempt.success).toBe(false)
    expect(attackerAttempt.error).toMatch(/only the patient can modify consent scope/i)
  })

  it('ensures client configuration never exposes service_role or admin secret keys', () => {
    const envKeys = Object.keys(import.meta.env)
    for (const k of envKeys) {
      expect(k.toLowerCase()).not.toContain('service_role')
      expect(k.toLowerCase()).not.toContain('supabase_service_key')
      expect(k.toLowerCase()).not.toContain('master_key')
    }

    // Verify publishable key prefix convention
    const pubKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
    if (pubKey) {
      expect(pubKey.toLowerCase()).not.toContain('service_role')
    }
  })
})

