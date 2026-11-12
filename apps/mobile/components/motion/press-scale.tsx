import type { ReactNode } from 'react'
import { View } from 'react-native'
import Animated from 'react-native-reanimated'
import { motionDurations, motionEasings, orbitalMotion } from '@orbit/shared/theme'
import { usePrefersReducedMotion } from '@/lib/motion'

const AnimatedLayer = Animated.createAnimatedComponent(View)

/** `DESIGN.md` Press feedback: the scale eases over the press duration on the enter curve, the mobile `--ease-out`. */
export const PRESS_SCALE_TRANSITION = `transform ${motionDurations.press}ms cubic-bezier(${motionEasings.enter.join(',')})`

export function pressScaleStyle(scaled: boolean, reducedMotion: boolean) {
  return {
    transform: [{ scale: scaled && !reducedMotion ? orbitalMotion.press.scale : 1 }],
    transition: reducedMotion ? 'none' : PRESS_SCALE_TRANSITION,
  }
}

/** Scales a plain pressable, its fill and its focus ring as one layer, for a press target that cannot animate itself. */
export function PressScale({ pressed, disabled, children }: Readonly<{ pressed: boolean; disabled: boolean; children: ReactNode }>) {
  const reducedMotion = usePrefersReducedMotion()
  return <AnimatedLayer data-slot="press-scale" style={pressScaleStyle(pressed && !disabled, reducedMotion)}>{children}</AnimatedLayer>
}
