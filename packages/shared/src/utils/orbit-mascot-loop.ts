/** Who may run Orbit's idle loop. A view has at most one live Orbit, the person can switch the loop off,
 *  and an open overlay pauses every Orbit under it. The store has no React in it: the apps read it through
 *  `useSyncExternalStore`. */

/** The overlay that holds a mascot, or `null` for a mascot on the page. */
export type OrbitOverlay = symbol | null

interface LiveClaim {
  readonly claim: symbol
  readonly overlay: OrbitOverlay
  /** The conversation entry leads its view whenever it is in view. */
  readonly lead: boolean
}

interface OpenOverlay {
  readonly overlay: symbol
}

const listeners = new Set<() => void>()
const liveClaims: LiveClaim[] = []
/** Open overlays in the order they opened. The last one covers every Orbit outside it, whether it opened inside an
 *  earlier overlay or beside it. */
const openOverlays: OpenOverlay[] = []
let motionEnabled = true
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

/** Whether the person allows Orbit's idle loop (`Orbit em movimento`). */
export function isOrbitMotionEnabled(): boolean {
  return motionEnabled
}

/** An open overlay covers the view and pauses every Orbit outside it until the returned function runs. An overlay can
 *  close in any order. */
export function pauseOrbitLoopForOverlay(overlay: symbol): () => void {
  const entry: OpenOverlay = { overlay }
  openOverlays.push(entry)
  notify()
  return () => {
    const index = openOverlays.indexOf(entry)
    if (index < 0) return
    openOverlays.splice(index, 1)
    notify()
  }
}

/** A live mascot claims a slot while it is in view. In the top overlay, the leading claim runs the loop, or else the first claim. */
export function claimOrbitLiveSlot(claim: symbol, overlay: OrbitOverlay = null, lead = false): () => void {
  liveClaims.push({ claim, overlay, lead })
  notify()
  return () => {
    const index = liveClaims.findIndex((entry) => entry.claim === claim)
    if (index >= 0) liveClaims.splice(index, 1)
    notify()
  }
}

/** An Orbit runs when the person allows motion, it sits in the overlay that opened last (or on the page when no overlay
 *  is open), and it holds the live claim there. */
export function mayOrbitRunLoop(claim: symbol): boolean {
  if (!motionEnabled) return false
  const top = openOverlays.at(-1)?.overlay ?? null
  const live = liveClaims.filter((entry) => entry.overlay === top)
  return (live.find((entry) => entry.lead) ?? live[0])?.claim === claim
}
