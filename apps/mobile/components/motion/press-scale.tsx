import type { ReactNode } from 'react'
import Animated from 'react-native-reanimated'
import { motionDurations, motionEasings, orbitalMotion } from '@orbit/shared/theme'
import { usePrefersReducedMotion } from '@/lib/motion'

export function pressScaleStyle(scaled: boolean, reducedMotion: boolean) {
  return {
    transform: [{ scale: scaled && !reducedMotion ? orbitalMotion.press.scale : 1 }],
    transition: reducedMotion ? 'none' : `transform ${motionDurations.press}ms cubic-bezier(${motionEasings.standard.join(',')})`,
  }
}

export function PressScale({ pressed, disabled, children }: Readonly<{ pressed: boolean; disabled: boolean; children: ReactNode }>) {
  const reducedMotion = usePrefersReducedMotion()
  return <Animated.View style={pressScaleStyle(pressed && !disabled, reducedMotion)}>{children}</Animated.View>
}
