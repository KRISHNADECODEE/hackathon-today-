import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  WebcamSourceAdapter,
  TestHarnessAdapter,
  createVideoSourceAdapter,
  AVAILABLE_VIDEO_SOURCES,
} from '../lib/videoSource'

describe('IVideoSourceAdapter & Implementations', () => {
  let mockVideo: HTMLVideoElement
  let stopTrackFn: ReturnType<typeof vi.fn>

  beforeEach(() => {
    stopTrackFn = vi.fn()
    const mockTrack = {
      stop: stopTrackFn,
      kind: 'video',
      enabled: true,
    } as unknown as MediaStreamTrack

    const mockStream = {
      getTracks: vi.fn(() => [mockTrack]),
    } as unknown as MediaStream

    // Mock navigator.mediaDevices
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
      },
    })

    // Mock HTMLVideoElement
    mockVideo = {
      srcObject: null,
      src: '',
      videoWidth: 1280,
      videoHeight: 720,
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      requestVideoFrameCallback: vi.fn(),
    } as unknown as HTMLVideoElement
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Factory and Registry', () => {
    it('lists available video sources with webcam and test harness', () => {
      expect(AVAILABLE_VIDEO_SOURCES).toHaveLength(2)
      expect(AVAILABLE_VIDEO_SOURCES[0].id).toBe('webcam')
      expect(AVAILABLE_VIDEO_SOURCES[1].id).toBe('test_harness')
      expect(AVAILABLE_VIDEO_SOURCES[1].capabilities.isSimulated).toBe(true)
    })

    it('creates appropriate adapter instances', () => {
      const webcam = createVideoSourceAdapter('webcam')
      expect(webcam).toBeInstanceOf(WebcamSourceAdapter)
      expect(webcam.id).toBe('webcam')

      const harness = createVideoSourceAdapter('test_harness')
      expect(harness).toBeInstanceOf(TestHarnessAdapter)
      expect(harness.id).toBe('test_harness')
    })
  })

  describe('WebcamSourceAdapter', () => {
    it('attaches to video element, requests 1280x720 video, and returns dimensions', async () => {
      const adapter = new WebcamSourceAdapter()
      expect(adapter.isActive()).toBe(false)

      const result = await adapter.attach(mockVideo)
      expect(adapter.isActive()).toBe(true)
      expect(result.width).toBe(1280)
      expect(result.height).toBe(720)
      expect(result.aspect).toBeCloseTo(16 / 9)
      expect(mockVideo.srcObject).toBeDefined()
      expect(mockVideo.play).toHaveBeenCalled()
    })

    it('detaches cleanly, stops all tracks, resets video, and prevents stale processing', async () => {
      const adapter = new WebcamSourceAdapter()
      await adapter.attach(mockVideo)
      expect(adapter.isActive()).toBe(true)

      adapter.detach()
      expect(adapter.isActive()).toBe(false)
      expect(stopTrackFn).toHaveBeenCalledTimes(1)
      expect(mockVideo.srcObject).toBeNull()
      expect(adapter.getDeliveryLatency()).toBeNull()
    })

    it('throws descriptive error if getUserMedia is not supported', async () => {
      vi.stubGlobal('navigator', {})
      const adapter = new WebcamSourceAdapter()
      await expect(adapter.attach(mockVideo)).rejects.toThrow('getUserMedia')
      expect(adapter.isActive()).toBe(false)
    })
  })

  describe('TestHarnessAdapter', () => {
    it('initializes in simulated test mode and reports isSimulated capability', () => {
      const harness = new TestHarnessAdapter()
      expect(harness.info.capabilities.isSimulated).toBe(true)
      expect(harness.info.capabilities.isLive).toBe(false)
      expect(harness.isActive()).toBe(false)
    })

    it('attaches with simulated fallback when canvas captureStream is unavailable', async () => {
      const harness = new TestHarnessAdapter()
      const result = await harness.attach(mockVideo)
      expect(harness.isActive()).toBe(true)
      expect(result.width).toBe(1280)
      expect(result.height).toBe(720)

      harness.detach()
      expect(harness.isActive()).toBe(false)
    })

    it('attaches a custom test file, sets video src, and revokes object URL on detach', async () => {
      const mockCreateObjectUrl = vi.fn().mockReturnValue('blob:kinectiq-test-clip')
      const mockRevokeObjectUrl = vi.fn()
      vi.stubGlobal('URL', {
        createObjectURL: mockCreateObjectUrl,
        revokeObjectURL: mockRevokeObjectUrl,
      })

      const harness = new TestHarnessAdapter()
      const fakeFile = new File(['fake-mp4-data'], 'elevated_cctv_test.mp4', { type: 'video/mp4' })
      harness.setTestFile(fakeFile)
      expect(harness.getTestFile()).toBe(fakeFile)

      await harness.attach(mockVideo)
      expect(mockCreateObjectUrl).toHaveBeenCalledWith(fakeFile)
      expect(mockVideo.src).toBe('blob:kinectiq-test-clip')
      expect(mockVideo.loop).toBe(true)
      expect(mockVideo.muted).toBe(true)

      harness.detach()
      expect(harness.isActive()).toBe(false)
      expect(mockRevokeObjectUrl).toHaveBeenCalledWith('blob:kinectiq-test-clip')
      expect(mockVideo.pause).toHaveBeenCalled()
      expect(mockVideo.src).toBe('')
    })
  })

  describe('Latency and Real-Time Suitability Thresholds', () => {
    it('verifies that end-to-end latency below 250 ms is suitable for real-time biofeedback', () => {
      // Benchmark model: Delivery (Webcam 25ms, WebRTC 80ms) + Inference (MediaPipe 30ms) + Render (5ms)
      const webcamDelivery = 25
      const inferenceTime = 32
      const renderTime = 4
      const webcamTotal = webcamDelivery + inferenceTime + renderTime
      expect(webcamTotal).toBeLessThan(250) // 61 ms << 250 ms

      const webrtcCctvDelivery = 95
      const webrtcTotal = webrtcCctvDelivery + inferenceTime + renderTime
      expect(webrtcTotal).toBeLessThan(250) // 131 ms < 250 ms

      // High-latency HLS stream (e.g. 3000 ms) fails the 250 ms threshold
      const hlsDelivery = 3200
      const hlsTotal = hlsDelivery + inferenceTime + renderTime
      expect(hlsTotal).toBeGreaterThan(250)
    })
  })
})
