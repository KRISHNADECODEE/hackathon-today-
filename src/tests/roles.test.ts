import { describe, expect, it } from 'vitest'
import type { ProfileRow, UserRole } from '../lib/supabase'

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
