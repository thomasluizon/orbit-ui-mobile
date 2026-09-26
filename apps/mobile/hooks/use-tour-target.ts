import { useEffect, type RefObject } from 'react'
import type { View } from 'react-native'
import { tourTargetRegistry } from '@/components/tour/tour-target-context'

export function useTourTarget(targetId: string, ref: RefObject<View | null>) {
  useEffect(() => {
    tourTargetRegistry.register(targetId, ref)
    return () => tourTargetRegistry.unregister(targetId)
  }, [targetId, ref])
}
