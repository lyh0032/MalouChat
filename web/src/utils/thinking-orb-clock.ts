type ThinkingOrbFrameCallback = (time: number) => void

const FRAME_INTERVAL = 1000 / 30
const subscribers = new Set<ThinkingOrbFrameCallback>()

let animationFrameId = 0
let lastFrameTime = 0
let visibilityListenerAttached = false

function scheduleFrame() {
  if (animationFrameId || subscribers.size === 0 || document.hidden) return
  animationFrameId = requestAnimationFrame(runFrame)
}

function runFrame(time: number) {
  animationFrameId = 0

  if (subscribers.size === 0 || document.hidden) return

  if (time - lastFrameTime >= FRAME_INTERVAL) {
    lastFrameTime = time - ((time - lastFrameTime) % FRAME_INTERVAL)
    subscribers.forEach((callback) => callback(time))
  }

  scheduleFrame()
}

function handleVisibilityChange() {
  if (document.hidden) {
    if (animationFrameId) cancelAnimationFrame(animationFrameId)
    animationFrameId = 0
    return
  }

  lastFrameTime = 0
  scheduleFrame()
}

function ensureVisibilityListener() {
  if (visibilityListenerAttached) return
  document.addEventListener('visibilitychange', handleVisibilityChange)
  visibilityListenerAttached = true
}

export function subscribeThinkingOrb(callback: ThinkingOrbFrameCallback) {
  ensureVisibilityListener()
  subscribers.add(callback)
  scheduleFrame()

  return () => {
    subscribers.delete(callback)

    if (subscribers.size === 0 && animationFrameId) {
      cancelAnimationFrame(animationFrameId)
      animationFrameId = 0
      lastFrameTime = 0
    }
  }
}
