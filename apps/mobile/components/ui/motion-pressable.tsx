import { forwardRef, useMemo, useState } from 'react'
import { selectedBorderStyle } from './selected-focus-indicator'
import { Pressable, StyleSheet, type ColorValue, type PressableProps, type View } from 'react-native'
import Animated from 'react-native-reanimated'
import { orbitalMotion } from '@orbit/shared/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import { usePrefersReducedMotion } from '@/lib/motion'
import { PRESS_SCALE_TRANSITION } from '@/components/motion/press-scale'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

type CallerTransition = Partial<Record<'transition' | 'transitionProperty' | 'transitionDuration' | 'transitionTimingFunction' | 'transitionDelay', unknown>>

/** Clears the caller's longhands once they are composed into the shorthand; Reanimated skips a transition prop set to `undefined`. */
const COMPOSED_LONGHANDS = { transitionProperty: undefined, transitionDuration: undefined, transitionTimingFunction: undefined, transitionDelay: undefined }

const cssTime = (value: unknown) => (typeof value === 'number' ? `${value}ms` : String(value))

/** The caller's transition as shorthand entries (`property duration curve delay`), repeating a shorter longhand list as CSS does. */
function callerTransitionEntries({ transition, transitionProperty, transitionDuration, transitionTimingFunction, transitionDelay }: CallerTransition): string[] {
  if (typeof transition === 'string') return transition === 'none' ? [] : [transition]
  if (transitionProperty === undefined && transitionDuration === undefined) return []
  const listed = (value: unknown, fallback: unknown) => [value ?? fallback].flat()
  const [durations, curves, delays] = [listed(transitionDuration, 0), listed(transitionTimingFunction, 'ease'), listed(transitionDelay, 0)]
  return listed(transitionProperty, 'all').map((property, index) =>
    `${String(property)} ${cssTime(durations[index % durations.length])} ${String(curves[index % curves.length])} ${cssTime(delays[index % delays.length])}`)
}

/**
 * One `transition` shorthand for the caller's transition and the press scale. Reanimated replaces every transition
 * longhand that precedes a shorthand (`react-native-reanimated/src/css/utils/props.ts`, `filterCSSAndStyleProperties`),
 * so a longhand beside the shorthand would be dropped. `callerStyle` is undefined for a caller with no style:
 * `StyleSheet.flatten` returns undefined for it (`react-native/Libraries/StyleSheet/flattenStyle.js`), though its type is not nullable.
 */
function composedTransition(callerStyle: CallerTransition | undefined, reducedMotion: boolean) {
  const entries = [...callerTransitionEntries(callerStyle ?? {}), ...(reducedMotion ? [] : [PRESS_SCALE_TRANSITION])]
  return entries.length > 0 ? entries.join(', ') : 'none'
}

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
  const callerStyle = typeof style === 'function' ? style({ pressed }) : style

  return (
    <AnimatedPressable
      ref={ref}
      {...props}
      onFocus={(event) => { if (focusInset && event.target === event.currentTarget) setFocused(true); onFocus?.(event) }}
      onBlur={(event) => { if (focusInset && event.target === event.currentTarget) setFocused(false); onBlur?.(event) }}
      onPressIn={(event) => { setPressed(true); onPressIn?.(event) }}
      onPressOut={(event) => { setPressed(false); onPressOut?.(event) }}
      style={[
        callerStyle,
        selectedBorderStyle(Boolean(props.accessibilityState?.selected || props.accessibilityState?.checked), focused, selectionRingWidth, selectionRingColor ?? tokens.primary),
        focused && focusInset && !props.disabled ? { outlineWidth: 2, outlineOffset: -4, outlineStyle: 'solid', outlineColor: tokens.fg1 } : null,
        {
          transform: [{ scale: !props.disabled && !prefersReducedMotion && (pressed || active) ? orbitalMotion.press.scale : 1 }],
          ...COMPOSED_LONGHANDS,
          transition: composedTransition(StyleSheet.flatten(callerStyle) as CallerTransition | undefined, prefersReducedMotion),
        },
      ]}
    >
      {typeof children === 'function' ? children({ pressed }) : children}
    </AnimatedPressable>
  )
})
