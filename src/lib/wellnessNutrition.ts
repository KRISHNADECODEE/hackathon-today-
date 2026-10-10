/**
 * KinectIQ 2.0: Age-Aware Wellness & General Nutrition Engine
 * 
 * Provides evidence-based, transparent wellness and nutritional education
 * tailored to user preferences and age groups.
 * 
 * IMPORTANT MEDICAL DISCLAIMER:
 * Guidance is purely educational lifestyle information based on public health models
 * (Harvard Healthy Eating Plate, WHO dietary guidelines). It does NOT constitute medical
 * nutrition therapy, medical diagnosis, or personalized dietary prescriptions.
 */

export type AgeBracket = 'under_18' | '18_29' | '30_49' | '50_64' | '65_plus'

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active'

export type DietaryPattern =
  | 'unrestricted'
  | 'plant_forward'
  | 'vegetarian'
  | 'vegan'
  | 'pescatarian'

export type DietaryRestriction =
  | 'gluten_free'
  | 'dairy_free'
  | 'nut_allergy'
  | 'egg_free'
  | 'shellfish_free'
  | 'low_sodium_preference'

export type WellnessGoal =
  | 'desk_mobility'
  | 'posture_awareness'
  | 'energy_boost'
  | 'daily_consistency'
  | 'gentle_flexibility'

export interface WellnessProfile {
  ageBracket: AgeBracket
  wellnessGoals: WellnessGoal[]
  activityLevel: ActivityLevel
  dietaryPattern: DietaryPattern
  restrictions: DietaryRestriction[]
  updatedAt: string
}

export const AGE_BRACKET_LABELS: Record<AgeBracket, { label: string; desc: string }> = {
  under_18: { label: 'Under 18 (Youth / Teen)', desc: 'Focus on growth, study breaks, and balanced nourishment' },
  '18_29': { label: '18–29 Years', desc: 'Focus on screen vitality, posture habits, and sustained energy' },
  '30_49': { label: '30–49 Years', desc: 'Focus on desk work ergonomics, metabolic vitality, and micro-breaks' },
  '50_64': { label: '50–64 Years', desc: 'Focus on joint mobility, bone vitality, and healthy functional movement' },
  '65_plus': { label: '65+ Years', desc: 'Focus on functional balance, gentle mobility, and hydration awareness' },
}

export const ACTIVITY_LEVEL_LABELS: Record<ActivityLevel, { label: string; desc: string }> = {
  sedentary: { label: 'Desk / Screen Worker', desc: 'Predominantly seated work (6+ hours/day)' },
  light: { label: 'Lightly Active', desc: 'Some walking, light errands, short standing periods' },
  moderate: { label: 'Moderately Active', desc: 'Regular daily movement or structured light exercise' },
  active: { label: 'Consistently Active', desc: 'High physical movement throughout most days' },
}

export const DIETARY_PATTERN_LABELS: Record<DietaryPattern, { label: string; desc: string }> = {
  unrestricted: { label: 'Omnivore / Balanced', desc: 'Includes all food groups (vegetables, grains, meat, dairy, fish)' },
  plant_forward: { label: 'Plant-Forward (Flexitarian)', desc: 'Primarily whole plants with occasional meat or poultry' },
  vegetarian: { label: 'Vegetarian', desc: 'Plant foods, dairy, and eggs; no meat or poultry' },
  vegan: { label: '100% Plant-Based (Vegan)', desc: 'Exclusively plant-derived foods, seeds, and legumes' },
  pescatarian: { label: 'Pescatarian', desc: 'Vegetarian foundation plus fish and seafood' },
}

export const RESTRICTION_LABELS: Record<DietaryRestriction, string> = {
  gluten_free: 'Gluten-Free (wheat, barley, rye exclusion)',
  dairy_free: 'Dairy-Free (milk, cheese, yogurt exclusion)',
  nut_allergy: 'Nut Allergy (tree nuts & peanuts exclusion)',
  egg_free: 'Egg-Free',
  shellfish_free: 'Shellfish-Free',
  low_sodium_preference: 'Low Sodium / Heart-Conscious Focus',
}

