import { type ReactNode } from 'react'
import Animated, { FadeIn, FadeOut, ReduceMotion } from 'react-native-reanimated'
import { motionDurations } from '@orbit/shared/theme'
import { usePrefersReducedMotion } from '@/lib/motion'

export function ContentFade({ children, fill = false }: Readonly<{ children: ReactNode; fill?: boolean }>) {
  const reduced = usePrefersReducedMotion()
  return <Animated.View style={fill ? { flex: 1 } : undefined} exiting={FadeOut.duration(reduced ? 0 : motionDurations.micro).reduceMotion(ReduceMotion.System)} entering={FadeIn.duration(reduced ? 0 : motionDurations.micro).reduceMotion(ReduceMotion.System)}>
    {children}
  </Animated.View>
}
