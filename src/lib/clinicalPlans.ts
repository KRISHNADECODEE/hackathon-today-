import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { exerciseById } from './exercises'
import { getPatientConnections } from './connections'

export type PlanStatus = 'active' | 'completed' | 'paused' | 'archived'

export type PlanExerciseItem = {
  exerciseId: string
  targetSets: number
  targetReps?: number
  targetHoldDurationS?: number
  targetRomDeg?: number
  side: 'left' | 'right' | 'both'
  notes?: string
}

export type ClinicalPlan = {
  id: string
  professional_id: string
  patient_id: string
  connection_id?: string | null
  title: string
  instructions: string | null
  frequency: string
  status: PlanStatus
  version: number
  start_date: string
  end_date: string
  exercises: PlanExerciseItem[]
  last_change_summary: string | null
  created_at: string
  updated_at: string
  professional_name?: string
  is_verified_professional?: boolean
}

export type PlanAuditEvent = {
  id: string
  plan_id: string
  actor_id: string
  event_type: 'created' | 'version_updated' | 'status_changed' | 'consent_revoked'
  change_summary: string
  previous_version: number | null
  new_version: number | null
  metadata: Record<string, unknown>
  created_at: string
}

export type CreatePlanInput = {
  professional_id: string
  patient_id: string
  connection_id?: string
  title: string
  instructions?: string
  frequency?: string
  start_date?: string
  end_date: string
  exercises: PlanExerciseItem[]
  professional_name?: string
  is_verified_professional?: boolean
}

export type UpdatePlanInput = {
  title?: string
  instructions?: string
  frequency?: string
  status?: PlanStatus
  end_date?: string
  exercises?: PlanExerciseItem[]
  change_summary?: string
}

// Local mock store keys for offline resilience & testing
const STORAGE_PLANS_KEY = 'kinectiq_clinical_plans_v1'
const STORAGE_PLAN_AUDIT_KEY = 'kinectiq_plan_audits_v1'

let memoryPlans: ClinicalPlan[] = []
let memoryAudits: PlanAuditEvent[] = []

function getLocalPlans(): ClinicalPlan[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_PLANS_KEY)
      if (raw) return JSON.parse(raw)
    }
  } catch {
    // fall through to memory
  }
  return memoryPlans
}

function saveLocalPlans(list: ClinicalPlan[]) {
  memoryPlans = [...list]
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_PLANS_KEY, JSON.stringify(list))
    }
  } catch {
    // ignore
  }
}

function getLocalAudits(): PlanAuditEvent[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_PLAN_AUDIT_KEY)
      if (raw) return JSON.parse(raw)
    }
  } catch {
    // fall through to memory
  }
  return memoryAudits
}

function saveLocalAudits(list: PlanAuditEvent[]) {
  memoryAudits = [...list]
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_PLAN_AUDIT_KEY, JSON.stringify(list))
    }
  } catch {
    // ignore
  }
}

/**
 * Validates clinical plan inputs:
 * - Title length
 * - Existing supported exercises only
 * - Set and repetition bounds
 * - Valid chronological dates
 */
export function validatePlanInput(input: CreatePlanInput): { valid: boolean; error?: string } {
  const trimmedTitle = input.title?.trim()
  if (!trimmedTitle || trimmedTitle.length < 3) {
    return { valid: false, error: 'Plan title must be at least 3 characters.' }
  }

  if (!input.exercises || input.exercises.length === 0) {
    return { valid: false, error: 'At least one exercise must be prescribed in the plan.' }
  }

  for (const item of input.exercises) {
    const ex = exerciseById(item.exerciseId)
    if (!ex) {
      return { valid: false, error: `Exercise with ID "${item.exerciseId}" does not exist in the application.` }
    }
    if (ex.status === 'unsupported' || !ex.track) {
      return { valid: false, error: `Exercise "${ex.name}" cannot be reliably tracked with a single webcam and cannot be assigned.` }
    }
    if (item.targetSets < 1 || item.targetSets > 10) {
      return { valid: false, error: `Target sets for "${ex.name}" must be between 1 and 10.` }
    }
    if (ex.track.mode === 'hold') {
      const holdS = item.targetHoldDurationS ?? 15
      if (holdS < 3 || holdS > 300) {
        return { valid: false, error: `Target hold duration for "${ex.name}" must be between 3 and 300 seconds.` }
      }
    } else {
      const reps = item.targetReps ?? 10
      if (reps < 1 || reps > 100) {
        return { valid: false, error: `Target repetitions for "${ex.name}" must be between 1 and 100.` }
      }
    }
    if (item.targetRomDeg != null && (item.targetRomDeg < 10 || item.targetRomDeg > 180)) {
      return { valid: false, error: `Target ROM angle for "${ex.name}" must be between 10° and 180°.` }
    }
  }

  const startDate = input.start_date || new Date().toISOString().split('T')[0]
  if (!input.end_date) {
    return { valid: false, error: 'Plan end date is required.' }
  }
  if (new Date(input.end_date) < new Date(startDate)) {
    return { valid: false, error: 'End date cannot be prior to start date.' }
  }

  return { valid: true }
}

