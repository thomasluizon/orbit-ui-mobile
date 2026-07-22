import { useEffect, useCallback } from 'react'
import type { NativeSyntheticEvent, NativeScrollEvent } from 'react-native'
import { tourScrollRegistry } from '@/components/tour/tour-target-context'
import { useTourStore } from '@/stores/tour-store'

/**
 * Registers a scroll function for a given route.
 * Pass a scrollTo callback that actually scrolls your ScrollView/FlatList.
 * Returns two handlers that track scroll position only while a tour is active,
 * since the offset is read solely by the tour's scroll-into-view:
 * `onTourScroll` for a scroll-event source (ScrollView/FlatList `onScroll`) and
 * `onTourScrollOffset` for an offset-number source (DraggableFlatList
 * `onScrollOffsetChange`).
 */
export function useTourScrollContainer(route: string, scrollTo: (y: number) => void) {
  const isTourActive = useTourStore((state) => state.isActive)

  useEffect(() => {
    tourScrollRegistry.register(route, scrollTo)
    return () => tourScrollRegistry.unregister(route)
  }, [route, scrollTo])

  const onTourScrollOffset = useCallback(
    (offsetY: number) => {
      if (!isTourActive) return
      tourScrollRegistry.updateScrollY(route, offsetY)
    },
    [isTourActive, route],
  )

  const onTourScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      onTourScrollOffset(e.nativeEvent.contentOffset.y)
    },
    [onTourScrollOffset],
  )

  return { onTourScroll, onTourScrollOffset }
}
