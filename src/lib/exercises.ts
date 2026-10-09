// Exercise registry. Each entry defines its own measurement, rep thresholds and form checks.
// All thresholds are prototype values chosen for demonstration, NOT clinically prescribed.
// Angles are measured in the 2D image plane from webcam landmarks, not calibrated goniometry.
import { clamp, jointAngle, midpoint, sub, toDegrees, vectorAngle, type Point } from './geometry'
import type { CheckDef, Ctx, Ref, TrackDef } from './engine'

export type Category = 'upper' | 'lower' | 'mobility'
export type View = 'front' | 'side' | 'either'
export type Status = 'prototype' | 'experimental' | 'unsupported'

export type ExerciseDef = {
  id: string
  version: number
  name: string
  category: Category
  region: string
  view: View
  sided: boolean // user picks left or right
  equipment: string
  minutes: number
  summary: string
  instructions: string[]
  safety: string[]
  limitations: string[]
  status: Status
  track?: TrackDef // absent when the movement cannot be tracked reliably with one webcam
}

export const CATEGORY_LABEL: Record<Category, string> = { upper: 'Upper body', lower: 'Lower body', mobility: 'Mobility & posture' }
export const VIEW_LABEL: Record<View, string> = { front: 'Face the camera', side: 'Side to the camera', either: 'Front or side' }
export const STATUS_LABEL: Record<Status, string> = {
  prototype: 'Prototype tracking',
  experimental: 'Experimental tracking',
  unsupported: 'Not trackable with one webcam',
}

// ---------------------------------------------------------------- geometry on landmarks

const DOWN = { x: 0, y: 1 }
const UP = { x: 0, y: -1 }
const ang = (c: Ctx, a: Ref, b: Ref, d: Ref) => jointAngle(c.p(a), c.p(b), c.p(d))
/** Angle of the segment from→to measured from straight down (0° = hanging vertically). */
const fromDown = (c: Ctx, from: Ref, to: Ref) => vectorAngle(sub(c.p(to), c.p(from)), DOWN)
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const mid = (c: Ctx, a: Ref, b: Ref) => midpoint(c.p(a), c.p(b))
/** Signed torso lean from vertical in degrees (hip → shoulder). */
function lean(c: Ctx, view: View): number {
  const [sh, hp] = view === 'front' ? [mid(c, 'L.shoulder', 'R.shoulder'), mid(c, 'L.hip', 'R.hip')] : [c.p('S.shoulder'), c.p('S.hip')]
  return toDegrees(Math.atan2(sh.x - hp.x, hp.y - sh.y))
}
const TORSO_FRONT: Ref[] = ['L.shoulder', 'R.shoulder', 'L.hip', 'R.hip']

// ---------------------------------------------------------------- reusable form checks

const trunkLean = (view: View, warn: number, advice = 'Keep your torso upright and move only the working limb.'): CheckDef => ({
  id: 'trunk_lean', label: 'Trunk lean', advice, voice: 'Keep your torso upright', unit: 'deg',
  needs: view === 'front' ? TORSO_FRONT : ['S.shoulder', 'S.hip'],
  baseline: (c) => lean(c, view),
  value: (c, b) => (b === null ? null : Math.abs(lean(c, view) - b)),
  warnAbove: warn, clearBelow: warn - 3, persistMs: 400,
})

const shoulderTilt = (c: Ctx) => toDegrees(Math.atan2(c.p('R.shoulder').y - c.p('L.shoulder').y, c.p('R.shoulder').x - c.p('L.shoulder').x))
const shoulderLevel = (warn: number): CheckDef => ({
  id: 'shoulder_hike', label: 'Uneven shoulders', advice: 'Keep both shoulders level — avoid shrugging the working shoulder.', voice: 'Relax your shoulders', unit: 'deg',
  needs: ['L.shoulder', 'R.shoulder'],
  baseline: shoulderTilt,
  value: (c, b) => (b === null ? null : Math.abs(shoulderTilt(c) - b)),
  warnAbove: warn, clearBelow: warn - 3, persistMs: 400,
})

