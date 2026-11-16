import { useEffect, type ReactNode } from 'react'
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { motionDurations, motionEasings } from '@orbit/shared/theme'
import { usePrefersReducedMotion } from '@/lib/motion'

export function ContentFade({ children, fill = false }: Readonly<{ children: ReactNode; fill?: boolean }>) {
  const reduced = usePrefersReducedMotion()
  const opacity = useSharedValue(reduced ? 1 : 0)
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }))
  useEffect(() => {
    opacity.value = withTiming(1, { duration: reduced ? 0 : motionDurations.press, easing: Easing.bezier(...motionEasings.standard) })
    return () => cancelAnimation(opacity)
  }, [opacity, reduced])
  return <Animated.View style={[fill ? { flex: 1 } : undefined, style]}>{children}</Animated.View>
}
