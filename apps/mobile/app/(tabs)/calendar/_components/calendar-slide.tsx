import { useLayoutEffect, useRef, type ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { calendarSlideMotion, resolveCalendarSlide, type CalendarSlideDirection } from '@orbit/shared/utils'
import { usePrefersReducedMotion } from '@/lib/motion'

const { distance } = calendarSlideMotion

interface CalendarSlideProps {
  direction: CalendarSlideDirection | null
  /** Identity of the shown month or week. A change starts one slide. */
  stepKey: string
  style?: StyleProp<ViewStyle>
  testID?: string
  children: ReactNode
}

/** Slides the shown month or week in from the step direction, and retargets a step in flight. */
export function CalendarSlide({ direction, stepKey, style, testID, children }: Readonly<CalendarSlideProps>) {
  const reduced = usePrefersReducedMotion()
  const offset = useSharedValue(0)
  const shownKey = useRef(stepKey)

  useLayoutEffect(() => {
    if (shownKey.current === stepKey) return
    shownKey.current = stepKey
    const slide = resolveCalendarSlide(direction, offset.value, reduced)
    cancelAnimation(offset)
    if (!slide) {
      offset.value = 0
      return
    }
    offset.value = slide.from
    offset.value = withTiming(0, { duration: slide.duration, easing: Easing.bezier(...slide.easing) })
  }, [direction, offset, reduced, stepKey])

  useLayoutEffect(() => {
    if (!reduced) return
    cancelAnimation(offset)
    offset.value = 0
  }, [offset, reduced])

  useLayoutEffect(() => () => cancelAnimation(offset), [offset])

  const slideStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(1, Math.abs(offset.value) / distance),
    transform: [{ translateX: offset.value }],
  }))

  return <Animated.View testID={testID} style={[style, slideStyle]}>{children}</Animated.View>
}