const elbowDrift = (warn: number): CheckDef => ({
  id: 'elbow_drift', label: 'Elbow moving away', advice: 'Keep your upper arm still and your elbow close to your side.', voice: 'Keep your elbow by your side', unit: 'deg',
  needs: ['S.shoulder', 'S.elbow', 'S.hip'],
  value: (c) => ang(c, 'S.hip', 'S.shoulder', 'S.elbow'),
  warnAbove: warn, clearBelow: warn - 5, persistMs: 400,
})

const bodyLine = (warn: number): CheckDef => ({
  id: 'body_line', label: 'Hips sagging or piking', advice: 'Keep a straight line from shoulders through hips to ankles.', voice: 'Keep your body straight', unit: 'deg',
  needs: ['S.shoulder', 'S.hip', 'S.ankle'],
  value: (c) => { const a = ang(c, 'S.shoulder', 'S.hip', 'S.ankle'); return a === null ? null : 180 - a },
  warnAbove: warn, clearBelow: warn - 5, persistMs: 500,
})

const abduction = (c: Ctx, s: 'L' | 'R') => ang(c, `${s}.hip`, `${s}.shoulder`, `${s}.elbow`)
const armSymmetry = (warn: number): CheckDef => ({
  id: 'arm_asymmetry', label: 'Arms uneven', advice: 'Raise both arms together to the same height.', voice: 'Raise both arms evenly', unit: 'deg',
  needs: ['L.hip', 'L.shoulder', 'L.elbow', 'R.hip', 'R.shoulder', 'R.elbow'],
  value: (c) => { const l = abduction(c, 'L'); const r = abduction(c, 'R'); return l === null || r === null ? null : Math.abs(l - r) },
  warnAbove: warn, clearBelow: warn - 5, persistMs: 500,
})

const shoulderWidth = (c: Ctx) => dist(c.p('L.shoulder'), c.p('R.shoulder'))
const balanceSway = (warn: number): CheckDef => ({
  id: 'balance_sway', label: 'Large sway', advice: 'You are swaying noticeably. Hold your support and lower your foot if you feel unsteady.', voice: 'Steady yourself, use your support', unit: 'pct',
  needs: TORSO_FRONT,
  baseline: (c) => mid(c, 'L.hip', 'R.hip').x,
  value: (c, b) => { const w = shoulderWidth(c); return b === null || w < 1e-6 ? null : (Math.abs(mid(c, 'L.hip', 'R.hip').x - b) / w) * 100 },
  warnAbove: warn, clearBelow: warn - 5, persistMs: 300,
})

const neckForward = (c: Ctx) => vectorAngle(sub(c.p('S.ear'), c.p('S.shoulder')), UP)
const forwardHead = (warn: number): CheckDef => ({
  id: 'forward_head', label: 'Head forward', advice: 'Your head is drifting forward of your shoulders. Gently draw your chin back and sit tall.', voice: 'Sit tall and bring your head back', unit: 'deg',
  needs: ['S.ear', 'S.shoulder'],
  value: neckForward,
  warnAbove: warn, clearBelow: warn - 5, persistMs: 2000,
})

const STOP = 'Stop if you feel pain, dizziness or unusual discomfort.'
const CUES = { incomplete: 'Go a little further if comfortable', tooFast: 'Slow down' }

// ---------------------------------------------------------------- the library

