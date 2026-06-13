import { useEffect, useCallback } from 'react'
import type { NativeSyntheticEvent, NativeScrollEvent } from 'react-native'
import { tourScrollRegistry } from '@/components/tour/tour-target-context'
import { useTourStore } from '@/stores/tour-store'

/**
 * Registers a scroll function for a given route.
 * Pass a scrollTo callback that actually scrolls your ScrollView/FlatList.
 * Returns an onScroll handler that tracks scroll position only while a tour is
 * active, since the offset is read solely by the tour's scroll-into-view.
 */
export function useTourScrollContainer(route: string, scrollTo: (y: number) => void) {
  const isTourActive = useTourStore((state) => state.isActive)

  useEffect(() => {
    tourScrollRegistry.register(route, scrollTo)
    return () => tourScrollRegistry.unregister(route)
  }, [route, scrollTo])

  const onTourScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!isTourActive) return
      tourScrollRegistry.updateScrollY(route, e.nativeEvent.contentOffset.y)
    },
    [isTourActive, route],
  )

  return { onTourScroll }
}
