import { useMemo } from 'react'
import { Dimensions, PanResponder } from 'react-native'

interface UseHorizontalSwipeOptions {
  onSwipeLeft: () => void
  onSwipeRight: () => void
  minDistance?: number
  edgeExclusion?: number
  minVelocity?: number
}

export function useHorizontalSwipe({
  onSwipeLeft,
  onSwipeRight,
  minDistance = 50,
  edgeExclusion = 24,
  minVelocity = 0.2,
}: Readonly<UseHorizontalSwipeOptions>) {
  return useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (event, gestureState) => {
          const touch = event.nativeEvent
          const startX = touch.pageX - gestureState.dx
          const screenWidth = Dimensions.get('window').width

          if (startX <= edgeExclusion) {
            return false
          }

          if (screenWidth > 0 && startX >= screenWidth - edgeExclusion) {
            return false
          }

          return (
            Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.2 &&
            Math.abs(gestureState.dx) > minDistance &&
            Math.abs(gestureState.vx) >= minVelocity
          )
        },
        onPanResponderRelease: (_event, gestureState) => {
          if (gestureState.dx <= -minDistance) {
            onSwipeLeft()
          } else if (gestureState.dx >= minDistance) {
            onSwipeRight()
          }
        },
      }),
    [edgeExclusion, minDistance, minVelocity, onSwipeLeft, onSwipeRight],
  )
}
