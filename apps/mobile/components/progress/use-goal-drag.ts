import { useEffect, useRef } from 'react'
import type { GestureResponderEvent, PointerEvent } from 'react-native'
import { createGoalDragGesture } from '@orbit/shared/utils/goal-drag'

export function useGoalDrag(drag: (() => void) | undefined) {
  const gesture = useRef<ReturnType<typeof createGoalDragGesture> | null>(null)
  const suppressed = useRef(false)
  useEffect(() => () => gesture.current?.cancel(), [drag])
  const start = (pointerType: string, x: number, y: number) => {
    gesture.current?.cancel()
    suppressed.current = false
    gesture.current = drag ? createGoalDragGesture(pointerType, x, y, drag) : null
  }
  const stop = () => {
    suppressed.current = gesture.current?.suppressPress() ?? suppressed.current
    gesture.current?.cancel()
    gesture.current = null
  }
  return {
    suppressPress: () => gesture.current?.suppressPress() ?? suppressed.current,
    onTouchStart: (event: GestureResponderEvent) => {
      if (gesture.current?.pointerType === 'mouse' || gesture.current?.pointerType === 'pen') return
      start('touch', event.nativeEvent.pageX, event.nativeEvent.pageY)
    },
    onTouchMove: (event: GestureResponderEvent) => gesture.current?.move(event.nativeEvent.pageX, event.nativeEvent.pageY),
    onTouchEnd: stop,
    onTouchCancel: stop,
    onPointerDown: (event: PointerEvent) => {
      const { pointerType, pageX, pageY } = event.nativeEvent
      if (pointerType !== 'touch') start(pointerType, pageX, pageY)
    },
    onPointerMove: (event: PointerEvent) => {
      if (event.nativeEvent.pointerType !== 'touch') gesture.current?.move(event.nativeEvent.pageX, event.nativeEvent.pageY)
    },
    onPointerUp: stop,
    onPointerCancel: stop,
  }
}
