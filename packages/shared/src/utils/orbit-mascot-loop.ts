/** Who may run Orbit's idle loop. A view has at most one live Orbit, the person can switch the loop off,
 *  and an open overlay pauses every Orbit under it. The store has no React in it: the apps read it through
 *  `useSyncExternalStore`. */

interface LiveClaim {
  readonly claim: symbol
  /** The number of overlays around the mascot: 0 on the page, 1 inside a sheet, 2 inside a sheet on a sheet. */
  readonly layer: number
}

const listeners = new Set<() => void>()
const liveClaims: LiveClaim[] = []
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

/** A live mascot claims a slot while it is mounted. On the top layer, only the first claim runs the loop. */
export function claimOrbitLiveSlot(claim: symbol, layer = 0): () => void {
  liveClaims.push({ claim, layer })
  notify()
  return () => {
    const index = liveClaims.findIndex((entry) => entry.claim === claim)
    if (index >= 0) liveClaims.splice(index, 1)
    notify()
  }
}

/** An Orbit runs when the person allows motion, no overlay covers its layer, and it holds the first claim of the top layer. */
export function mayOrbitRunLoop(claim: symbol): boolean {
  if (!motionEnabled) return false
  return liveClaims.find((entry) => entry.layer === overlayCount)?.claim === claim
}
