import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
// react-doctor-disable-next-line rn-prefer-reanimated -- WHY: the login step stage animates with system Animated; the onboarding stage mirrors it until the pinned ABI changes. https://github.com/thomasluizon/orbit-ui-mobile/issues/243
import { Animated } from 'react-native'
import { motionDurations, motionEasings, motionLayerTiming } from '@orbit/shared/theme'
import { toAnimatedEasing, usePrefersReducedMotion } from '@/lib/motion'

export function OnboardingStepStage({ step, children }: Readonly<{ step: number; children: ReactNode }>) {
  const reduced = usePrefersReducedMotion()
  const previousStep = useRef(step)
  const progress = useMemo(() => new Animated.Value(1), [])
  useLayoutEffect(() => {
    if (previousStep.current === step || reduced) { progress.setValue(1); previousStep.current = step; return }
    previousStep.current = step
    progress.setValue(0)
    const animation = Animated.timing(progress, { toValue: 1, duration: motionDurations.base,
      easing: toAnimatedEasing(motionEasings.enter), useNativeDriver: true })
    animation.start()
    return () => animation.stop()
  }, [progress, reduced, step])
  return <Animated.View style={{ opacity: progress, transform: [{ translateY: progress.interpolate({
    inputRange: [0, 1], outputRange: [motionLayerTiming.routeShift, 0],
  }) }] }}>{children}</Animated.View>
}
