'use client'

import { createContext, useContext, useLayoutEffect, type ReactNode } from 'react'
import { pauseOrbitLoopForOverlay } from '@orbit/shared/utils'

const OrbitOverlayLayerContext = createContext(0)

/** The number of overlays around the caller: 0 on the page, 1 inside a sheet. */
export function useOrbitOverlayLayer(): number {
  return useContext(OrbitOverlayLayerContext)
}

/** An overlay wraps its content in this layer: every Orbit under it pauses, and an Orbit inside it may run. */
export function OrbitOverlayLayer({ active = true, children }: Readonly<{ active?: boolean; children: ReactNode }>) {
  const parentLayer = useOrbitOverlayLayer()
  useLayoutEffect(() => (active ? pauseOrbitLoopForOverlay() : undefined), [active])
  return <OrbitOverlayLayerContext.Provider value={active ? parentLayer + 1 : parentLayer}>{children}</OrbitOverlayLayerContext.Provider>
}
