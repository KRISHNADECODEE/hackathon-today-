/**
 * Video Source Abstraction for KinectIQ
 *
 * Provides a clean interface separating video acquisition from the MediaPipe
 * pose engine and session tracking. Allows both the default in-browser webcam
 * and evaluation test-harness adapters (for simulated or prerecorded elevated-angle
 * CCTV clips) to feed the shared pose-tracking pipeline without code duplication.
 */

export type VideoSourceId = 'webcam' | 'test_harness'

export interface VideoSourceCapabilities {
  supportsLatencyMeasurement: boolean
  isLive: boolean
  requiresNetwork: boolean
  isSimulated: boolean
}

export interface VideoSourceInfo {
  id: VideoSourceId
  name: string
  description: string
  capabilities: VideoSourceCapabilities
}

export interface FrameTelemetry {
  frameIndex: number
  captureTimeMs: number
  deliveryLatencyMs: number | null
  inferenceDurationMs: number
  totalE2eLatencyMs: number | null
  fps: number
}

export interface IVideoSourceAdapter {
  readonly id: VideoSourceId
  readonly info: VideoSourceInfo

  /**
   * Connects and attaches the source to the given HTMLVideoElement.
   * Resolves when the video element has begun playback and has valid dimensions.
   */
  attach(video: HTMLVideoElement): Promise<{ width: number; height: number; aspect: number }>

  /**
   * Immediately detaches the video element, halts all active media tracks,
   * cancels any frame hooks, and marks the adapter as disconnected.
   */
  detach(): void

  /** Returns whether the adapter currently holds an active stream or video */
  isActive(): boolean

  /**
   * Records or computes the latest delivery latency if available (e.g. via requestVideoFrameCallback metadata)
   */
  getDeliveryLatency(): number | null
}

/**
 * Default Webcam Adapter: uses standard getUserMedia for 100% in-browser, private tracking.
 */
export class WebcamSourceAdapter implements IVideoSourceAdapter {
  readonly id = 'webcam' as const
  readonly info: VideoSourceInfo = {
    id: 'webcam',
    name: 'Built-in / USB Webcam (Default)',
    description: 'Direct browser access to standard user-facing or USB camera.',
    capabilities: {
      supportsLatencyMeasurement: true,
      isLive: true,
      requiresNetwork: false,
      isSimulated: false,
    },
  }

  private stream: MediaStream | null = null
  private video: HTMLVideoElement | null = null
  private active = false
  private latestDeliveryLatency: number | null = null
  private rvfcId: number | null = null

  async attach(video: HTMLVideoElement): Promise<{ width: number; height: number; aspect: number }> {
    this.detach()

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser does not support camera access via getUserMedia.')
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false,
    })

    this.stream = stream
    this.video = video
    this.active = true
    video.srcObject = stream

    await video.play().catch(() => {})

    // Hook requestVideoFrameCallback if available to measure real presentation latency
    if (typeof video.requestVideoFrameCallback === 'function') {
      const onFrame: VideoFrameRequestCallback = (_now, metadata) => {
        if (!this.active) return
        const t = (metadata as unknown as { captureTime?: number; presentationTime?: number }).captureTime ?? metadata.presentationTime
        if (typeof t === 'number' && t > 0) {
          this.latestDeliveryLatency = Math.max(0, performance.now() - t)
        }
        if (this.active && this.video && typeof this.video.requestVideoFrameCallback === 'function') {
          this.rvfcId = this.video.requestVideoFrameCallback(onFrame)
        }
      }
      this.rvfcId = video.requestVideoFrameCallback(onFrame)
    }

    const width = video.videoWidth || 1280
    const height = video.videoHeight || 720
    const aspect = width > 0 && height > 0 ? width / height : 16 / 9

    return { width, height, aspect }
  }

  detach(): void {
    this.active = false
    if (this.rvfcId !== null && this.video && typeof (this.video as unknown as { cancelVideoFrameCallback?: (id: number) => void }).cancelVideoFrameCallback === 'function') {
      ;(this.video as unknown as { cancelVideoFrameCallback: (id: number) => void }).cancelVideoFrameCallback(this.rvfcId)
      this.rvfcId = null
    }
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop())
      this.stream = null
    }
    if (this.video) {
      this.video.srcObject = null
      this.video = null
    }
    this.latestDeliveryLatency = null
  }

  isActive(): boolean {
    return this.active
  }

  getDeliveryLatency(): number | null {
    return this.latestDeliveryLatency
  }
}

/**
 * Test Harness Adapter: For evaluation of elevated-angle and synthetic CCTV footage.
 *
 * Supports:
 * 1. Loading a user-provided prerecorded video file (e.g. high-mount CCTV MP4).
 * 2. Generating a simulated high-angle canvas video stream with frame timestamps to
 *    empirically measure end-to-end latency and landmark confidence without hardware.
 */
export class TestHarnessAdapter implements IVideoSourceAdapter {
  readonly id = 'test_harness' as const
  readonly info: VideoSourceInfo = {
    id: 'test_harness',
    name: 'CCTV & Elevated-Angle Test Harness',
    description: 'Evaluation adapter for prerecorded clips or simulated high-mount perspective footage.',
    capabilities: {
      supportsLatencyMeasurement: true,
      isLive: false,
      requiresNetwork: false,
      isSimulated: true,
    },
  }

  private video: HTMLVideoElement | null = null
  private objectUrl: string | null = null
  private canvasStream: MediaStream | null = null
  private active = false
  private latestDeliveryLatency: number | null = null
  private rvfcId: number | null = null
  private simInterval: ReturnType<typeof setInterval> | null = null
  private customFile: File | null = null

