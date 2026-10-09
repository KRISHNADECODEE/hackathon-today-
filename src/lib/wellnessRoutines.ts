/**
 * Curated short guided movement sessions and desk breaks for busy office workers
 * and everyday wellness users.
 * Each routine links directly to real movement evaluation in KinectIQ's vision engine.
 */

export type WellnessRoutine = {
  id: string
  title: string
  subtitle: string
  durationMinutes: number
  targetArea: string
  exerciseId: string
  recommendedTarget: string
  description: string
  instructions: string[]
  benefits: string[]
  iconName: 'posture' | 'stand' | 'reach' | 'bend' | 'calf'
}

export const WELLNESS_ROUTINES: WellnessRoutine[] = [
  {
    id: 'neck-posture-reset',
    title: 'Neck & Posture Reset',
    subtitle: 'Re-align your cervical spine and release trapezius tension',
    durationMinutes: 2,
    targetArea: 'Neck & Upper Back',
    exerciseId: 'posture',
    recommendedTarget: '2 minutes upright awareness (≤ 20° forward angle)',
    description: 'A 2-minute seated alignment check that measures head-forward drift and reminds you to sit tall with your shoulders relaxed.',
    instructions: [
      'Sit side-on to your webcam in your normal desk chair.',
      'Ensure your ear and shoulder are visible in the camera frame.',
      'Gently draw your chin backward (cervical retraction) and relax your shoulders.',
      'The engine monitors your alignment and alerts if your head drifts forward past 25°.',
    ],
    benefits: [
      'Reduces cervical spine compression from screen hunching',
      'Encourages conscious posture correction throughout the workday',
      'No need to leave your desk or change clothes',
    ],
    iconName: 'posture',
  },
  {
    id: 'chair-sit-to-stand-boost',
    title: 'Sit-to-Stand Circulation Boost',
    subtitle: 'Wake up your glutes, open hip flexors, and stimulate venous return',
    durationMinutes: 2,
    targetArea: 'Hips, Quads & Glutes',
    exerciseId: 'sit_to_stand',
    recommendedTarget: '8 to 12 controlled repetitions',
    description: 'Reverse the stiffness of prolonged sitting with functional sit-to-stand repetitions, activating major lower-body muscle groups.',
    instructions: [
      'Position a stable chair without wheels side-on to your webcam.',
      'Sit tall near the front edge of the seat, feet flat on the floor.',
      'Stand up fully until your hips are straight, pausing briefly at the top.',
      'Control your descent back onto the seat without plopping down.',
    ],
    benefits: [
      'Counteracts hip flexor tightness and inactive glutes',
      'Increases blood flow to the brain and lower extremities',
      'Strengthens functional sit-to-stand motor control',
    ],
    iconName: 'stand',
  },
  {
    id: 'overhead-reach-decompression',
    title: 'Overhead Reach & Ribcage Decompression',
    subtitle: 'Expand your chest, open your shoulders, and elongate your spine',
    durationMinutes: 2,
    targetArea: 'Thoracic Spine & Shoulders',
    exerciseId: 'arm_raise',
    recommendedTarget: '8 to 10 slow bilateral reaches',
    description: 'Bilateral overhead arm raises that decompress the thoracic spine and counteract forward-slumping computer posture.',
    instructions: [
      'Stand facing the webcam with your feet hip-width apart.',
      'Raise both arms out to the sides and up toward the ceiling.',
      'Inhale deeply as you reach upward, holding for 1 second at the top.',
      'Lower both arms back to your sides with a controlled exhale.',
    ],
    benefits: [
      'Restores thoracic extension after prolonged desk work',
      'Improves diaphragm expansion and oxygen uptake',
      'Symmetrically mobilizes both shoulder joints',
    ],
    iconName: 'reach',
  },
  {
    id: 'spine-side-bend-stretch',
    title: 'Lateral Spine Mobilization',
    subtitle: 'Side bends to relieve lower-back tension and stretch the obliques',
    durationMinutes: 2,
    targetArea: 'Lateral Trunk & Lower Back',
    exerciseId: 'trunk_side_bend',
    recommendedTarget: '10 alternating repetitions (5 per side)',
    description: 'Gentle lateral flexion of the spine to mobilize quadratus lumborum and lateral core muscles stiffened by desk sitting.',
    instructions: [
      'Stand tall facing the webcam with your arms at your sides.',
      'Slide your left hand down your outer thigh toward your knee.',
      'Return to upright, then slide your right hand down the opposite side.',
      'Keep your chest squarely facing forward without twisting or leaning forward.',
    ],
    benefits: [
      'Alleviates unilateral spinal compression and pelvic imbalance',
      'Stretches the quadratus lumborum and lateral abdominal wall',
      'Restores lateral mobility with real-time trunk angle tracking',
    ],
    iconName: 'bend',
  },
  {
    id: 'lower-leg-calf-pump',
    title: 'Calf Muscle Pump & Balance Refresh',
    subtitle: 'Stimulate venous circulation in the lower legs and ankles',
    durationMinutes: 2,
    targetArea: 'Calves, Feet & Ankles',
    exerciseId: 'heel_raise',
    recommendedTarget: '12 to 15 controlled heel raises',
    description: 'Rise up onto your toes to activate the calf muscle venous pump, moving pooled blood back up toward the heart after hours of sitting.',
    instructions: [
      'Stand side-on to the webcam, holding the edge of your desk lightly for balance.',
      'Rise high onto the balls of your feet, lifting your heels off the floor.',
      'Hold at the peak for 1 second, then lower your heels slowly back to the ground.',
    ],
    benefits: [
      'Activates the physiological calf muscle pump to prevent venous stasis',
      'Reduces lower leg heaviness and foot swelling during long desk shifts',
      'Strengthens ankle stabilizing musculature',
    ],
    iconName: 'calf',
  },
]

export function routineById(id: string | null | undefined): WellnessRoutine | undefined {
  return WELLNESS_ROUTINES.find((r) => r.id === id)
}
