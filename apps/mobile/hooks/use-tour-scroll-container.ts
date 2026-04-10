import { useEffect, useCallback } from 'react'
import type { NativeSyntheticEvent, NativeScrollEvent } from 'react-native'
import { tourScrollRegistry } from '@/components/tour/tour-target-context'

/**
 * Registers a scroll function for a given route.
 * Pass a scrollTo callback that actually scrolls your ScrollView/FlatList.
 * Returns an onScroll handler to track scroll position.
 */
export function useTourScrollContainer(route: string, scrollTo: (y: number) => void) {
  useEffect(() => {
    tourScrollRegistry.register(route, scrollTo)
    return () => tourScrollRegistry.unregister(route)
  }, [route, scrollTo])

  const onTourScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      tourScrollRegistry.updateScrollY(route, e.nativeEvent.contentOffset.y)
    },
    [route],
  )

  return { onTourScroll }
}
