import { forwardRef, useMemo, useState, type ForwardedRef, type ReactElement } from 'react'
import { selectedBorderStyle } from './selected-focus-indicator'
import { Pressable, type ColorValue, type PressableProps, type View } from 'react-native'
import Animated from 'react-native-reanimated'
import { orbitalMotion } from '@orbit/shared/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { usePrefersReducedMotion } from '@/lib/motion'
import { PRESS_SCALE_TRANSITION } from '@/components/motion/press-scale'
import { selectionSettleTransition } from '@/components/motion/selection-settle'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

function pressTransition(reducedMotion: boolean, ringed: boolean, selected: boolean): string {
  if (reducedMotion) return 'none'
  return ringed ? `${PRESS_SCALE_TRANSITION}, ${selectionSettleTransition('border-color', selected, false)}` : PRESS_SCALE_TRANSITION
}

interface MotionPressableProps extends PressableProps {
  active?: boolean
  /** Keeps the press scale at rest, as for a busy pill (the `static` prop of `DESIGN.md` Press feedback). */
  static?: boolean
  focusInset?: boolean
  selectionRingWidth?: number
  selectionRingColor?: ColorValue
}

function useMotionPressableElement(
  { active = false, static: isStatic = false, focusInset = false, selectionRingWidth, selectionRingColor, style, children, onPressIn, onPressOut, onFocus, onBlur, ...props }: Readonly<MotionPressableProps>,
  ref: ForwardedRef<View>,
  tokens: AppTokensV2,
): ReactElement {
  const [pressed, setPressed] = useState(false)
  const [focused, setFocused] = useState(false)
  const prefersReducedMotion = usePrefersReducedMotion()
  const selected = Boolean(props.accessibilityState?.selected || props.accessibilityState?.checked)
  const ringed = selectionRingWidth !== undefined

  return (
    <AnimatedPressable
      ref={ref}
      {...props}
      onFocus={(event) => { if (focusInset && event.target === event.currentTarget) setFocused(true); onFocus?.(event) }}
      onBlur={(event) => { if (focusInset && event.target === event.currentTarget) setFocused(false); onBlur?.(event) }}
      onPressIn={(event) => { setPressed(true); onPressIn?.(event) }}
      onPressOut={(event) => { setPressed(false); onPressOut?.(event) }}
      style={[
        typeof style === 'function' ? style({ pressed }) : style,
        ringed && !selected ? { borderColor: 'transparent' } : null,
        selectedBorderStyle(selected, focused, selectionRingWidth, selectionRingColor ?? tokens.primary),
        focused && focusInset && !props.disabled ? { outlineWidth: 2, outlineOffset: -4, outlineStyle: 'solid', outlineColor: tokens.fg1 } : null,
        {
          transform: [{ scale: !props.disabled && !isStatic && !prefersReducedMotion && (pressed || active) ? orbitalMotion.press.scale : 1 }],
          transition: pressTransition(prefersReducedMotion, ringed, selected),
        },
      ]}
    >
      {typeof children === 'function' ? children({ pressed }) : children}
    </AnimatedPressable>
  )
}

export const MotionPressable = forwardRef<View, Readonly<MotionPressableProps>>(function MotionPressable(props, ref) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
  return useMotionPressableElement(props, ref, tokens)
})

/** `MotionPressable` with caller tokens, for a control that renders without the app theme, such as the error screen's `ThemedButton`. */
export const ThemedMotionPressable = forwardRef<View, Readonly<MotionPressableProps & { tokens: AppTokensV2 }>>(function ThemedMotionPressable({ tokens, ...props }, ref) {
  return useMotionPressableElement(props, ref, tokens)
})
