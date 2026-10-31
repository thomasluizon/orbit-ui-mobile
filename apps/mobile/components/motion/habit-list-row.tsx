import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { resolveMotionPreset } from '@orbit/shared/theme'
import { usePrefersReducedMotion } from '@/lib/motion'

export function HabitListMotionRow({ id, phase, offset, itemIds, measure, children, positionMotion = true }: Readonly<{
  id: string
  phase: 'present' | 'enter' | 'exit'
  offset: number | null
  itemIds: readonly string[]
  measure: (id: string, height: number) => void
  children: ReactNode
  positionMotion?: boolean
}>) {
  const reduced = usePrefersReducedMotion()
  const opacity = useSharedValue(1)
  const translation = useSharedValue(0)
  const previousPosition = useRef({ offset, itemIds })
  const enter = resolveMotionPreset('list-enter', reduced)
  const exit = resolveMotionPreset('list-exit', reduced)
  useLayoutEffect(() => {
    const previous = previousPosition.current
    previousPosition.current = { offset, itemIds }
    if (reduced || !positionMotion) { translation.value = 0; return }
    const sameOrder = previous.itemIds.length === itemIds.length &&
      previous.itemIds.every((itemId, index) => itemId === itemIds[index])
    if (!sameOrder && previous.offset !== null && offset !== null && previous.offset !== offset) {
      translation.value += previous.offset - offset
      translation.value = withTiming(0, { duration: enter.enterDuration, easing: Easing.bezier(...enter.enterEasing) })
    }
  }, [enter.enterDuration, enter.enterEasing, itemIds, offset, positionMotion, reduced, translation])
  useEffect(() => {
    if (phase === 'enter') {
      opacity.value = 0
      translation.value = reduced || !positionMotion ? 0 : enter.shift
    }
    if (phase !== 'exit') translation.value = reduced || !positionMotion ? 0 : withTiming(0,
      { duration: enter.enterDuration, easing: Easing.bezier(...enter.enterEasing) })
    opacity.value = withTiming(phase === 'exit' ? 0 : 1, {
      duration: phase === 'exit' ? exit.exitDuration : enter.enterDuration,
      easing: Easing.bezier(...(phase === 'exit' ? exit.exitEasing : enter.enterEasing)),
    })
    if (phase === 'exit') {
      translation.value = reduced || !positionMotion ? 0 : withTiming(exit.shift,
        { duration: exit.exitDuration, easing: Easing.bezier(...exit.exitEasing) })
    }
    return () => { cancelAnimation(opacity); cancelAnimation(translation) }
  }, [enter.enterDuration, enter.enterEasing, enter.shift, exit.exitDuration, exit.exitEasing, exit.shift, opacity, phase, positionMotion, reduced, translation])
  const style = useAnimatedStyle(() => ({ opacity: opacity.value,
    transform: reduced || !positionMotion ? [] : [{ translateY: translation.value }] }))
  return <Animated.View testID={`habit-motion-${id}`} data-phase={phase}
    pointerEvents={phase === 'exit' ? 'none' : 'auto'}
    importantForAccessibility={phase === 'exit' ? 'no-hide-descendants' : 'auto'}
    onLayout={(event) => measure(id, event.nativeEvent.layout.height)} style={style}>{children}</Animated.View>
}
