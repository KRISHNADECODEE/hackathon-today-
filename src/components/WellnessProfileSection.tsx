import { useState } from 'react'
import {
  Check,
  Droplets,
  Edit3,
  Info,
  ShieldAlert,
  Sparkles,
  Trash2,
  Utensils,
  Wifi,
  X,
} from 'lucide-react'
import { Badge, Button, Card } from './ui'
import { useAuth, updateRemoteWellnessProfile } from '../lib/auth'
import { getPrefs, setPrefs } from '../lib/prefs'
import {
  AGE_BRACKET_LABELS,
  ACTIVITY_LEVEL_LABELS,
  DIETARY_PATTERN_LABELS,
  RESTRICTION_LABELS,
  WELLNESS_GOAL_LABELS,
  getWellnessGuidance,
  type AgeBracket,
  type ActivityLevel,
  type DietaryPattern,
  type DietaryRestriction,
  type WellnessGoal,
  type WellnessProfile,
} from '../lib/wellnessNutrition'
import { useNavigate } from 'react-router-dom'

export function WellnessProfileSection() {
  const nav = useNavigate()
  const { user } = useAuth()
  const [profile, setLocalProfile] = useState<WellnessProfile | null>(() => getPrefs().wellnessProfile)
  const [isEditing, setIsEditing] = useState(false)

  // Form drafting state
  const [draftAge, setDraftAge] = useState<AgeBracket>(profile?.ageBracket ?? '30_49')
  const [draftActivity, setDraftActivity] = useState<ActivityLevel>(profile?.activityLevel ?? 'sedentary')
  const [draftPattern, setDraftPattern] = useState<DietaryPattern>(profile?.dietaryPattern ?? 'unrestricted')
  const [draftGoals, setDraftGoals] = useState<WellnessGoal[]>(profile?.wellnessGoals ?? ['desk_mobility', 'posture_awareness'])
  const [draftRestrictions, setDraftRestrictions] = useState<DietaryRestriction[]>(profile?.restrictions ?? [])

  const guidance = getWellnessGuidance(profile)

  function toggleGoal(goal: WellnessGoal) {
    setDraftGoals((prev) =>
      prev.includes(goal) ? prev.filter((g) => g !== goal) : [...prev, goal]
    )
  }

  function toggleRestriction(res: DietaryRestriction) {
    setDraftRestrictions((prev) =>
      prev.includes(res) ? prev.filter((r) => r !== res) : [...prev, res]
    )
  }

  async function handleSave() {
    const updated: WellnessProfile = {
      ageBracket: draftAge,
      activityLevel: draftActivity,
      dietaryPattern: draftPattern,
      wellnessGoals: draftGoals,
      restrictions: draftRestrictions,
      updatedAt: new Date().toISOString(),
    }

    setLocalProfile(updated)
    setPrefs({ wellnessProfile: updated })
    setIsEditing(false)

    // Sync to remote database if user is authenticated and online
    if (user && navigator.onLine) {
      try {
        await updateRemoteWellnessProfile(updated)
      } catch {
        // Safe to ignore; stored offline locally
      }
    }
  }

  async function handleDelete() {
    if (!window.confirm('Clear your wellness profile preferences? You can reconfigure them anytime.')) {
      return
    }

    setLocalProfile(null)
    setPrefs({ wellnessProfile: null })
    setIsEditing(false)

    if (user && navigator.onLine) {
      try {
        await updateRemoteWellnessProfile(null)
      } catch {
        // Ignored
      }
    }
  }

  return (
    <section className="mb-12">
      <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-xl font-bold text-ink">
              Age-Aware Wellness & Nutrition Guidance
            </h2>
            <Badge tone="teal">General Education</Badge>
          </div>
          <p className="text-xs text-muted">
            Evidence-based lifestyle habits and whole-food suggestions tailored to your schedule.
          </p>
        </div>

        {profile && !isEditing && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => setIsEditing(true)}
              className="text-xs border border-rule hover:border-emerald-500"
            >
              <Edit3 className="h-3.5 w-3.5 mr-1" /> Edit Preferences
            </Button>
            <Button
              variant="ghost"
              onClick={handleDelete}
              className="text-xs text-rose-700 hover:text-rose-800 hover:bg-rose-50 border border-rule"
              title="Delete stored wellness profile"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Editing Form / Modal */}
      {isEditing && (
        <Card className="mb-8 p-6 border-emerald-500/40 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-rule pb-3 mb-5">
            <div>
              <h3 className="font-display text-base font-bold text-ink flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-emerald-600" /> Configure Wellness & Nutrition Preferences
              </h3>
              <p className="text-xs text-muted">
                100% optional. No sensitive diagnostic or clinical medical data is collected.
              </p>
            </div>
            <button
              onClick={() => setIsEditing(false)}
              className="text-muted hover:text-ink text-sm p-1"
              aria-label="Close form"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-6 text-xs">
            {/* 1. Age Range */}
            <div>
              <label className="font-semibold text-ink block mb-1.5">
                Age Range (Used for age-appropriate movement and general nutrition safeguards):
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {(Object.keys(AGE_BRACKET_LABELS) as AgeBracket[]).map((bracket) => (
                  <button
                    key={bracket}
                    type="button"
                    onClick={() => setDraftAge(bracket)}
                    className={`p-2.5 rounded-lg border text-left transition ${
                      draftAge === bracket
                        ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950 font-semibold ring-1 ring-emerald-500'
                        : 'border-rule bg-paper hover:bg-white text-ink'
                    }`}
                  >
                    <div className="font-medium">{AGE_BRACKET_LABELS[bracket].label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Activity Profile */}
            <div>
              <label className="font-semibold text-ink block mb-1.5">
                Workday Activity Pattern:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                {(Object.keys(ACTIVITY_LEVEL_LABELS) as ActivityLevel[]).map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setDraftActivity(lvl)}
                    className={`p-2.5 rounded-lg border text-left transition ${
                      draftActivity === lvl
                        ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950 font-semibold ring-1 ring-emerald-500'
                        : 'border-rule bg-paper hover:bg-white text-ink'
                    }`}
                  >
                    <div className="font-medium">{ACTIVITY_LEVEL_LABELS[lvl].label}</div>
                    <div className="text-[11px] text-muted mt-0.5">{ACTIVITY_LEVEL_LABELS[lvl].desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Dietary Pattern */}
            <div>
              <label className="font-semibold text-ink block mb-1.5">
                Dietary Pattern Preference:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {(Object.keys(DIETARY_PATTERN_LABELS) as DietaryPattern[]).map((pat) => (
                  <button
                    key={pat}
                    type="button"
                    onClick={() => setDraftPattern(pat)}
                    className={`p-2.5 rounded-lg border text-left transition ${
                      draftPattern === pat
                        ? 'border-emerald-600 bg-emerald-50/70 text-emerald-950 font-semibold ring-1 ring-emerald-500'
                        : 'border-rule bg-paper hover:bg-white text-ink'
                    }`}
                  >
                    <div className="font-medium">{DIETARY_PATTERN_LABELS[pat].label}</div>
                    <div className="text-[11px] text-muted mt-0.5">{DIETARY_PATTERN_LABELS[pat].desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Relevant Food Restrictions & Allergies */}
            <div>
              <label className="font-semibold text-ink block mb-1.5">
                Food Restrictions & Allergies (Suggestions containing these will be excluded):
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {(Object.keys(RESTRICTION_LABELS) as DietaryRestriction[]).map((res) => {
                  const active = draftRestrictions.includes(res)
                  return (
                    <label
                      key={res}
                      className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition ${
                        active
                          ? 'border-amber-400 bg-amber-50 text-amber-950 font-medium'
                          : 'border-rule bg-paper hover:bg-white text-ink'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => toggleRestriction(res)}
                        className="rounded border-rule text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-xs">{RESTRICTION_LABELS[res]}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            {/* 5. Wellness & Ergonomic Goals */}
            <div>
              <label className="font-semibold text-ink block mb-1.5">
                Workday Movement Goals:
              </label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(WELLNESS_GOAL_LABELS) as WellnessGoal[]).map((goal) => {
                  const active = draftGoals.includes(goal)
                  return (
                    <button
                      key={goal}
                      type="button"
                      onClick={() => toggleGoal(goal)}
                      className={`px-3 py-1.5 rounded-full border text-xs transition flex items-center gap-1.5 ${
                        active
                          ? 'border-emerald-600 bg-emerald-600 text-white font-medium'
                          : 'border-rule bg-paper text-ink hover:bg-white'
                      }`}
                    >
                      {active && <Check className="h-3 w-3" />}
                      <span>{WELLNESS_GOAL_LABELS[goal]}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Privacy note */}
            <div className="rounded-lg border border-rule/70 bg-paper p-3 text-[11px] text-muted flex items-start gap-2">
              <Info className="h-4 w-4 text-teal shrink-0 mt-0.5" />
              <div>
                <strong>Privacy & Offline Guarantee:</strong> Preferences are preserved on this device and remain accessible when offline.
                If you sign in, preferences synchronize securely with your Supabase account. You may edit or delete them at any time.
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="ghost" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-500 text-white">
                Save Wellness Preferences
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Main Guidance Cards Display */}
      {!profile && !isEditing ? (
        <Card className="p-6 border-dashed border-emerald-500/30 bg-emerald-50/20 text-center">
          <Utensils className="mx-auto h-8 w-8 text-emerald-600/70 mb-2" />
          <h3 className="font-display text-base font-bold text-ink">
            Personalize Your Age & Nutrition Guidance (Optional)
          </h3>
          <p className="mt-1 text-xs text-muted max-w-lg mx-auto">
            Tell KinectIQ your general age range, workday activity pattern, and dietary preferences to view tailored
            ergonomic guidance, hydration reminders, and balanced meal ideas.
          </p>
          <div className="mt-4 flex justify-center">
            <Button
              onClick={() => setIsEditing(true)}
              className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Configure Wellness Profile
            </Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Active Profile Pills */}
          <div className="flex flex-wrap items-center gap-2 p-3 rounded-lg border border-rule bg-white text-xs">
            <span className="font-semibold text-muted">Your Profile:</span>
            <Badge tone="teal">{AGE_BRACKET_LABELS[guidance.ageGuidance ? (profile?.ageBracket ?? '30_49') : '30_49'].label}</Badge>
            <Badge tone="neutral">{ACTIVITY_LEVEL_LABELS[profile?.activityLevel ?? 'sedentary'].label}</Badge>
            <Badge tone="neutral">{DIETARY_PATTERN_LABELS[profile?.dietaryPattern ?? 'unrestricted'].label}</Badge>
            {profile?.restrictions.map((r) => (
              <Badge key={r} tone="amber">
                {r.replace(/_/g, ' ')}
              </Badge>
            ))}
            <span className="text-[11px] text-muted ml-auto flex items-center gap-1">
              <Wifi className="h-3 w-3 text-emerald-600" /> Available offline on this device
            </span>
          </div>

          {/* Age-Specific Movement & Safeguards Card */}
          <Card className="p-6 border-rule bg-white shadow-xs">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
              <div>
                <span className="font-mono text-xs uppercase tracking-wider text-emerald-700 font-semibold">
                  Age-Adapted Ergonomic Focus
                </span>
                <h3 className="mt-1 font-display text-lg font-bold text-ink">
                  {guidance.ageGuidance.title}
                </h3>
                <p className="text-xs text-muted mt-0.5">{guidance.ageGuidance.focus}</p>
              </div>

              <Button
                variant="ghost"
                onClick={() => nav(`/wellness`)}
                className="text-xs border border-rule self-start shrink-0"
              >
                Recommended Routine
              </Button>
            </div>

            {/* Safeguard Alert */}
            <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50/70 p-3 text-xs text-amber-900 flex items-start gap-2.5">
              <ShieldAlert className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>Safeguard & Pacing Note:</strong> {guidance.ageGuidance.safeguardNote}
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-rule bg-paper p-4">
                <span className="font-semibold text-ink text-xs block mb-1">
                  Movement & Ergonomic Cue:
                </span>
                <p className="text-xs text-muted leading-relaxed">
                  {guidance.ageGuidance.movementEmphasis}
                </p>
              </div>

              <div className="rounded-lg border border-rule bg-paper p-4">
                <span className="font-semibold text-ink text-xs block mb-1">
                  Daily Hydration Target:
                </span>
                <p className="text-xs text-muted leading-relaxed flex items-center gap-1.5">
                  <Droplets className="h-4 w-4 text-teal shrink-0" />
                  <span>{guidance.hydrationTargetDesc}</span>
                </p>
              </div>
            </div>

            <div className="mt-4 border-t border-rule pt-4">
              <span className="font-semibold text-ink text-xs block mb-2">
                Nutritional Foundations for This Stage:
              </span>
              <ul className="grid gap-2 sm:grid-cols-2 text-xs text-muted">
                {guidance.ageGuidance.nutritionTips.map((tip, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          {/* Balanced Whole-Food Ideas Card */}
          <Card className="p-6 border-rule bg-white shadow-xs">
            <div className="mb-4">
              <span className="font-mono text-xs uppercase tracking-wider text-emerald-700 font-semibold">
                Whole-Food Inspiration
              </span>
              <h3 className="mt-1 font-display text-lg font-bold text-ink">
                Balanced Meal & Snack Concepts
              </h3>
              <p className="text-xs text-muted">
                Transparent food suggestions aligned with {DIETARY_PATTERN_LABELS[profile?.dietaryPattern ?? 'unrestricted'].label} patterns
                {profile?.restrictions.length ? ` and excluding stated restrictions` : ''}.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {guidance.mealIdeas.map((meal, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-rule bg-paper p-4 flex flex-col justify-between"
                >
                  <div>
                    <span className="text-[10px] font-mono uppercase font-semibold text-emerald-700 block mb-1">
                      {meal.category === 'lunch_dinner' ? 'Main Meal' : meal.category}
                    </span>
                    <h4 className="font-display text-sm font-bold text-ink mb-1.5">
                      {meal.title}
                    </h4>
                    <p className="text-xs text-muted leading-relaxed">
                      {meal.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Mandatory Medical & Dietetic Disclaimers */}
          <div className="rounded-xl border border-rule bg-paper p-5 text-xs text-muted space-y-2">
            <div className="flex items-center gap-2 font-semibold text-ink text-xs">
              <ShieldAlert className="h-4 w-4 text-teal" />
              <span>Medical & Clinical Disclaimers</span>
            </div>
            {guidance.disclaimers.map((d, i) => (
              <p key={i} className="text-[11px] leading-relaxed">
                • {d}
              </p>
            ))}
            <p className="text-[11px] text-teal pt-1 font-medium border-t border-rule/50">
              Note: General wellness suggestions are separate from licensed clinician rehabilitation plans assigned in the clinical portal.
            </p>
          </div>
        </div>
      )}
    </section>
  )
}
