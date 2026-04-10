import { useEffect, type RefObject } from 'react'
import type { View } from 'react-native'
import { tourTargetRegistry } from '@/components/tour/tour-target-context'

/**
 * Registers a ref for a tour target element.
 * When the tour reaches a step with this targetId, the provider measures
 * this ref to position the spotlight.
 *
 * Uses a global registry (not React Context) so it works regardless of
 * where the component sits in the navigation tree.
 */
export function useTourTarget(targetId: string, ref: RefObject<View | null>) {
  useEffect(() => {
    tourTargetRegistry.register(targetId, ref)
    return () => tourTargetRegistry.unregister(targetId)
  }, [targetId, ref])
}