  /** Configure a user-provided test video file before calling attach() */
  setTestFile(file: File | null) {
    this.customFile = file
  }

  getTestFile(): File | null {
    return this.customFile
  }

  async attach(video: HTMLVideoElement): Promise<{ width: number; height: number; aspect: number }> {
    this.detach()
    this.video = video
    this.active = true

    if (this.customFile) {
      // Use the provided prerecorded video clip
      this.objectUrl = URL.createObjectURL(this.customFile)
      video.src = this.objectUrl
      video.loop = true
      video.muted = true
      video.playsInline = true
      await video.play().catch(() => {})
    } else if (typeof document !== 'undefined') {
      // Use synthetic elevated-angle canvas generator
      const canvas = document.createElement('canvas')
      canvas.width = 1280
      canvas.height = 720
      const ctx = canvas.getContext('2d')

      if (ctx && typeof canvas.captureStream === 'function') {
        let frameCount = 0
        const drawSyntheticElevatedFrame = () => {
          if (!this.active) return
          const now = performance.now()
          frameCount++

          ctx.fillStyle = '#0f172a'
          ctx.fillRect(0, 0, canvas.width, canvas.height)

          // Draw perspective grid indicating simulated 45-degree elevated ceiling mount
          ctx.strokeStyle = '#334155'
          ctx.lineWidth = 1
          ctx.beginPath()
          for (let y = 300; y < canvas.height; y += 40) {
            ctx.moveTo(0, y)
            ctx.lineTo(canvas.width, y)
          }
          ctx.stroke()

          // Draw simulated test subject silhouette (undergoing shoulder abduction cycle)
          const angle = Math.sin(now / 1000) * 0.8 + 0.8
          ctx.fillStyle = '#38bdf8'
          // Head (foreshortened from elevated angle)
          ctx.beginPath()
          ctx.arc(640, 260, 45, 0, Math.PI * 2)
          ctx.fill()
          // Torso
          ctx.fillRect(600, 310, 80, 160)
          // Moving arm
          ctx.lineWidth = 14
          ctx.strokeStyle = '#2dd4bf'
          ctx.beginPath()
          ctx.moveTo(600, 330)
          ctx.lineTo(600 - Math.cos(angle) * 120, 330 + Math.sin(angle) * 120)
          ctx.stroke()

          // Telemetry watermark
          ctx.fillStyle = '#e2e8f0'
          ctx.font = '16px monospace'
          ctx.fillText(`SIMULATED CCTV HARNESS | Pitch: 45° | Frame: ${frameCount}`, 30, 50)
          ctx.fillText(`Timestamp: ${now.toFixed(1)} ms`, 30, 75)
          ctx.fillText('STATUS: Prerecorded / Synthetic Test Mode (Physical CCTV Unverified)', 30, 100)
        }

        drawSyntheticElevatedFrame()
        this.simInterval = setInterval(drawSyntheticElevatedFrame, 33) // ~30 FPS

        this.canvasStream = canvas.captureStream(30)
        video.srcObject = this.canvasStream
        await video.play().catch(() => {})
      } else {
        // Fallback placeholder when canvas.captureStream is unavailable in test runner
        video.width = 1280
        video.height = 720
      }
    }

    // Hook frame callback to compute frame presentation delay
    if (typeof video.requestVideoFrameCallback === 'function') {
      const onFrame: VideoFrameRequestCallback = (_now, metadata) => {
        if (!this.active) return
        const t = (metadata as unknown as { captureTime?: number; presentationTime?: number }).captureTime ?? metadata.presentationTime
        if (typeof t === 'number' && t > 0) {
          this.latestDeliveryLatency = Math.max(0, performance.now() - t)
        }
        if (this.active && this.video && typeof this.video.requestVideoFrameCallback === 'function') {
          this.rvfcId = this.video.requestVideoFrameCallback(onFrame)
        }
      }
      this.rvfcId = video.requestVideoFrameCallback(onFrame)
    }

    const width = video.videoWidth || 1280
    const height = video.videoHeight || 720
    const aspect = width > 0 && height > 0 ? width / height : 16 / 9

    return { width, height, aspect }
  }

  detach(): void {
    this.active = false
    if (this.simInterval) {
      clearInterval(this.simInterval)
      this.simInterval = null
    }
    if (this.rvfcId !== null && this.video && typeof (this.video as unknown as { cancelVideoFrameCallback?: (id: number) => void }).cancelVideoFrameCallback === 'function') {
      ;(this.video as unknown as { cancelVideoFrameCallback: (id: number) => void }).cancelVideoFrameCallback(this.rvfcId)
      this.rvfcId = null
    }
    if (this.canvasStream) {
      this.canvasStream.getTracks().forEach((track) => track.stop())
      this.canvasStream = null
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl)
      this.objectUrl = null
    }
    if (this.video) {
      this.video.pause()
      this.video.src = ''
      this.video.srcObject = null
      this.video = null
    }
    this.latestDeliveryLatency = null
  }

  isActive(): boolean {
    return this.active
  }

  getDeliveryLatency(): number | null {
    return this.latestDeliveryLatency
  }
}

/**
 * Registry of available video source adapters.
 */
export const AVAILABLE_VIDEO_SOURCES: VideoSourceInfo[] = [
  new WebcamSourceAdapter().info,
  new TestHarnessAdapter().info,
]

/**
 * Factory for creating video source adapters.
 */
export function createVideoSourceAdapter(id: VideoSourceId): IVideoSourceAdapter {
  switch (id) {
    case 'webcam':
      return new WebcamSourceAdapter()
    case 'test_harness':
      return new TestHarnessAdapter()
    default:
      return new WebcamSourceAdapter()
  }
}
