import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase, type SessionRow } from './supabase'

export type CredentialStatus = 'pending' | 'approved' | 'rejected'

export type ProfessionalCredential = {
  id: string
  professional_id: string
  full_name: string
  title: string
  license_number: string
  license_jurisdiction: string
  organization: string | null
  document_reference: string | null
  status: CredentialStatus
  rejection_reason: string | null
  submitted_at: string
  reviewed_at: string | null
}

export type CredentialSubmission = {
  professional_id: string
  full_name: string
  title: string
  license_number: string
  license_jurisdiction: string
  organization?: string
  document_reference?: string
}

export type ConsentScope = {
  share_recent_sessions: boolean // Sessions within last 30 days
  share_rom_metrics: boolean // Calculated ROM angles and rep metrics
  share_all_history: boolean // Full historical archive (default FALSE)
  allow_plan_assignment: boolean // Clinician can prescribe rehabilitation routines
}

export const DEFAULT_CONSENT_SCOPE: ConsentScope = {
  share_recent_sessions: true,
  share_rom_metrics: true,
  share_all_history: false,
  allow_plan_assignment: true,
}

export type ConnectionStatus = 'pending' | 'active' | 'rejected' | 'revoked'

export type PatientConnection = {
  id: string
  patient_id: string
  professional_id: string
  initiated_by: 'professional' | 'patient'
  status: ConnectionStatus
  consent_scope: ConsentScope
  patient_notes: string | null
  professional_notes: string | null
  requested_at: string
  responded_at: string | null
  revoked_at: string | null
  // UI Display helpers:
  patient_name?: string
  patient_email?: string
  professional_name?: string
  professional_title?: string
  professional_organization?: string
  is_verified_professional?: boolean
}

// Local mock store keys for offline resilience & testing
const STORAGE_CREDENTIALS_KEY = 'kinectiq_credentials_v1'
const STORAGE_CONNECTIONS_KEY = 'kinectiq_connections_v1'

let memoryCredentials: Record<string, ProfessionalCredential> = {}
let memoryConnections: PatientConnection[] = []

function getLocalCredentials(): Record<string, ProfessionalCredential> {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_CREDENTIALS_KEY)
      if (raw) return JSON.parse(raw)
    }
  } catch {
    // fall through to memory
  }
  return memoryCredentials
}

function saveLocalCredentials(data: Record<string, ProfessionalCredential>) {
  memoryCredentials = { ...data }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_CREDENTIALS_KEY, JSON.stringify(data))
    }
  } catch {
    // Ignore localStorage write failures
  }
}

function getLocalConnections(): PatientConnection[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_CONNECTIONS_KEY)
      if (raw) return JSON.parse(raw)
    }
  } catch {
    // fall through to memory
  }
  return memoryConnections
}

function saveLocalConnections(list: PatientConnection[]) {
  memoryConnections = [...list]
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_CONNECTIONS_KEY, JSON.stringify(list))
    }
  } catch {
    // Ignore localStorage write failures
  }
}

/**
 * Submits professional credentials for verification review.
 * Regular users cannot self-approve; status defaults to 'pending'.
 */
