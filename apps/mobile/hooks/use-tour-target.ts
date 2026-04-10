import { useEffect, useContext, type RefObject } from 'react'
import type { View } from 'react-native'
import { TourTargetContext } from '@/components/tour/tour-target-context'

/**
 * Registers a ref for a tour target element.
 * When the tour reaches a step with this targetId, the provider measures
 * this ref to position the spotlight.
 */
export function useTourTarget(targetId: string, ref: RefObject<View | null>) {
  const { register, unregister } = useContext(TourTargetContext)

  useEffect(() => {
    register(targetId, ref)
    return () => unregister(targetId)
  }, [targetId, ref, register, unregister])
}
