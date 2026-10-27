import { forwardRef, useMemo, useState } from 'react'
import { selectedBorderStyle } from './selected-focus-indicator'
import { Pressable, type ColorValue, type PressableProps, type View } from 'react-native'
import Animated from 'react-native-reanimated'
import { motionDurations, motionEasings, orbitalMotion } from '@orbit/shared/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import { usePrefersReducedMotion } from '@/lib/motion'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

interface MotionPressableProps extends PressableProps {
  active?: boolean
  focusInset?: boolean
  selectionRingWidth?: number
  selectionRingColor?: ColorValue
}

export const MotionPressable = forwardRef<View, Readonly<MotionPressableProps>>(function MotionPressable(
  { active = false, focusInset = false, selectionRingWidth, selectionRingColor, style, children, onPressIn, onPressOut, onFocus, onBlur, ...props },
  ref,
) {
  const [pressed, setPressed] = useState(false)
  const [focused, setFocused] = useState(false)
  const prefersReducedMotion = usePrefersReducedMotion()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])

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
        selectedBorderStyle(Boolean(props.accessibilityState?.selected || props.accessibilityState?.checked), focused, selectionRingWidth, selectionRingColor ?? tokens.primary),
        focused && focusInset && !props.disabled ? { outlineWidth: 2, outlineOffset: -4, outlineStyle: 'solid', outlineColor: tokens.fg1 } : null,
        {
          transform: [{ scale: !props.disabled && !prefersReducedMotion && (pressed || active) ? orbitalMotion.press.scale : 1 }],
          transitionProperty: ['transform', 'backgroundColor'],
          transitionDuration: prefersReducedMotion ? motionDurations.instant : motionDurations.press,
          transition: `transform ${prefersReducedMotion ? 0 : motionDurations.press}ms cubic-bezier(${motionEasings.standard.join(',')})`,
        },
      ]}
    >
      {typeof children === 'function' ? children({ pressed }) : children}
    </AnimatedPressable>
  )
})