export const WELLNESS_GOAL_LABELS: Record<WellnessGoal, string> = {
  desk_mobility: 'Reduce desk stiffness & improve spinal circulation',
  posture_awareness: 'Build consistent ergonomic & head-alignment awareness',
  energy_boost: 'Prevent afternoon screen fatigue & sustain focus',
  daily_consistency: 'Establish short 2-minute daily movement habits',
  gentle_flexibility: 'Maintain comfortable joint range of motion',
}

export interface MealIdea {
  title: string
  category: 'breakfast' | 'lunch_dinner' | 'snack'
  description: string
  suitablePatterns: DietaryPattern[]
  containsGluten?: boolean
  containsDairy?: boolean
  containsNuts?: boolean
  containsEggs?: boolean
  containsShellfish?: boolean
}

export const EVIDENCE_BASED_MEALS: MealIdea[] = [
  // Breakfast ideas
  {
    title: 'Warm Rolled Oats with Berries & Seeds',
    category: 'breakfast',
    description: 'High-fiber oats prepared with water or plant milk, topped with antioxidant-rich blueberries, chia seeds, and cinnamon.',
    suitablePatterns: ['unrestricted', 'plant_forward', 'vegetarian', 'vegan', 'pescatarian'],
    containsDairy: false,
    containsNuts: false,
    containsEggs: false,
    containsShellfish: false,
  },
  {
    title: 'Veggie Scramble with Avocado & Whole Toast',
    category: 'breakfast',
    description: 'Soft-scrambled eggs with sautéed spinach, tomatoes, and sliced avocado for balanced fats and protein.',
    suitablePatterns: ['unrestricted', 'plant_forward', 'vegetarian', 'pescatarian'],
    containsGluten: true,
    containsDairy: false,
    containsNuts: false,
    containsEggs: true,
    containsShellfish: false,
  },
  {
    title: 'Tofu Breakfast Skillet with Peppers & Turmeric',
    category: 'breakfast',
    description: 'Crumbled firm tofu sautéed with bell peppers, onions, spinach, and a pinch of turmeric on roasted sweet potato cubes.',
    suitablePatterns: ['unrestricted', 'plant_forward', 'vegetarian', 'vegan', 'pescatarian'],
    containsGluten: false,
    containsDairy: false,
    containsNuts: false,
    containsEggs: false,
    containsShellfish: false,
  },
  {
    title: 'Greek Yogurt Bowl with Flaxseed & Sliced Kiwi',
    category: 'breakfast',
    description: 'High-protein unsweetened yogurt topped with ground flaxseed for omega-3s and kiwi for vitamin C.',
    suitablePatterns: ['unrestricted', 'plant_forward', 'vegetarian', 'pescatarian'],
    containsGluten: false,
    containsDairy: true,
    containsNuts: false,
    containsEggs: false,
    containsShellfish: false,
  },

  // Lunch & Dinner ideas
  {
    title: 'Mediterranean Lentil & Quinoa Power Bowl',
    category: 'lunch_dinner',
    description: 'Warm cooked quinoa and tender brown lentils, cucumber, cherry tomatoes, kalamata olives, parsley, and lemon-tahini dressing.',
    suitablePatterns: ['unrestricted', 'plant_forward', 'vegetarian', 'vegan', 'pescatarian'],
    containsGluten: false,
    containsDairy: false,
    containsNuts: false,
    containsEggs: false,
    containsShellfish: false,
  },
  {
    title: 'Grilled Salmon with Steamed Asparagus & Brown Rice',
    category: 'lunch_dinner',
    description: 'Oven-roasted wild salmon rich in anti-inflammatory EPA/DHA omega-3s, paired with steamed asparagus and nutty brown rice.',
    suitablePatterns: ['unrestricted', 'plant_forward', 'pescatarian'],
    containsGluten: false,
    containsDairy: false,
    containsNuts: false,
    containsEggs: false,
    containsShellfish: false,
  },
  {
    title: 'Chickpea & Spinach Coconut Curry',
    category: 'lunch_dinner',
    description: 'Simmered chickpeas, tender baby spinach, ginger, and garlic in light coconut milk, served over riced cauliflower or jasmine rice.',
    suitablePatterns: ['unrestricted', 'plant_forward', 'vegetarian', 'vegan', 'pescatarian'],
    containsGluten: false,
    containsDairy: false,
    containsNuts: false,
    containsEggs: false,
    containsShellfish: false,
  },
  {
    title: 'Roasted Chicken Breast with Rainbow Roasted Vegetables',
    category: 'lunch_dinner',
    description: 'Lean herbed chicken breast with caramelized carrots, zucchini, red onion, and olive oil for muscle repair and micronutrients.',
    suitablePatterns: ['unrestricted'],
    containsGluten: false,
    containsDairy: false,
    containsNuts: false,
    containsEggs: false,
    containsShellfish: false,
  },
  {
    title: 'Tempeh Stir-Fry with Broccoli & Sesame Dressing',
    category: 'lunch_dinner',
    description: 'Fermented plant protein sautéed with crisp broccoli florets, snap peas, and grated ginger in low-sodium tamari.',
    suitablePatterns: ['unrestricted', 'plant_forward', 'vegetarian', 'vegan', 'pescatarian'],
    containsGluten: false,
    containsDairy: false,
    containsNuts: false,
    containsEggs: false,
    containsShellfish: false,
  },

  // Snack ideas
  {
    title: 'Crispy Roasted Chickpeas with Paprika',
    category: 'snack',
    description: 'Crunchy oven-roasted chickpeas seasoned with smoked paprika and sea salt, offering 6g fiber per serving.',
    suitablePatterns: ['unrestricted', 'plant_forward', 'vegetarian', 'vegan', 'pescatarian'],
    containsGluten: false,
    containsDairy: false,
    containsNuts: false,
    containsEggs: false,
    containsShellfish: false,
  },
  {
    title: 'Apple Slices with Sunflower Seed Butter',
    category: 'snack',
    description: 'Crisp apple slices paired with creamy nut-free sunflower seed butter for a steady glycemic curve.',
    suitablePatterns: ['unrestricted', 'plant_forward', 'vegetarian', 'vegan', 'pescatarian'],
    containsGluten: false,
    containsDairy: false,
    containsNuts: false,
    containsEggs: false,
    containsShellfish: false,
  },
  {
    title: 'Cucumber Rounds with Garlic Hummus',
    category: 'snack',
    description: 'Refreshing hydrating cucumber slices dipped in wholesome chickpea hummus.',
    suitablePatterns: ['unrestricted', 'plant_forward', 'vegetarian', 'vegan', 'pescatarian'],
    containsGluten: false,
    containsDairy: false,
    containsNuts: false,
    containsEggs: false,
    containsShellfish: false,
  },
  {
    title: 'Raw Walnuts & Dried Tart Cherries',
    category: 'snack',
    description: 'A handful of omega-3 rich walnuts and tart cherries providing melatonin and polyphenol antioxidants.',
    suitablePatterns: ['unrestricted', 'plant_forward', 'vegetarian', 'vegan', 'pescatarian'],
    containsGluten: false,
    containsDairy: false,
    containsNuts: true,
    containsEggs: false,
    containsShellfish: false,
  },
]