/**
 * Creates a clinical exercise plan for an actively connected patient.
 * Enforces:
 * 1. Clinician is verified.
 * 2. Active patient connection exists.
 * 3. Patient has granted `allow_plan_assignment` consent.
 * 4. Input validation against supported exercises.
 */
export async function createClinicalPlan(
  input: CreatePlanInput,
  client: SupabaseClient | null = supabase,
): Promise<{ success: boolean; plan?: ClinicalPlan; error?: string }> {
  const validation = validatePlanInput(input)
  if (!validation.valid) {
    return { success: false, error: validation.error }
  }

  // Authorization check: Verification
  if (input.is_verified_professional === false) {
    return { success: false, error: 'Unverified practitioners cannot create or assign clinical exercise plans.' }
  }

  // Authorization check: Connection & Patient Consent
  const connections = await getPatientConnections(input.patient_id, client)
  const connection = connections.find(
    (c) => c.professional_id === input.professional_id && c.status === 'active',
  )

  if (!connection) {
    return {
      success: false,
      error: 'An active connection with this patient is required to assign an exercise plan.',
    }
  }

  if (!connection.consent_scope.allow_plan_assignment) {
    return {
      success: false,
      error: 'Patient has not granted permission for clinical plan assignment.',
    }
  }

  const now = new Date().toISOString()
  const startDate = input.start_date || now.split('T')[0]

  const newPlan: ClinicalPlan = {
    id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    professional_id: input.professional_id,
    patient_id: input.patient_id,
    connection_id: input.connection_id || connection.id,
    title: input.title.trim(),
    instructions: input.instructions?.trim() || null,
    frequency: input.frequency?.trim() || 'Daily',
    status: 'active',
    version: 1,
    start_date: startDate,
    end_date: input.end_date,
    exercises: input.exercises,
    last_change_summary: 'Initial plan assignment',
    created_at: now,
    updated_at: now,
    professional_name: input.professional_name || 'Practitioner',
    is_verified_professional: input.is_verified_professional ?? true,
  }

  if (client) {
    try {
      const { data, error } = await client
        .from('clinical_plans')
        .insert({
          professional_id: input.professional_id,
          patient_id: input.patient_id,
          connection_id: newPlan.connection_id,
          title: newPlan.title,
          instructions: newPlan.instructions,
          frequency: newPlan.frequency,
          status: 'active',
          version: 1,
          start_date: newPlan.start_date,
          end_date: newPlan.end_date,
          exercises: newPlan.exercises,
          last_change_summary: newPlan.last_change_summary,
        })
        .select()
        .single()

      if (!error && data) {
        const full = { ...newPlan, ...data }
        const plans = getLocalPlans().filter((p) => p.id !== full.id)
        plans.push(full)
        saveLocalPlans(plans)
        return { success: true, plan: full }
      }
      if (error) {
        return { success: false, error: error.message }
      }
    } catch {
      // Fallback to local store
    }
  }

  // Local fallback
  const plans = getLocalPlans().filter((p) => p.id !== newPlan.id)
  plans.push(newPlan)
  saveLocalPlans(plans)

  // Log audit event
  const audits = getLocalAudits()
  audits.push({
    id: `audit-${Date.now()}`,
    plan_id: newPlan.id,
    actor_id: input.professional_id,
    event_type: 'created',
    change_summary: 'Initial plan assignment',
    previous_version: null,
    new_version: 1,
    metadata: { title: newPlan.title, exercisesCount: newPlan.exercises.length },
    created_at: now,
  })
  saveLocalAudits(audits)

  return { success: true, plan: newPlan }
}

/**
 * Updates an existing clinical plan.
 * If exercises, title, or instructions change, the version is incremented and an audit event is logged.
 */
