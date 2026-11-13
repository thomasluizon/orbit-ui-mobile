/** Who may run Orbit's idle loop. A view has at most one live Orbit, the person can switch the loop off,
 *  and an open overlay pauses it. The store has no React in it: the apps read it through
 *  `useSyncExternalStore`. */

const listeners = new Set<() => void>()
const liveClaims: symbol[] = []
let motionEnabled = true
let overlayCount = 0
let version = 0

function notify() {
  version += 1
  for (const listener of listeners) listener()
}

export function subscribeOrbitLoop(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getOrbitLoopVersion(): number {
  return version
}

/** The `Orbit em movimento` switch. An account that never set it has the loop on. */
export function setOrbitMotionEnabled(enabled: boolean | undefined): void {
  const next = enabled ?? true
  if (next === motionEnabled) return
  motionEnabled = next
  notify()
}

/** An overlay that covers the view pauses the loop until the returned function runs. */
export function pauseOrbitLoopForOverlay(): () => void {
  overlayCount += 1
  notify()
  let released = false
  return () => {
    if (released) return
    released = true
    overlayCount -= 1
    notify()
  }
}

/** A live mascot claims a slot while it is mounted. Only the first claim runs the loop. */
export function claimOrbitLiveSlot(claim: symbol): () => void {
  liveClaims.push(claim)
  notify()
  return () => {
    const index = liveClaims.indexOf(claim)
    if (index >= 0) liveClaims.splice(index, 1)
    notify()
  }
}

export function mayOrbitRunLoop(claim: symbol): boolean {
  return motionEnabled && overlayCount === 0 && liveClaims[0] === claim
}
