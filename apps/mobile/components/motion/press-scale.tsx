import { useState, type ReactNode } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import Animated from 'react-native-reanimated'
import { motionDurations, motionEasings, orbitalMotion } from '@orbit/shared/theme'
import { usePrefersReducedMotion } from '@/lib/motion'
import { InsetFocusPressable, type InsetFocusPressableProps } from '@/components/ui/inset-focus-pressable'

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
 * Scales a plain pressable, its fill and its focus ring as one layer, for a press target that cannot animate itself.
 * `style` places the layer, such as a grid column width, so the press target keeps its laid-out box.
 */
export function PressScale({ pressed, disabled, style, children }: Readonly<{ pressed: boolean; disabled: boolean; style?: StyleProp<ViewStyle>; children: ReactNode }>) {
  const reducedMotion = usePrefersReducedMotion()
  return <AnimatedLayer data-slot="press-scale" style={[style, pressScaleStyle(pressed && !disabled, reducedMotion)]}>{children}</AnimatedLayer>
}

/** An `InsetFocusPressable` that tracks its own press and eases through `PressScale`; `layerStyle` places the layer. */
export function PressScalePressable({ layerStyle, disabled, onPressIn, onPressOut, ...props }: Readonly<InsetFocusPressableProps & { layerStyle?: StyleProp<ViewStyle> }>) {
  const [pressed, setPressed] = useState(false)
  return (
    <PressScale pressed={pressed} disabled={Boolean(disabled)} style={layerStyle}>
      <InsetFocusPressable
        {...props}
        disabled={disabled}
        onPressIn={(event) => { setPressed(true); onPressIn?.(event) }}
        onPressOut={(event) => { setPressed(false); onPressOut?.(event) }}
      />
    </PressScale>
  )
}