export async function updateClinicalPlan(
  planId: string,
  actorId: string,
  updates: UpdatePlanInput,
  client: SupabaseClient | null = supabase,
): Promise<{ success: boolean; plan?: ClinicalPlan; error?: string }> {
  const local = getLocalPlans()
  const plan = local.find((p) => p.id === planId)
  if (!plan) return { success: false, error: 'Clinical plan not found.' }

  // Check authorization: must be either the professional or the patient
  if (plan.professional_id !== actorId && plan.patient_id !== actorId) {
    return { success: false, error: 'Unauthorized to update this clinical plan.' }
  }

  // Patient can only change status
  if (actorId === plan.patient_id) {
    if (updates.exercises || updates.instructions || updates.title) {
      return { success: false, error: 'Patients may only update plan completion status.' }
    }
  }

  // If professional, check connection and consent
  if (actorId === plan.professional_id) {
    const connections = await getPatientConnections(plan.patient_id, client)
    const conn = connections.find((c) => c.professional_id === actorId && c.status === 'active')
    if (!conn || !conn.consent_scope.allow_plan_assignment) {
      return { success: false, error: 'Cannot update plan: active patient connection and consent required.' }
    }
  }

  // Validate exercises if updated
  if (updates.exercises) {
    const val = validatePlanInput({
      professional_id: plan.professional_id,
      patient_id: plan.patient_id,
      title: updates.title ?? plan.title,
      end_date: updates.end_date ?? plan.end_date,
      exercises: updates.exercises,
    })
    if (!val.valid) return { success: false, error: val.error }
  }

  // Check if content changed requiring version bump
  const contentChanged =
    (updates.exercises && JSON.stringify(updates.exercises) !== JSON.stringify(plan.exercises)) ||
    (updates.title && updates.title !== plan.title) ||
    (updates.instructions !== undefined && updates.instructions !== plan.instructions)

  const newVersion = contentChanged ? plan.version + 1 : plan.version
  const now = new Date().toISOString()

  const updatedPlan: ClinicalPlan = {
    ...plan,
    title: updates.title?.trim() ?? plan.title,
    instructions: updates.instructions !== undefined ? updates.instructions?.trim() || null : plan.instructions,
    frequency: updates.frequency?.trim() ?? plan.frequency,
    status: updates.status ?? plan.status,
    version: newVersion,
    end_date: updates.end_date ?? plan.end_date,
    exercises: updates.exercises ?? plan.exercises,
    last_change_summary: updates.change_summary?.trim() || (contentChanged ? 'Updated plan details' : plan.last_change_summary),
    updated_at: now,
  }

  if (client) {
    try {
      const { data, error } = await client
        .from('clinical_plans')
        .update({
          title: updatedPlan.title,
          instructions: updatedPlan.instructions,
          frequency: updatedPlan.frequency,
          status: updatedPlan.status,
          version: updatedPlan.version,
          end_date: updatedPlan.end_date,
          exercises: updatedPlan.exercises,
          last_change_summary: updatedPlan.last_change_summary,
        })
        .eq('id', planId)
        .select()
        .single()

      if (!error && data) {
        const full = { ...updatedPlan, ...data }
        const updatedLocal = local.map((p) => (p.id === planId ? full : p))
        saveLocalPlans(updatedLocal)
        return { success: true, plan: full }
      }
      if (error) {
        return { success: false, error: error.message }
      }
    } catch {
      // Fallback
    }
  }

  const updatedLocal = local.map((p) => (p.id === planId ? updatedPlan : p))
  saveLocalPlans(updatedLocal)

  // Record audit
  const audits = getLocalAudits()
  audits.push({
    id: `audit-${Date.now()}`,
    plan_id: planId,
    actor_id: actorId,
    event_type: contentChanged ? 'version_updated' : 'status_changed',
    change_summary: updatedPlan.last_change_summary || 'Updated plan',
    previous_version: plan.version,
    new_version: newVersion,
    metadata: { status: updatedPlan.status },
    created_at: now,
  })
  saveLocalAudits(audits)

  return { success: true, plan: updatedPlan }
}

/**
 * Retrieves all assigned clinical plans for a given patient.
 */
export async function getPlansForPatient(
  patientId: string,
  client: SupabaseClient | null = supabase,
): Promise<ClinicalPlan[]> {
  if (client) {
    try {
      const { data, error } = await client
        .from('clinical_plans')
        .select('*')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })

      if (!error && data) {
        return data as ClinicalPlan[]
      }
    } catch {
      // Fallback
    }
  }

  const local = getLocalPlans()
  return local.filter((p) => p.patient_id === patientId)
}

/**
 * Retrieves all clinical plans created by a given professional.
 */
export async function getPlansForProfessional(
  professionalId: string,
  client: SupabaseClient | null = supabase,
): Promise<ClinicalPlan[]> {
  if (client) {
    try {
      const { data, error } = await client
        .from('clinical_plans')
        .select('*')
        .eq('professional_id', professionalId)
        .order('created_at', { ascending: false })

      if (!error && data) {
        return data as ClinicalPlan[]
      }
    } catch {
      // Fallback
    }
  }

  const local = getLocalPlans()
  return local.filter((p) => p.professional_id === professionalId)
}

/**
 * Retrieves audit history events for a clinical plan.
 */
export async function getPlanAuditEvents(
  planId: string,
  client: SupabaseClient | null = supabase,
): Promise<PlanAuditEvent[]> {
  if (client) {
    try {
      const { data, error } = await client
        .from('plan_audit_events')
        .select('*')
        .eq('plan_id', planId)
        .order('created_at', { ascending: false })

      if (!error && data) {
        return data as PlanAuditEvent[]
      }
    } catch {
      // Fallback
    }
  }

  const local = getLocalAudits()
  return local.filter((a) => a.plan_id === planId)
}
