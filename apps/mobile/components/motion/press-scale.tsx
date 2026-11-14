import type { ReactNode } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import Animated from 'react-native-reanimated'
import { motionDurations, motionEasings, orbitalMotion } from '@orbit/shared/theme'
import { usePrefersReducedMotion } from '@/lib/motion'

const AnimatedLayer = Animated.createAnimatedComponent(View)

/** `DESIGN.md` Press feedback: the scale eases over the press duration on the enter curve, the mobile `--ease-out`. */
export const PRESS_SCALE_TRANSITION = `transform ${motionDurations.press}ms cubic-bezier(${motionEasings.enter.join(',')})`

function pressScaleStyle(scaled: boolean, reducedMotion: boolean) {
  return {
    transform: [{ scale: scaled && !reducedMotion ? orbitalMotion.press.scale : 1 }],
    transition: reducedMotion ? 'none' : PRESS_SCALE_TRANSITION,
  }
}

/**
 * Scales the painted content of a press target on press. It sits inside the target, so the target keeps its laid-out
 * box, its hit area and its focus ring whole; reduced motion keeps it at rest.
 */
export function PressScale({ pressed, disabled, style, children }: Readonly<{ pressed: boolean; disabled: boolean; style?: StyleProp<ViewStyle>; children: ReactNode }>) {
  const reducedMotion = usePrefersReducedMotion()
  return <AnimatedLayer data-slot="press-scale" style={[style, pressScaleStyle(pressed && !disabled, reducedMotion)]}>{children}</AnimatedLayer>
}