export const EXERCISES: ExerciseDef[] = [
  {
    id: 'shoulder_abduction', version: 2, name: 'Shoulder abduction', category: 'upper', region: 'Shoulder', view: 'front', sided: true,
    equipment: 'None', minutes: 3, status: 'prototype',
    summary: 'Raise one arm out to the side and lower it with control.',
    instructions: ['Stand facing the camera with your head, shoulders and hips in view.', 'Start with your arms relaxed at your sides.', 'Keeping the elbow straight, raise the arm out to the side past shoulder height.', 'Lower it fully before the next rep.'],
    safety: ['Only move within a comfortable range.', STOP],
    limitations: ['Measured as the 2D angle between the upper arm and the torso line.', 'Leaning or turning away from the camera changes the reading.'],
    track: {
      required: ['S.shoulder', 'S.elbow', 'S.hip', ...TORSO_FRONT],
      metric: { label: 'Shoulder elevation', unit: 'deg', value: (c) => ang(c, 'S.hip', 'S.shoulder', 'S.elbow') },
      mode: 'reps',
      reps: { direction: 'up', rest: 30, start: 40, target: 80, hysteresis: 8, minRepMs: 800 },
      checks: [trunkLean('front', 10), shoulderLevel(10)],
      startHint: 'Stand tall with your arms relaxed at your sides.',
      cues: { ready: 'Ready. Raise your arm out to the side.', ...CUES },
    },
  },
  {
    id: 'shoulder_flexion', version: 1, name: 'Shoulder flexion', category: 'upper', region: 'Shoulder', view: 'side', sided: true,
    equipment: 'None', minutes: 3, status: 'prototype',
    summary: 'Raise one arm forward and up in front of you.',
    instructions: ['Stand side-on to the camera with the working arm nearest to it.', 'Start with the arm relaxed at your side.', 'Raise the straight arm forward and up past shoulder height.', 'Lower it fully before the next rep.'],
    safety: ['Avoid arching your back to get the arm higher.', STOP],
    limitations: ['Measured as the 2D angle between upper arm and torso from the side.', 'The far arm is often hidden, so only the arm nearest the camera is tracked.'],
    track: {
      required: ['S.shoulder', 'S.elbow', 'S.hip'],
      metric: { label: 'Shoulder flexion', unit: 'deg', value: (c) => ang(c, 'S.hip', 'S.shoulder', 'S.elbow') },
      mode: 'reps',
      reps: { direction: 'up', rest: 30, start: 40, target: 90, hysteresis: 8, minRepMs: 800 },
      checks: [trunkLean('side', 10, 'Keep your back still — avoid leaning back to lift higher.')],
      startHint: 'Stand side-on with your arm relaxed at your side.',
      cues: { ready: 'Ready. Raise your arm forward and up.', ...CUES },
    },
  },
  {
    id: 'shoulder_external_rotation', version: 1, name: 'Shoulder external rotation', category: 'upper', region: 'Shoulder', view: 'front', sided: true,
    equipment: 'Optional resistance band', minutes: 3, status: 'unsupported',
    summary: 'Rotate the forearm outward with the elbow bent at your side.',
    instructions: ['Elbow bent to 90° and tucked against your side.', 'Rotate the forearm outward, keeping the elbow in place.', 'Return slowly.'],
    safety: ['Keep the elbow against your side.', STOP],
    limitations: ['This rotation happens mostly toward and away from the camera. A single webcam cannot measure it reliably from the front or the side, so KinectIQ does not track it yet. A top-down camera or depth sensor would be needed.'],
  },
  {
    id: 'elbow_flexion', version: 1, name: 'Elbow flexion and extension', category: 'upper', region: 'Elbow', view: 'either', sided: true,
    equipment: 'None', minutes: 3, status: 'prototype',
    summary: 'Bend and straighten one elbow through its comfortable range.',
    instructions: ['Stand or sit with the working arm visible to the camera.', 'Start with the arm straight by your side.', 'Bend the elbow to bring your hand toward your shoulder.', 'Straighten it fully before the next rep.'],
    safety: ['Move slowly and avoid forcing the end of the range.', STOP],
    limitations: ['Measured as the 2D angle at the elbow; a smaller angle means more bend.', 'Pointing the forearm toward the camera hides the bend and under-reads the angle.'],
    track: {
      required: ['S.shoulder', 'S.elbow', 'S.wrist'],
      metric: { label: 'Elbow angle', unit: 'deg', value: (c) => ang(c, 'S.shoulder', 'S.elbow', 'S.wrist') },
      mode: 'reps',
      reps: { direction: 'down', rest: 130, start: 115, target: 70, hysteresis: 8, minRepMs: 600 },
      checks: [],
      startHint: 'Let the arm hang straight down by your side.',
      cues: { ready: 'Ready. Bend your elbow.', ...CUES },
    },
  },
  {
    id: 'biceps_curl', version: 1, name: 'Biceps curl', category: 'upper', region: 'Elbow', view: 'either', sided: true,
    equipment: 'Optional light weight', minutes: 3, status: 'prototype',
    summary: 'Curl the hand up toward the shoulder while the upper arm stays close to your side.',
    instructions: [
      'Position yourself facing the camera or slightly angled (30°–45°) with your working arm in clear view.',
      'Keep your upper arm still and your elbow tucked close to your torso.',
      'Curl your hand smoothly up toward your shoulder, then lower it completely until your arm is extended.',
    ],
    safety: ['Use a weight you can control without swinging.', STOP],
    limitations: [
      'Measured as the 2D elbow angle (shoulder–elbow–wrist).',
      'Keep your wrist and elbow unblocked by loose clothing or desk obstructions.',
      'Swinging the upper arm or torso is flagged by form checks.',
    ],
    track: {
      required: ['S.shoulder', 'S.elbow', 'S.wrist'],
      metric: { label: 'Elbow angle', unit: 'deg', value: (c) => ang(c, 'S.shoulder', 'S.elbow', 'S.wrist') },
      mode: 'reps',
      reps: { direction: 'down', rest: 130, start: 115, target: 75, hysteresis: 10, minRepMs: 600 },
      checks: [elbowDrift(30), trunkLean('side', 12, 'Keep your body still — avoid swinging to lift the weight.')],
      startHint: 'Let the arm hang straight down with your elbow at your side.',
      cues: { ready: 'Ready. Curl up.', ...CUES },
    },
  },
  {
    id: 'wall_pushup', version: 1, name: 'Wall push-up', category: 'upper', region: 'Chest and arms', view: 'side', sided: true,
    equipment: 'A sturdy wall', minutes: 3, status: 'prototype',
    summary: 'Lower your chest toward a wall and push back.',
    instructions: ['Stand side-on to the camera, arm\'s length from a wall, hands on the wall at shoulder height.', 'Bend the elbows to bring your chest toward the wall.', 'Push back until the arms are straight.'],
    safety: ['Make sure your feet will not slip.', STOP],
    limitations: ['Measured as the 2D elbow angle of the arm nearest the camera.', 'Your arm must stay visible; standing too close to the wall can hide it.'],
    track: {
      required: ['S.shoulder', 'S.elbow', 'S.wrist', 'S.hip', 'S.ankle'],
      metric: { label: 'Elbow angle', unit: 'deg', value: (c) => ang(c, 'S.shoulder', 'S.elbow', 'S.wrist') },
      mode: 'reps',
      reps: { direction: 'down', rest: 155, start: 145, target: 110, hysteresis: 6, minRepMs: 900 },
      checks: [bodyLine(20)],
      startHint: 'Hands on the wall, arms straight, body in a straight line.',
      cues: { ready: 'Ready. Bend your elbows toward the wall.', ...CUES },
    },
  },
  {
    id: 'arm_raise', version: 1, name: 'Arm raise', category: 'upper', region: 'Shoulders', view: 'front', sided: false,
    equipment: 'None', minutes: 3, status: 'prototype',
    summary: 'Raise both arms out and up overhead together.',
    instructions: ['Face the camera with arms relaxed at your sides.', 'Raise both arms out to the sides and up as high as is comfortable.', 'Lower both arms fully.'],
    safety: ['Only raise as high as is comfortable.', STOP],
    limitations: ['The rep is measured on the lower of the two arms, so both must rise.', 'Arms raised in front of the body rather than to the side may under-read.'],
    track: {
      required: ['L.shoulder', 'L.elbow', 'L.hip', 'R.shoulder', 'R.elbow', 'R.hip'],
      metric: {
        label: 'Lower arm elevation', unit: 'deg',
        value: (c) => { const l = abduction(c, 'L'); const r = abduction(c, 'R'); return l === null || r === null ? null : Math.min(l, r) },
      },
      mode: 'reps',
      reps: { direction: 'up', rest: 30, start: 45, target: 140, hysteresis: 10, minRepMs: 1000 },
      checks: [armSymmetry(20), trunkLean('front', 10)],
      startHint: 'Stand tall with both arms relaxed at your sides.',
      cues: { ready: 'Ready. Raise both arms.', ...CUES },
    },
  },
  {
    id: 'sit_to_stand', version: 1, name: 'Sit-to-stand', category: 'lower', region: 'Hips and knees', view: 'side', sided: true,
    equipment: 'A stable chair without wheels', minutes: 3, status: 'prototype',
    summary: 'Stand up from a chair and sit back down with control.',
    instructions: ['Place a stable chair side-on to the camera and sit near the front edge.', 'Make sure your whole body, including feet, is visible.', 'Stand up fully, then sit back down slowly.'],
    safety: ['Use a chair that cannot roll. Keep a support nearby.', STOP],
    limitations: ['Measured as the 2D hip angle (shoulder–hip–knee) from the side.', 'Each rep must start seated.'],
    track: {
      required: ['S.shoulder', 'S.hip', 'S.knee'],
      metric: { label: 'Hip angle', unit: 'deg', value: (c) => ang(c, 'S.shoulder', 'S.hip', 'S.knee') },
      mode: 'reps',
      reps: { direction: 'up', rest: 115, start: 125, target: 160, hysteresis: 8, minRepMs: 1200 },
      checks: [],
      startHint: 'Sit on the chair, side-on to the camera.',
      cues: { ready: 'Ready. Stand up.', ...CUES },
    },
  },
  {
    id: 'squat', version: 1, name: 'Bodyweight squat', category: 'lower', region: 'Hips and knees', view: 'side', sided: true,
    equipment: 'None (a support to hold is recommended)', minutes: 3, status: 'prototype',
    summary: 'Bend the knees and hips to lower down, then stand back up.',
    instructions: ['Stand side-on to the camera with feet hip-width apart.', 'Push your hips back and bend your knees to lower down.', 'Stand back up fully.'],
    safety: ['Only go as low as is comfortable. Hold a support if you need it.', STOP],
    limitations: ['Measured as the 2D knee angle of the leg nearest the camera.', 'Knee alignment (knees caving in) is not checked from the side.'],
    track: {
      required: ['S.hip', 'S.knee', 'S.ankle', 'S.shoulder'],
      metric: { label: 'Knee angle', unit: 'deg', value: (c) => ang(c, 'S.hip', 'S.knee', 'S.ankle') },
      mode: 'reps',
      reps: { direction: 'down', rest: 160, start: 150, target: 110, hysteresis: 8, minRepMs: 1000 },
      checks: [trunkLean('side', 45, 'You are leaning far forward. Keep your chest up as you lower.')],
      startHint: 'Stand tall, side-on to the camera.',
      cues: { ready: 'Ready. Lower into a squat.', ...CUES },
    },
  },
  {
    id: 'knee_extension', version: 1, name: 'Knee flexion and extension (seated)', category: 'lower', region: 'Knee', view: 'side', sided: true,
    equipment: 'A chair', minutes: 3, status: 'prototype',
    summary: 'From sitting, straighten one knee and bend it back down.',
    instructions: ['Sit side-on to the camera with the working leg nearest it.', 'Start with the knee bent and foot on the floor.', 'Straighten the knee, lifting the foot, then lower it back down.'],
    safety: ['Keep your back supported against the chair.', STOP],
    limitations: ['Measured as the 2D knee angle (hip–knee–ankle) from the side.'],
    track: {
      required: ['S.hip', 'S.knee', 'S.ankle', 'S.shoulder'],
      metric: { label: 'Knee angle', unit: 'deg', value: (c) => ang(c, 'S.hip', 'S.knee', 'S.ankle') },
      mode: 'reps',
      reps: { direction: 'up', rest: 110, start: 120, target: 155, hysteresis: 8, minRepMs: 800 },
      checks: [trunkLean('side', 15, 'Keep your back against the chair — avoid leaning back.')],
      startHint: 'Sit with the knee bent and the foot on the floor.',
      cues: { ready: 'Ready. Straighten your knee.', ...CUES },
    },
  },
  {
    id: 'hip_abduction', version: 1, name: 'Standing hip abduction', category: 'lower', region: 'Hip', view: 'front', sided: true,
    equipment: 'Something stable to hold', minutes: 3, status: 'prototype',
    summary: 'Lift one straight leg out to the side.',
    instructions: ['Face the camera and hold a support with one hand.', 'Keeping the leg straight and toes forward, lift it out to the side.', 'Lower it back to the start.'],
    safety: ['Hold a support for balance.', STOP],
    limitations: ['Measured as the 2D angle of the thigh from vertical.', 'Leaning the trunk sideways is flagged because it can mimic leg lift.'],
    track: {
      required: ['S.hip', 'S.knee', ...TORSO_FRONT],
      metric: { label: 'Leg angle from vertical', unit: 'deg', value: (c) => fromDown(c, 'S.hip', 'S.knee') },
      mode: 'reps',
      reps: { direction: 'up', rest: 8, start: 12, target: 25, hysteresis: 4, minRepMs: 800 },
      checks: [trunkLean('front', 10, 'Keep your trunk upright — let the leg do the work.')],
      startHint: 'Stand tall facing the camera, feet together.',
      cues: { ready: 'Ready. Lift your leg out to the side.', ...CUES },
    },
  },
  {
    id: 'knee_raise', version: 1, name: 'Standing knee raise', category: 'lower', region: 'Hip', view: 'side', sided: true,
    equipment: 'Something stable to hold', minutes: 3, status: 'prototype',
    summary: 'Lift one knee up in front of you, then lower it.',
    instructions: ['Stand side-on to the camera holding a support.', 'Lift the knee nearest the camera up toward hip height.', 'Lower the foot back to the floor.'],
    safety: ['Hold a support for balance.', STOP],
    limitations: ['Measured as the 2D hip angle (shoulder–hip–knee) from the side.'],
    track: {
      required: ['S.shoulder', 'S.hip', 'S.knee'],
      metric: { label: 'Hip angle', unit: 'deg', value: (c) => ang(c, 'S.shoulder', 'S.hip', 'S.knee') },
      mode: 'reps',
      reps: { direction: 'down', rest: 160, start: 150, target: 110, hysteresis: 8, minRepMs: 800 },
      checks: [trunkLean('side', 15, 'Stay tall — avoid leaning back as you lift.')],
      startHint: 'Stand tall, side-on, both feet down.',
      cues: { ready: 'Ready. Lift your knee.', ...CUES },
    },
  },
  {
    id: 'heel_raise', version: 1, name: 'Heel raise (calf raise)', category: 'lower', region: 'Ankle and calf', view: 'side', sided: true,
    equipment: 'Something stable to hold', minutes: 3, status: 'experimental',
    summary: 'Rise up onto your toes and lower back down.',
    instructions: ['Stand side-on to the camera holding a support, feet fully visible.', 'Rise up onto the balls of your feet.', 'Lower your heels to the floor.'],
    safety: ['Hold a support for balance.', STOP],
    limitations: ['Heel lift is small in the image and measured relative to the toes, as a percentage of leg length. Expect more noise than angle-based exercises.', 'Needs good lighting on the feet and shoes that contrast with the floor.'],
    track: {
      required: ['S.heel', 'S.foot', 'S.hip', 'S.ankle'],
      emaAlpha: 0.4,
      metric: {
        label: 'Heel lift', unit: 'pct',
        baseline: (c) => c.p('S.foot').y - c.p('S.heel').y,
        value: (c, b) => {
          const leg = dist(c.p('S.hip'), c.p('S.ankle'))
          return b === null || leg < 1e-6 ? null : ((c.p('S.foot').y - c.p('S.heel').y - b) / leg) * 100
        },
      },
      mode: 'reps',
      reps: { direction: 'up', rest: 1, start: 1.5, target: 3, hysteresis: 0.5, minRepMs: 800 },
      checks: [],
      startHint: 'Stand flat-footed, side-on, holding your support.',
      cues: { ready: 'Ready. Rise onto your toes.', ...CUES },
    },
  },
  {
    id: 'leg_extension', version: 1, name: 'Supported standing leg extension', category: 'lower', region: 'Hip', view: 'side', sided: true,
    equipment: 'Something stable to hold', minutes: 3, status: 'experimental',
    summary: 'Move one straight leg backward while holding a support.',
    instructions: ['Stand side-on to the camera holding a support in front of you.', 'Keeping the leg straight, move it backward a short distance.', 'Return it to the start.'],
    safety: ['Keep the movement small and hold your support.', STOP],
    limitations: ['Measured as the 2D thigh angle from vertical. The range is small, so tracking noise matters more.', 'Forward and backward leg movement both read as positive angles.'],
    track: {
      required: ['S.hip', 'S.knee', 'S.shoulder'],
      metric: { label: 'Leg angle from vertical', unit: 'deg', value: (c) => fromDown(c, 'S.hip', 'S.knee') },
      mode: 'reps',
      reps: { direction: 'up', rest: 5, start: 8, target: 15, hysteresis: 3, minRepMs: 800 },
      checks: [trunkLean('side', 10, 'Keep your trunk upright — avoid tipping forward.')],
      startHint: 'Stand tall, side-on, both feet down.',
      cues: { ready: 'Ready. Move your leg back.', ...CUES },
    },
  },
  {
    id: 'posture', version: 1, name: 'Neck and upper-body posture', category: 'mobility', region: 'Neck and upper back', view: 'side', sided: true,
    equipment: 'A chair', minutes: 2, status: 'prototype',
    summary: 'Monitor how far your head sits forward of your shoulders while seated.',
    instructions: ['Sit side-on to the camera so your ear and shoulder are visible.', 'Sit as you normally would; KinectIQ measures the time spent upright.'],
    safety: ['This is a posture awareness aid, not a diagnosis.', STOP],
    limitations: ['Measured as the 2D angle of the ear–shoulder line from vertical. Hair, hoods and collars can shift the ear and shoulder landmarks.'],
    track: {
      required: ['S.ear', 'S.shoulder'],
      metric: { label: 'Head-forward angle', unit: 'deg', value: neckForward },
      mode: 'monitor',
      monitor: { goodBelow: 20 },
      checks: [forwardHead(25)],
      startHint: 'Sit side-on to the camera.',
      cues: { ready: 'Monitoring your posture.', ...CUES },
    },
  },
  {
    id: 'trunk_side_bend', version: 1, name: 'Trunk side bending', category: 'mobility', region: 'Trunk', view: 'front', sided: false,
    equipment: 'None', minutes: 3, status: 'prototype',
    summary: 'Bend sideways at the waist, alternating sides.',
    instructions: ['Face the camera standing tall.', 'Slide one hand down the side of your leg to bend sideways.', 'Return to upright, then bend to the other side. Each bend counts as one rep.'],
    safety: ['Keep the movement slow and within a comfortable range.', STOP],
    limitations: ['Measured as the 2D tilt of the shoulder–hip line from your starting posture.', 'Shifting the hips sideways also changes the reading.'],
    track: {
      required: TORSO_FRONT,
      metric: { label: 'Side bend', unit: 'deg', baseline: (c) => lean(c, 'front'), value: (c, b) => (b === null ? null : Math.abs(lean(c, 'front') - b)) },
      mode: 'reps',
      reps: { direction: 'up', rest: 5, start: 8, target: 15, hysteresis: 3, minRepMs: 1000 },
      checks: [],
      startHint: 'Stand tall facing the camera.',
      cues: { ready: 'Ready. Bend to one side.', ...CUES },
    },
  },
  {
    id: 'trunk_rotation', version: 1, name: 'Trunk rotation', category: 'mobility', region: 'Trunk', view: 'front', sided: false,
    equipment: 'A chair (seated is easier to track)', minutes: 3, status: 'experimental',
    summary: 'Turn your shoulders to one side and back, alternating sides.',
    instructions: ['Sit or stand facing the camera.', 'Keeping hips still, turn your shoulders to one side.', 'Return to face the camera, then turn to the other side.'],
    safety: ['Turn gently; do not force the end of the range.', STOP],
    limitations: ['Estimated from how much your shoulders appear to narrow, compared with your starting width. Direction is not distinguished, and leaning toward or away from the camera distorts it.'],
    track: {
      required: ['L.shoulder', 'R.shoulder'],
      metric: {
        label: 'Estimated rotation', unit: 'deg',
        baseline: shoulderWidth,
        value: (c, b) => (b === null || b < 1e-6 ? null : toDegrees(Math.acos(clamp(shoulderWidth(c) / b, 0, 1)))),
      },
      mode: 'reps',
      reps: { direction: 'up', rest: 12, start: 18, target: 30, hysteresis: 5, minRepMs: 1000 },
      checks: [],
      startHint: 'Face the camera squarely and keep still.',
      cues: { ready: 'Ready. Turn your shoulders.', ...CUES },
    },
  },
  {
    id: 'balance', version: 1, name: 'Standing balance observation', category: 'mobility', region: 'Whole body', view: 'front', sided: false,
    equipment: 'Something stable within reach', minutes: 2, status: 'prototype',
    summary: 'Stand on one leg and see how long you hold it and how much you sway.',
    instructions: ['Face the camera with your whole body in view and a support within reach.', 'Lift one foot slightly off the floor and hold.', 'Each hold of 3 seconds or more is recorded.'],
    safety: ['Keep a support within reach and use it whenever you need to.', 'Stop if you feel dizzy or unsteady.'],
    limitations: ['A foot counts as lifted when one ankle is clearly higher than the other in the image.', 'Sway is the sideways movement of the hips, relative to shoulder width — an observation, not a balance score.'],
    track: {
      required: ['L.ankle', 'R.ankle', 'L.hip', 'R.hip', 'L.shoulder', 'R.shoulder'],
      metric: { label: 'Current hold', unit: 's', value: () => 0 },
      mode: 'hold',
      hold: {
        inPosition: (c) => {
          const leg = (dist(c.p('L.hip'), c.p('L.ankle')) + dist(c.p('R.hip'), c.p('R.ankle'))) / 2
          return leg > 1e-6 && Math.abs(c.p('L.ankle').y - c.p('R.ankle').y) / leg > 0.06
        },
        minHoldMs: 3000,
        targetHoldMs: 30000,
      },
      checks: [balanceSway(15)],
      startHint: 'Stand on both feet facing the camera.',
      cues: { ready: 'Ready. Lift one foot when you are steady.', ...CUES },
    },
  },
]

export const exerciseById = (id: string | undefined) => EXERCISES.find((e) => e.id === id)
