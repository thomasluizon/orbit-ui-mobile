'use client'

import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from 'react'
import { pauseOrbitLoopForOverlay, type OrbitOverlay } from '@orbit/shared/utils'

const OrbitOverlayContext = createContext<OrbitOverlay>(null)

/** The overlay around the caller, or `null` on the page. */
export function useOrbitOverlay(): OrbitOverlay {
  return useContext(OrbitOverlayContext)
}

/** An overlay wraps its content in this layer: every Orbit outside it pauses, and an Orbit inside it may run. Only the
 *  overlay opened last runs its Orbit, whether it opened inside another overlay or beside it. */
export function OrbitOverlayLayer({ active = true, children }: Readonly<{ active?: boolean; children: ReactNode }>) {
  const parent = useOrbitOverlay()
  const [overlay] = useState(() => Symbol('orbit-overlay'))
  useLayoutEffect(() => (active ? pauseOrbitLoopForOverlay(overlay, parent) : undefined), [active, overlay, parent])
  return <OrbitOverlayContext.Provider value={active ? overlay : parent}>{children}</OrbitOverlayContext.Provider>
}
