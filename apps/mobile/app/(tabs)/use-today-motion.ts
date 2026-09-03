import { useEffect, useMemo, useRef } from 'react'
// react-doctor-disable-next-line rn-prefer-reanimated -- This screen reuses the repository Animated motion adapter, which keeps reduced-motion handling and avoids introducing a second native animation runtime. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
import { Animated } from 'react-native'
import { toAnimatedEasing, useResolvedMotionPreset } from '@/lib/motion'

/** Moves the date control and its list as one interruptible block when the viewed day changes. */
export function useTodayDayMotion(date: string) {
  const motion = useResolvedMotionPreset('list-enter')
  const opacity = useMemo(() => new Animated.Value(1), [])
  const translateY = useMemo(() => new Animated.Value(0), [])
  const previousDateRef = useRef(date)

  useEffect(() => {
    const previousDate = previousDateRef.current
    if (motion.reducedMotionEnabled) {
      previousDateRef.current = date
      opacity.setValue(1)
      translateY.setValue(0)
      return
    }

    if (previousDate === date) return
    previousDateRef.current = date

    translateY.stopAnimation((liveTranslateY) => {
      opacity.stopAnimation((liveOpacity) => {
        const isInFlight = Math.abs(liveTranslateY) > 0.01 || liveOpacity < 0.999
        if (!isInFlight) {
          translateY.setValue(date > previousDate ? 8 : -8)
          opacity.setValue(0.9)
        }

        Animated.parallel([
          Animated.timing(translateY, {
            toValue: 0,
            duration: motion.enterDuration,
            easing: toAnimatedEasing(motion.enterEasing),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: motion.enterDuration,
            easing: toAnimatedEasing(motion.enterEasing),
            useNativeDriver: true,
          }),
        ]).start()
      })
    })

    return () => {
      translateY.stopAnimation()
      opacity.stopAnimation()
    }
  }, [date, motion, opacity, translateY])

  return useMemo(
    () => ({ opacity, transform: [{ translateY }] }),
    [opacity, translateY],
  )
}
