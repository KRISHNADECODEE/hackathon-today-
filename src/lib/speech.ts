const last = new Map<string, number>()

/** Speak a short cue, throttled per key. Silently does nothing without SpeechSynthesis. */
export function say(text: string, key = text, minGapMs = 4000) {
  if (!('speechSynthesis' in window)) return
  const now = performance.now()
  if (now - (last.get(key) ?? -Infinity) < minGapMs) return
  last.set(key, now)
  window.speechSynthesis.cancel() // newest cue wins; avoids a backlog of stale messages
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text))
}

export const speechAvailable = () => typeof window !== 'undefined' && 'speechSynthesis' in window
