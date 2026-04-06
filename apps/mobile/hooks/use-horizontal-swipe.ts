import { useMemo } from 'react'
import { PanResponder } from 'react-native'

interface UseHorizontalSwipeOptions {
  onSwipeLeft: () => void
  onSwipeRight: () => void
  minDistance?: number
}

export function useHorizontalSwipe({
  onSwipeLeft,
  onSwipeRight,
  minDistance = 50,
}: Readonly<UseHorizontalSwipeOptions>) {
  return useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gestureState) =>
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) &&
          Math.abs(gestureState.dx) > minDistance,
        onPanResponderRelease: (_event, gestureState) => {
          if (gestureState.dx <= -minDistance) {
            onSwipeLeft()
          } else if (gestureState.dx >= minDistance) {
            onSwipeRight()
          }
        },
      }),
    [minDistance, onSwipeLeft, onSwipeRight],
  )
}
