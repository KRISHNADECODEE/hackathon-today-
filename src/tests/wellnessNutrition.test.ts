import { describe, expect, it, beforeEach } from 'vitest'
import {
  filterMeals,
  getWellnessGuidance,
  EVIDENCE_BASED_MEALS,
  type WellnessProfile,
} from '../lib/wellnessNutrition'
import { getPrefs, setPrefs } from '../lib/prefs'

const storageMap = new Map<string, string>()
const mockLocalStorage = {
  getItem: (k: string) => storageMap.get(k) ?? null,
  setItem: (k: string, v: string) => storageMap.set(k, v),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
}
Object.defineProperty(globalThis, 'localStorage', { value: mockLocalStorage, configurable: true, writable: true })

describe('Age-Aware Wellness & Nutrition Guidance Engine', () => {
  beforeEach(() => {
    storageMap.clear()
    setPrefs({ wellnessProfile: null })
  })

  describe('Empty and Unconfigured States', () => {
    it('returns default general guidance and empty profile when unconfigured', () => {
      const guidance = getWellnessGuidance(null)
      expect(guidance.isConfigured).toBe(false)
      expect(guidance.profile).toBeNull()
      expect(guidance.ageGuidance).toBeDefined()
      expect(guidance.mealIdeas.length).toBeGreaterThan(0)
      expect(guidance.disclaimers.length).toBeGreaterThanOrEqual(3)
      expect(guidance.disclaimers[0]).toContain('Educational Lifestyle Guidance')
    })
  })

  describe('Age Range Safeguards and Specific Guidance', () => {
    it('applies strict youth safeguards for minors under 18', () => {
      const minorProfile: WellnessProfile = {
        ageBracket: 'under_18',
        wellnessGoals: ['desk_mobility'],
        activityLevel: 'sedentary',
        dietaryPattern: 'unrestricted',
        restrictions: [],
        updatedAt: '2026-10-10T02:00:00Z',
      }

      const guidance = getWellnessGuidance(minorProfile)
      expect(guidance.isConfigured).toBe(true)
      expect(guidance.ageGuidance.title).toContain('Youth & Student')
      // Must emphasize growth and avoid restrictive diets
      expect(guidance.ageGuidance.safeguardNote.toLowerCase()).toContain('not recommended')
      expect(guidance.ageGuidance.safeguardNote.toLowerCase()).toContain('restrictive dieting')
      expect(guidance.ageGuidance.nutritionTips.some((t) => t.toLowerCase().includes('development'))).toBe(true)
    })

    it('provides healthy aging, gentle mobility, and hydration focus for adults 65+', () => {
      const seniorProfile: WellnessProfile = {
        ageBracket: '65_plus',
        wellnessGoals: ['gentle_flexibility'],
        activityLevel: 'light',
        dietaryPattern: 'plant_forward',
        restrictions: [],
        updatedAt: '2026-10-10T02:00:00Z',
      }

      const guidance = getWellnessGuidance(seniorProfile)
      expect(guidance.isConfigured).toBe(true)
      expect(guidance.ageGuidance.title).toContain('Healthy Aging')
      // Must emphasize individual pace without assuming uniform mobility
      expect(guidance.ageGuidance.safeguardNote).toContain('Needs vary widely across individuals')
      expect(guidance.ageGuidance.nutritionTips.some((t) => t.toLowerCase().includes('fluid intake'))).toBe(true)
    })

    it('provides desk ergonomics and sustained focus guidance for young adults and 30-49', () => {
      const adultProfile: WellnessProfile = {
        ageBracket: '30_49',
        wellnessGoals: ['desk_mobility', 'posture_awareness'],
        activityLevel: 'sedentary',
        dietaryPattern: 'unrestricted',
        restrictions: [],
        updatedAt: '2026-10-10T02:00:00Z',
      }

      const guidance = getWellnessGuidance(adultProfile)
      expect(guidance.ageGuidance.movementEmphasis).toContain('sit-to-stand')
      expect(guidance.hydrationTargetDesc).toContain('Desk worker goal')
    })
  })

  describe('Dietary Pattern and Food Restriction Filtering', () => {
    it('strictly excludes dairy and eggs for vegan dietary pattern', () => {
      const veganMeals = filterMeals(EVIDENCE_BASED_MEALS, 'vegan', [])
      expect(veganMeals.length).toBeGreaterThan(0)

      for (const meal of veganMeals) {
        expect(meal.suitablePatterns).toContain('vegan')
        expect(meal.containsDairy).toBe(false)
        expect(meal.containsEggs).toBe(false)
      }
    })

    it('strictly excludes gluten-containing foods when gluten_free restriction is checked', () => {
      const gfMeals = filterMeals(EVIDENCE_BASED_MEALS, 'unrestricted', ['gluten_free'])
      expect(gfMeals.length).toBeGreaterThan(0)

      for (const meal of gfMeals) {
        expect(meal.containsGluten).toBeFalsy()
      }
    })

    it('strictly excludes tree nuts and peanuts when nut_allergy is specified', () => {
      const nutFreeMeals = filterMeals(EVIDENCE_BASED_MEALS, 'unrestricted', ['nut_allergy'])
      expect(nutFreeMeals.length).toBeGreaterThan(0)

      for (const meal of nutFreeMeals) {
        expect(meal.containsNuts).toBeFalsy()
      }
    })

    it('combines multiple restrictions (gluten-free + nut-allergy + dairy-free) safely', () => {
      const restricted = filterMeals(EVIDENCE_BASED_MEALS, 'vegetarian', [
        'gluten_free',
        'nut_allergy',
        'dairy_free',
      ])
      expect(restricted.length).toBeGreaterThan(0)

      for (const meal of restricted) {
        expect(meal.containsGluten).toBeFalsy()
        expect(meal.containsNuts).toBeFalsy()
        expect(meal.containsDairy).toBeFalsy()
      }
    })
  })

  describe('Profile Persistence, Updates & Deletion (Offline Support)', () => {
    it('saves, retrieves, updates, and deletes wellness profile in local preferences', () => {
      // 1. Initial state is null
      expect(getPrefs().wellnessProfile).toBeNull()

      // 2. Save profile
      const newProfile: WellnessProfile = {
        ageBracket: '18_29',
        wellnessGoals: ['energy_boost', 'posture_awareness'],
        activityLevel: 'active',
        dietaryPattern: 'pescatarian',
        restrictions: ['nut_allergy'],
        updatedAt: new Date().toISOString(),
      }
      setPrefs({ wellnessProfile: newProfile })

      const loaded = getPrefs().wellnessProfile
      expect(loaded).toBeDefined()
      expect(loaded?.ageBracket).toBe('18_29')
      expect(loaded?.dietaryPattern).toBe('pescatarian')
      expect(loaded?.restrictions).toEqual(['nut_allergy'])

      // 3. Update profile
      const updatedProfile: WellnessProfile = {
        ...newProfile,
        dietaryPattern: 'plant_forward',
        restrictions: ['nut_allergy', 'gluten_free'],
      }
      setPrefs({ wellnessProfile: updatedProfile })

      const updated = getPrefs().wellnessProfile
      expect(updated?.dietaryPattern).toBe('plant_forward')
      expect(updated?.restrictions).toContain('gluten_free')

      // 4. Delete profile
      setPrefs({ wellnessProfile: null })
      expect(getPrefs().wellnessProfile).toBeNull()
    })
  })

  describe('Medical Disclaimers and Boundary Separation', () => {
    it('always includes explicit medical disclaimers in guidance output', () => {
      const profile: WellnessProfile = {
        ageBracket: '50_64',
        wellnessGoals: ['gentle_flexibility'],
        activityLevel: 'moderate',
        dietaryPattern: 'unrestricted',
        restrictions: [],
        updatedAt: new Date().toISOString(),
      }

      const guidance = getWellnessGuidance(profile)
      expect(guidance.disclaimers.some((d) => d.includes('Not Medical Nutrition Therapy'))).toBe(true)
      expect(guidance.disclaimers.some((d) => d.includes('Educational Lifestyle Guidance'))).toBe(true)
    })
  })
})
