/** Who may run Orbit's idle loop. A view has at most one live Orbit, the person can switch the loop off,
 *  and an open overlay pauses every Orbit under it. The store has no React in it: the apps read it through
 *  `useSyncExternalStore`. */

interface LiveClaim {
  readonly claim: symbol
  /** The number of overlays around the mascot: 0 on the page, 1 inside a sheet, 2 inside a sheet on a sheet. */
  readonly layer: number
  /** The conversation entry leads its view whenever it is in view. */
  readonly lead: boolean
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

/** A live mascot claims a slot while it is in view. On the top layer, the leading claim runs the loop, or else the first claim. */
export function claimOrbitLiveSlot(claim: symbol, layer = 0, lead = false): () => void {
  liveClaims.push({ claim, layer, lead })
  notify()
  return () => {
    const index = liveClaims.findIndex((entry) => entry.claim === claim)
    if (index >= 0) liveClaims.splice(index, 1)
    notify()
  }
}

/** An Orbit runs when the person allows motion, no overlay covers its layer, and it holds the live claim of the top layer. */
export function mayOrbitRunLoop(claim: symbol): boolean {
  if (!motionEnabled) return false
  const top = liveClaims.filter((entry) => entry.layer === overlayCount)
  return (top.find((entry) => entry.lead) ?? top[0])?.claim === claim
}