export async function submitProfessionalCredentials(
  submission: CredentialSubmission,
  client: SupabaseClient | null = supabase,
): Promise<{ success: boolean; credential?: ProfessionalCredential; error?: string }> {
  if (!submission.full_name.trim() || !submission.license_number.trim() || !submission.license_jurisdiction.trim()) {
    return { success: false, error: 'Full name, license number, and jurisdiction are required.' }
  }

  const credentialRecord: ProfessionalCredential = {
    id: `cred-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    professional_id: submission.professional_id,
    full_name: submission.full_name.trim(),
    title: submission.title.trim() || 'Physiotherapist',
    license_number: submission.license_number.trim(),
    license_jurisdiction: submission.license_jurisdiction.trim(),
    organization: submission.organization?.trim() || null,
    document_reference: submission.document_reference?.trim() || null,
    status: 'pending',
    rejection_reason: null,
    submitted_at: new Date().toISOString(),
    reviewed_at: null,
  }

  if (client) {
    try {
      const { data, error } = await client
        .from('professional_credentials')
        .insert({
          professional_id: submission.professional_id,
          full_name: submission.full_name.trim(),
          title: submission.title.trim() || 'Physiotherapist',
          license_number: submission.license_number.trim(),
          license_jurisdiction: submission.license_jurisdiction.trim(),
          organization: submission.organization?.trim() || null,
          document_reference: submission.document_reference?.trim() || null,
          status: 'pending',
        })
        .select()
        .single()

      if (!error && data) {
        // Also sync local cache
        const local = getLocalCredentials()
        local[submission.professional_id] = data as ProfessionalCredential
        saveLocalCredentials(local)
        return { success: true, credential: data as ProfessionalCredential }
      }
    } catch {
      // Fallback to local storage if table is not yet accessible
    }
  }

  // Local fallback storage
  const local = getLocalCredentials()
  local[submission.professional_id] = credentialRecord
  saveLocalCredentials(local)
  return { success: true, credential: credentialRecord }
}

/**
 * Retrieves the professional's credential record.
 */
export async function getProfessionalCredentials(
  professionalId: string,
  client: SupabaseClient | null = supabase,
): Promise<ProfessionalCredential | null> {
  if (client) {
    try {
      const { data, error } = await client
        .from('professional_credentials')
        .select('*')
        .eq('professional_id', professionalId)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!error && data) {
        return data as ProfessionalCredential
      }
    } catch {
      // Fallback
    }
  }

  const local = getLocalCredentials()
  return local[professionalId] ?? null
}

/**
 * Initiates a connection request from a professional to a patient.
 * Always creates the request in 'pending' status — the patient MUST explicitly accept.
 */
export async function requestPatientConnection(
  params: {
    patientIdentifier: string // ID or Email
    professionalId: string
    professionalNotes?: string
    professionalName?: string
    professionalTitle?: string
    isVerifiedProfessional?: boolean
  },
  client: SupabaseClient | null = supabase,
): Promise<{ success: boolean; connection?: PatientConnection; error?: string }> {
  const patientId = params.patientIdentifier.trim()
  if (!patientId) {
    return { success: false, error: 'Patient email or account ID is required.' }
  }

  if (patientId === params.professionalId) {
    return { success: false, error: 'You cannot connect to your own account.' }
  }

  const newConn: PatientConnection = {
    id: `conn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    patient_id: patientId,
    professional_id: params.professionalId,
    initiated_by: 'professional',
    status: 'pending',
    consent_scope: { ...DEFAULT_CONSENT_SCOPE },
    patient_notes: null,
    professional_notes: params.professionalNotes?.trim() || null,
    requested_at: new Date().toISOString(),
    responded_at: null,
    revoked_at: null,
    patient_name: patientId.includes('@') ? patientId.split('@')[0] : `Patient ${patientId.slice(0, 8)}`,
    patient_email: patientId.includes('@') ? patientId : undefined,
    professional_name: params.professionalName || 'Practitioner',
    professional_title: params.professionalTitle || 'Physical Therapist',
    is_verified_professional: params.isVerifiedProfessional ?? false,
  }

  if (client) {
    try {
      const { data, error } = await client
        .from('patient_connections')
        .insert({
          patient_id: patientId,
          professional_id: params.professionalId,
          initiated_by: 'professional',
          status: 'pending',
          consent_scope: newConn.consent_scope,
          professional_notes: newConn.professional_notes,
        })
        .select()
        .single()

      if (!error && data) {
        const full = { ...newConn, ...data }
        const conns = getLocalConnections().filter((c) => c.id !== full.id)
        conns.push(full)
        saveLocalConnections(conns)
        return { success: true, connection: full }
      }
      if (error) {
        return { success: false, error: error.message }
      }
    } catch {
      // Fallback to local
    }
  }

  const conns = getLocalConnections().filter(
    (c) => !(c.patient_id === patientId && c.professional_id === params.professionalId && c.status !== 'revoked'),
  )
  conns.push(newConn)
  saveLocalConnections(conns)
  return { success: true, connection: newConn }
}

/**
 * Gets all connections where caller is patient.
 */
export async function getPatientConnections(
  patientId: string,
  client: SupabaseClient | null = supabase,
): Promise<PatientConnection[]> {
  if (client) {
    try {
      const { data, error } = await client
        .from('patient_connections')
        .select('*')
        .eq('patient_id', patientId)
        .order('requested_at', { ascending: false })

      if (!error && data) {
        return data as PatientConnection[]
      }
    } catch {
      // Fallback
    }
  }

  const local = getLocalConnections()
  return local.filter(
    (c) => c.patient_id === patientId || (c.patient_email && patientId.toLowerCase() === c.patient_email.toLowerCase()),
  )
}

/**
 * Gets all connections where caller is professional.
 */
export async function getProfessionalConnections(
  professionalId: string,
  client: SupabaseClient | null = supabase,
): Promise<PatientConnection[]> {
  if (client) {
    try {
      const { data, error } = await client
        .from('patient_connections')
        .select('*')
        .eq('professional_id', professionalId)
        .order('requested_at', { ascending: false })

      if (!error && data) {
        return data as PatientConnection[]
      }
    } catch {
      // Fallback
    }
  }

  const local = getLocalConnections()
  return local.filter((c) => c.professional_id === professionalId)
}

/**
 * Explicit patient response to connection request.
 * Only the patient can accept (setting 'active') or reject ('rejected').
 * Patient explicitly sets or customizes consent scope upon accepting.
 */
