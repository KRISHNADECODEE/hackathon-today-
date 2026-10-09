import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'

// Wasm is copied from node_modules on install; the model is the official
// pose_landmarker_lite.task, served locally so the demo does not need a CDN.
const WASM = '/mediapipe/wasm'
const MODEL = '/mediapipe/pose_landmarker_lite.task'

let instance: Promise<PoseLandmarker> | null = null

async function create(): Promise<PoseLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(WASM)
  const opts = (delegate: 'GPU' | 'CPU') => ({
    baseOptions: { modelAssetPath: MODEL, delegate },
    runningMode: 'VIDEO' as const,
    numPoses: 1,
  })
  try {
    return await PoseLandmarker.createFromOptions(fileset, opts('GPU'))
  } catch {
    return await PoseLandmarker.createFromOptions(fileset, opts('CPU'))
  }
}

/** Loads the model once and reuses it for the lifetime of the page. */
export function getPoseLandmarker(): Promise<PoseLandmarker> {
  instance ??= create().catch((e) => {
    instance = null // allow retry after a failure
    throw e
  })
  return instance
}

export const POSE_CONNECTIONS = PoseLandmarker.POSE_CONNECTIONS