export interface AgeGuidance {
  title: string
  focus: string
  safeguardNote: string
  movementEmphasis: string
  nutritionTips: string[]
  recommendedRoutineId: string
}

export const AGE_SPECIFIC_GUIDANCE: Record<AgeBracket, AgeGuidance> = {
  under_18: {
    title: 'Youth & Student Ergonomic Guidance',
    focus: 'Healthy Growth, Posture Foundations & Sustained Energy',
    safeguardNote:
      'Guardian Notice: Restrictive dieting or calorie reduction is not recommended for minors. Focus on regular wholesome meals, growth nutrition, and regular movement breaks.',
    movementEmphasis: 'Take 2-minute posture breaks between homework or screen time to avoid prolonged forward-head slump.',
    nutritionTips: [
      'Prioritize three balanced, regular meals and healthy snacks to fuel physical and cognitive development.',
      'Drink water consistently during study hours rather than high-sugar energy drinks or sodas.',
      'Include a colorful variety of fruits and vegetables daily for essential vitamins and immune support.',
      'Ensure adequate dietary calcium and protein from whole foods to support growing bones and muscles.',
    ],
    recommendedRoutineId: 'neck-posture-reset',
  },
  '18_29': {
    title: 'Young Adult & Screen Worker Guidance',
    focus: 'Desk Ergonomics, Mental Clarity & Consistent Energy',
    safeguardNote:
      'General Lifestyle Information: Not a medical prescription. Adapt pace to your personal schedule and comfort.',
    movementEmphasis: 'Break up deep-work sessions every 45–60 minutes to relieve tension in the neck, upper back, and hip flexors.',
    nutritionTips: [
      'Choose complex carbohydrates (oats, brown rice, sweet potatoes) to avoid afternoon focus crashes.',
      'Pair proteins with fiber at lunch to maintain cognitive alertness throughout long work hours.',
      'Keep a water bottle at your workstation; mild dehydration is a frequent cause of perceived fatigue.',
      'Mind your caffeine intake after 2:00 PM to protect restorative sleep cycles.',
    ],
    recommendedRoutineId: 'desk-mobility-boost',
  },
  '30_49': {
    title: 'Ergonomic Vitality & Workday Recovery',
    focus: 'Spinal Alignment, Metabolic Vitality & Habit Consistency',
    safeguardNote:
      'Educational Guidance: General adult wellness principles. Consult a healthcare provider for specific metabolic goals.',
    movementEmphasis: 'Frequent sit-to-stand transitions to stimulate lower extremity circulation and counter prolonged sitting.',
    nutritionTips: [
      'Follow the Mediterranean whole-food plate: half vegetables/greens, one quarter quality protein, one quarter whole grains.',
      'Include anti-inflammatory foods such as leafy greens, extra-virgin olive oil, and colorful berries.',
      'Distribute protein evenly across breakfast, lunch, and dinner to support lean tissue maintenance.',
      'Take 5 minutes away from screens during lunch to support mindful eating and digestion.',
    ],
    recommendedRoutineId: 'posture-stand-reset',
  },
  '50_64': {
    title: 'Joint Health & Muscle Vitality Guidance',
    focus: 'Joint Mobility, Bone Health & Lean Tissue Preservation',
    safeguardNote:
      'Movement Safety: Respect your individual range of motion. Perform movements smoothly without joint pain or strain.',
    movementEmphasis: 'Incorporate shoulder chest openers and gentle functional lower-body movements into daily habits.',
    nutritionTips: [
      'Aim for 20–30 grams of protein per main meal from whole foods to actively preserve muscle mass.',
      'Support bone density with foods rich in calcium and vitamin D (leafy greens, fortified foods, fish).',
      'Stay proactive with hydration, as the physiological sensation of thirst begins to decline.',
      'Emphasize high-fiber legumes and vegetables to support cardiovascular and digestive wellness.',
    ],
    recommendedRoutineId: 'shoulder-chest-opener',
  },
  '65_plus': {
    title: 'Healthy Aging & Functional Mobility',
    focus: 'Balance Confidence, Gentle Range of Motion & Hydration Awareness',
    safeguardNote:
      'Individualized Pace: Needs vary widely across individuals. Move at a comfortable, stable pace and hold onto a sturdy surface if needed.',
    movementEmphasis: 'Gentle, controlled functional movements (such as assisted sit-to-stand and posture alignment) to preserve independent mobility.',
    nutritionTips: [
      'Prioritize regular fluid intake throughout the day even before feeling thirsty.',
      'Focus on nutrient-dense, easy-to-digest whole foods with adequate high-quality protein.',
      'Include calcium-rich choices and ensure balanced dietary vitamin D sources.',
      'Eat consistent, comforting smaller meals if larger portions feel overly heavy.',
    ],
    recommendedRoutineId: 'posture-stand-reset',
  },
}

