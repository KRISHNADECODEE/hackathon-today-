// KinectIQ Progressive Web App Service Worker
// Provides offline shell caching and MediaPipe vision model persistence.
// Strictly avoids caching any private patient or Supabase data.

const SHELL_CACHE = 'kinectiq-shell-v1'
const MEDIAPIPE_CACHE = 'kinectiq-mediapipe-v1'

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/manifest.webmanifest',
]

const MEDIAPIPE_ASSETS = [
  '/mediapipe/pose_landmarker_lite.task',
  '/mediapipe/wasm/vision_wasm_internal.js',
  '/mediapipe/wasm/vision_wasm_internal.wasm',
  '/mediapipe/wasm/vision_wasm_nosimd_internal.js',
  '/mediapipe/wasm/vision_wasm_nosimd_internal.wasm',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE)
      await shell.addAll(SHELL_ASSETS)

      const mpCache = await caches.open(MEDIAPIPE_CACHE)
      // Best-effort precache of MediaPipe assets during install
      try {
        await mpCache.addAll(MEDIAPIPE_ASSETS)
      } catch (err) {
        // Individual assets will still be cached on-demand if precache is partial
        console.warn('[SW] MediaPipe asset precache warning:', err)
      }

      await self.skipWaiting()
    })()
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys.map((key) => {
          if (key !== SHELL_CACHE && key !== MEDIAPIPE_CACHE) {
            return caches.delete(key)
          }
        })
      )
      await self.clients.claim()
    })()
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // 1. Never intercept or cache non-GET requests
  if (request.method !== 'GET') {
    return
  }

  // 2. PRIVACY & SECURITY: Never cache Supabase endpoints, auth sessions, or private DB queries
  if (
    url.hostname.includes('supabase.co') ||
    url.pathname.includes('/rest/v1') ||
    url.pathname.includes('/auth/v1')
  ) {
    return // Bypass SW cache entirely
  }

  // 3. MediaPipe Assets: Cache-First strategy for instant offline CV
  if (url.pathname.startsWith('/mediapipe/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(MEDIAPIPE_CACHE)
        const cached = await cache.match(request)
        if (cached) return cached

        try {
          const networkRes = await fetch(request)
          if (networkRes && networkRes.status === 200) {
            cache.put(request, networkRes.clone())
          }
          return networkRes
        } catch {
          return new Response('MediaPipe offline asset not found in cache', { status: 503 })
        }
      })()
    )
    return
  }

  // 4. Navigation Requests (HTML / Client-side SPA routes): Network-First, fallback to cached /index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const networkRes = await fetch(request)
          if (networkRes && networkRes.status === 200) {
            const cache = await caches.open(SHELL_CACHE)
            cache.put('/index.html', networkRes.clone())
            return networkRes
          }
          return networkRes
        } catch {
          const cache = await caches.open(SHELL_CACHE)
          const fallback = await cache.match('/index.html')
          if (fallback) return fallback
          return new Response('KinectIQ is offline and app shell is not yet cached.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' },
          })
        }
      })()
    )
    return
  }

  // 5. Static Assets (JS, CSS, fonts, images): Cache-first with network refresh
  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL_CACHE)
      const cached = await cache.match(request)
      if (cached) {
        // Asynchronously update in background if online
        fetch(request)
          .then((networkRes) => {
            if (networkRes && networkRes.status === 200) {
              cache.put(request, networkRes)
            }
          })
          .catch(() => {})
        return cached
      }

      try {
        const networkRes = await fetch(request)
        if (networkRes && networkRes.status === 200) {
          cache.put(request, networkRes.clone())
        }
        return networkRes
      } catch (err) {
        if (cached) return cached
        throw err
      }
    })()
  )
})
