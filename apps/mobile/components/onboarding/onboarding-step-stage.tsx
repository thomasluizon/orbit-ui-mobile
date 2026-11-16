import { useLayoutEffect, useRef, type ReactNode } from 'react'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { motionDurations, motionEasings, motionLayerTiming } from '@orbit/shared/theme'
import { usePrefersReducedMotion } from '@/lib/motion'

/** Reanimated, not a native-driver Animated fade: see LoginStepStage in components/auth/login-sections.tsx. */
export function OnboardingStepStage({ step, children }: Readonly<{ step: number; children: ReactNode }>) {
  const reduced = usePrefersReducedMotion()
  const previousStep = useRef(step)
  const progress = useSharedValue(1)
  const shift = motionLayerTiming.routeShift
  const style = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ translateY: (1 - progress.value) * shift }] }))
  useLayoutEffect(() => {
    if (previousStep.current === step || reduced) { progress.value = 1; previousStep.current = step; return }
    previousStep.current = step
    progress.value = 0
    progress.value = withTiming(1, { duration: motionDurations.base, easing: Easing.bezier(...motionEasings.enter) })
  }, [progress, reduced, step])
  return <Animated.View style={style}>{children}</Animated.View>
}
