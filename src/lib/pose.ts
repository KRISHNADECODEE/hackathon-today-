import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'

const BASE = typeof window !== 'undefined' && window.location.pathname.startsWith('/hackathon-today-')
  ? '/hackathon-today-'
  : ''

const LOCAL_WASM = `${BASE}/mediapipe/wasm`
const LOCAL_MODEL = `${BASE}/mediapipe/pose_landmarker_lite.task`

const CDN_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
const CDN_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

let instance: Promise<PoseLandmarker> | null = null

async function loadLandmarker(wasmPath: string, modelPath: string): Promise<PoseLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(wasmPath)
  const opts = (delegate: 'GPU' | 'CPU') => ({
    baseOptions: { modelAssetPath: modelPath, delegate },
    runningMode: 'VIDEO' as const,
    numPoses: 1,
  })
  try {
    return await PoseLandmarker.createFromOptions(fileset, opts('GPU'))
  } catch {
    return await PoseLandmarker.createFromOptions(fileset, opts('CPU'))
  }
}

async function create(): Promise<PoseLandmarker> {
  try {
    // Attempt local model and wasm first (supports offline PWA)
    return await loadLandmarker(LOCAL_WASM, LOCAL_MODEL)
  } catch (localError) {
    console.warn('Local MediaPipe asset loading failed, falling back to CDN:', localError)
    // Fallback to official MediaPipe CDN
    return await loadLandmarker(CDN_WASM, CDN_MODEL)
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