export interface GuidanceResult {
  isConfigured: boolean
  profile: WellnessProfile | null
  ageGuidance: AgeGuidance
  mealIdeas: MealIdea[]
  hydrationTargetDesc: string
  disclaimers: string[]
}

/**
 * Filters meal suggestions strictly accounting for user dietary patterns and food restrictions.
 */
export function filterMeals(
  meals: MealIdea[],
  pattern: DietaryPattern,
  restrictions: DietaryRestriction[]
): MealIdea[] {
  return meals.filter((meal) => {
    // Check dietary pattern compatibility
    if (!meal.suitablePatterns.includes(pattern)) {
      return false
    }

    // Apply strict exclusions
    if (restrictions.includes('gluten_free') && meal.containsGluten) {
      return false
    }
    if (restrictions.includes('dairy_free') && meal.containsDairy) {
      return false
    }
    if (restrictions.includes('nut_allergy') && meal.containsNuts) {
      return false
    }
    if (restrictions.includes('egg_free') && meal.containsEggs) {
      return false
    }
    if (restrictions.includes('shellfish_free') && meal.containsShellfish) {
      return false
    }

    return true
  })
}

/**
 * Computes transparent, evidence-based wellness & nutrition guidance.
 */
export function getWellnessGuidance(profile: WellnessProfile | null): GuidanceResult {
  const disclaimers = [
    'Educational Lifestyle Guidance: Information provided is for general adult and student wellness education only.',
    'Not Medical Nutrition Therapy: Does not diagnose, prescribe, or treat medical conditions, metabolic disorders, or clinical deficiencies.',
    'Individual Consultation: For personalized nutritional plans, clinical diets, or rehabilitation, consult a registered dietitian or licensed healthcare provider.',
  ]

  if (!profile) {
    // Default general adult guidance when profile is not yet configured
    const defaultGuidance = AGE_SPECIFIC_GUIDANCE['30_49']
    return {
      isConfigured: false,
      profile: null,
      ageGuidance: defaultGuidance,
      mealIdeas: filterMeals(EVIDENCE_BASED_MEALS, 'unrestricted', []).slice(0, 4),
      hydrationTargetDesc: 'Aim for approximately 8–10 cups (2 to 2.5 liters) of water daily, adjusted for activity.',
      disclaimers,
    }
  }

  const ageGuidance = AGE_SPECIFIC_GUIDANCE[profile.ageBracket] ?? AGE_SPECIFIC_GUIDANCE['30_49']
  const filtered = filterMeals(EVIDENCE_BASED_MEALS, profile.dietaryPattern, profile.restrictions)

  // Ensure variety across categories (1 breakfast, 1-2 lunch/dinner, 1 snack)
  const breakfasts = filtered.filter((m) => m.category === 'breakfast')
  const mains = filtered.filter((m) => m.category === 'lunch_dinner')
  const snacks = filtered.filter((m) => m.category === 'snack')

  const selectedMeals: MealIdea[] = [
    ...breakfasts.slice(0, 1),
    ...mains.slice(0, 2),
    ...snacks.slice(0, 1),
  ]

  // Hydration guidance adapted to activity level
  let hydrationDesc = 'Aim for approximately 8 glasses of water (2 liters) throughout the day.'
  if (profile.activityLevel === 'sedentary') {
    hydrationDesc = 'Desk worker goal: Sip 1 cup (250ml) every 90 minutes; aim for 2 to 2.5 liters daily.'
  } else if (profile.activityLevel === 'active') {
    hydrationDesc = 'Active movement goal: Aim for 2.5 to 3 liters daily to replenish fluids lost during activity.'
  }

  return {
    isConfigured: true,
    profile,
    ageGuidance,
    mealIdeas: selectedMeals.length > 0 ? selectedMeals : filtered.slice(0, 4),
    hydrationTargetDesc: hydrationDesc,
    disclaimers,
  }
}
