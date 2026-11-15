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

/** Carries a layer through a portal. A portal renders its children under `PortalHost`, outside this context, so an
 *  overlay that portals its content gives the content its own layer again with this. */
export function OrbitOverlayLayerPortal({ layer, children }: Readonly<{ layer: number; children: ReactNode }>) {
  return <OrbitOverlayLayerContext.Provider value={layer}>{children}</OrbitOverlayLayerContext.Provider>
}