export async function respondToConnectionRequest(
  params: {
    connectionId: string
    patientId: string
    accept: boolean
    consentScope?: ConsentScope
  },
  client: SupabaseClient | null = supabase,
): Promise<{ success: boolean; connection?: PatientConnection; error?: string }> {
  const newStatus: ConnectionStatus = params.accept ? 'active' : 'rejected'
  const finalScope: ConsentScope = params.consentScope ?? { ...DEFAULT_CONSENT_SCOPE }
  const respondedAt = new Date().toISOString()

  if (client) {
    try {
      const { data, error } = await client
        .from('patient_connections')
        .update({
          status: newStatus,
          consent_scope: finalScope,
          responded_at: respondedAt,
        })
        .eq('id', params.connectionId)
        .eq('patient_id', params.patientId)
        .select()
        .single()

      if (!error && data) {
        const local = getLocalConnections().map((c) => (c.id === params.connectionId ? { ...c, ...data } : c))
        saveLocalConnections(local)
        return { success: true, connection: data as PatientConnection }
      }
      if (error) {
        return { success: false, error: error.message }
      }
    } catch {
      // Fallback
    }
  }

  const local = getLocalConnections()
  const found = local.find((c) => c.id === params.connectionId)
  if (!found) return { success: false, error: 'Connection request not found.' }

  found.status = newStatus
  found.consent_scope = finalScope
  found.responded_at = respondedAt
  saveLocalConnections(local)
  return { success: true, connection: found }
}

/**
 * Revokes an existing connection immediately. Either patient or clinician can revoke.
 * Once revoked, data access is immediately severed.
 */
export async function revokeConnection(
  connectionId: string,
  actorId: string,
  client: SupabaseClient | null = supabase,
): Promise<{ success: boolean; connection?: PatientConnection; error?: string }> {
  const revokedAt = new Date().toISOString()

  if (client) {
    try {
      const { data, error } = await client
        .from('patient_connections')
        .update({
          status: 'revoked',
          revoked_at: revokedAt,
        })
        .eq('id', connectionId)
        .select()
        .single()

      if (!error && data) {
        const local = getLocalConnections().map((c) => (c.id === connectionId ? { ...c, ...data } : c))
        saveLocalConnections(local)
        return { success: true, connection: data as PatientConnection }
      }
      if (error) {
        return { success: false, error: error.message }
      }
    } catch {
      // Fallback
    }
  }

  const local = getLocalConnections()
  const found = local.find((c) => c.id === connectionId)
  if (!found) return { success: false, error: 'Connection not found.' }

  if (found.patient_id !== actorId && found.professional_id !== actorId) {
    return { success: false, error: 'Unauthorized to revoke this connection.' }
  }

  found.status = 'revoked'
  found.revoked_at = revokedAt
  saveLocalConnections(local)
  return { success: true, connection: found }
}

/**
 * Updates explicit patient consent scope for an active connection.
 * Only the patient can modify their consent scope.
 */
export async function updateConsentScope(
  connectionId: string,
  patientId: string,
  scopeUpdates: Partial<ConsentScope>,
  client: SupabaseClient | null = supabase,
): Promise<{ success: boolean; connection?: PatientConnection; error?: string }> {
  const local = getLocalConnections()
  const conn = local.find((c) => c.id === connectionId)
  const currentScope = conn?.consent_scope ?? { ...DEFAULT_CONSENT_SCOPE }
  const updatedScope: ConsentScope = { ...currentScope, ...scopeUpdates }

  if (client) {
    try {
      const { data, error } = await client
        .from('patient_connections')
        .update({
          consent_scope: updatedScope,
        })
        .eq('id', connectionId)
        .eq('patient_id', patientId)
        .select()
        .single()

      if (!error && data) {
        const updatedLocal = local.map((c) => (c.id === connectionId ? { ...c, ...data } : c))
        saveLocalConnections(updatedLocal)
        return { success: true, connection: data as PatientConnection }
      }
      if (error) {
        return { success: false, error: error.message }
      }
    } catch {
      // Fallback
    }
  }

  if (!conn) return { success: false, error: 'Connection not found.' }
  if (conn.patient_id !== patientId) return { success: false, error: 'Only the patient can modify consent scope.' }

  conn.consent_scope = updatedScope
  saveLocalConnections(local)
  return { success: true, connection: conn }
}

/**
 * Filters and validates patient sessions accessible to a professional.
 * Unverified professionals receive 0 sessions.
 * Revoked or pending connections receive 0 sessions.
 * Historical sessions beyond 30 days are omitted unless explicit `share_all_history` was granted.
 */
export function filterSessionsByConsent(
  sessions: SessionRow[],
  connection: PatientConnection,
  isVerifiedProfessional: boolean,
): SessionRow[] {
  // Requirement: Unverified professionals must not receive privileged patient-data access
  if (!isVerifiedProfessional) return []

  // Requirement: Patients must explicitly accept connection requests
  if (connection.status !== 'active') return []

  const scope = connection.consent_scope
  const thirtyDaysAgoMs = Date.now() - 30 * 24 * 60 * 60 * 1000

  return sessions.filter((s) => {
    const sessionTime = new Date(s.started_at).getTime()
    const isRecent = sessionTime >= thirtyDaysAgoMs

    if (scope.share_all_history) {
      return true
    }

    if (scope.share_recent_sessions && isRecent) {
      return true
    }

    return false
  })
}
