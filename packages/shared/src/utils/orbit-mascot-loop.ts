import type { OrbitLiveRole } from '../contracts/brand/OrbitMascot'
import { ORBIT_MASCOT_MAX_FRAME_STEP_MS } from '../contracts/brand/OrbitMascotGeometry'
import { mascotMotion } from '../theme/motion'

/** Who may run Orbit's idle loop, and the one clock every running Orbit reads. A view has one live Orbit, or the
 *  conversation entry and the Orbit lines that run with it. The person can switch the loop off, and an open overlay
 *  pauses every Orbit under it. The store has no React in it: the apps read it through `useSyncExternalStore`. */

/** The overlay that holds a mascot, or `null` for a mascot on the page. */
export type OrbitOverlay = symbol | null

interface LiveClaim {
  readonly claim: symbol
  readonly overlay: OrbitOverlay
  readonly role: OrbitLiveRole
}

interface OpenOverlay {
  readonly overlay: symbol
  readonly parent: OrbitOverlay
}

const listeners = new Set<() => void>()
const liveClaims: LiveClaim[] = []
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
 *  close in any order. React opens an inner overlay before the overlay around it when both open in one commit, so an
 *  overlay goes under any open overlay inside it. */
export function pauseOrbitLoopForOverlay(overlay: symbol, parent: OrbitOverlay = null): () => void {
  const entry: OpenOverlay = { overlay, parent }
  const inner = openOverlays.findIndex((open) => open.parent === overlay)
  if (inner < 0) openOverlays.push(entry)
  else openOverlays.splice(inner, 0, entry)
  notify()
  return () => {
    const index = openOverlays.indexOf(entry)
    if (index < 0) return
    openOverlays.splice(index, 1)
    notify()
  }
}

/** A live mascot claims a slot while it is in view. In the top overlay, the leading claim and every claim that runs
 *  with it run the loop. With no leading claim there, a claim that runs with the lead is still, and only the first
 *  single claim runs. */
export function claimOrbitLiveSlot(claim: symbol, overlay: OrbitOverlay = null, role: OrbitLiveRole = 'single'): () => void {
  liveClaims.push({ claim, overlay, role })
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
  if (!live.some((entry) => entry.role === 'lead')) return live.find((entry) => entry.role === 'single')?.claim === claim
  return live.some((entry) => entry.claim === claim && entry.role !== 'single')
}

let clockElapsed = 0
let clockPrevious: number | null = null
let clockRunners = 0

/** A running Orbit joins the shared clock until the returned function runs. The clock counts only the time while at
 *  least one Orbit runs, so a paused view resumes where it stopped. */
export function joinOrbitLoopClock(): () => void {
  clockRunners += 1
  let joined = true
  return () => {
    if (!joined) return
    joined = false
    clockRunners -= 1
    if (clockRunners === 0) clockPrevious = null
  }
}

/** Advances the shared clock to a frame timestamp and returns the time to draw. Every running Orbit calls it from its
 *  own animation frame. A timestamp that is not newer adds nothing, and one step adds at most
 *  `ORBIT_MASCOT_MAX_FRAME_STEP_MS`. The time to draw sits on one grid of `mascotMotion.frameInterval`, so every
 *  running Orbit draws the same pose and the loop draws at most 30 frames per second. */
export function advanceOrbitLoopClock(now: number): number {
  if (clockPrevious === null || now > clockPrevious) {
    if (clockPrevious !== null) clockElapsed += Math.min(now - clockPrevious, ORBIT_MASCOT_MAX_FRAME_STEP_MS)
    clockPrevious = now
  }
  return Math.round(clockElapsed / mascotMotion.frameInterval) * mascotMotion.frameInterval
}
