import { forwardRef, useMemo, useState, type ForwardedRef, type ReactElement, type ReactNode } from 'react'
import { Pressable, StyleSheet, type ColorValue, type PressableProps, type StyleProp, type View, type ViewStyle } from 'react-native'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2, type AppTokensV2 } from '@/lib/theme'
import { usePrefersReducedMotion } from '@/lib/motion'
import { PressScale } from '@/components/motion/press-scale'
import { SelectionRing, focusRingInnerEdge } from './inset-focus-pressable'

type MotionPressState = Readonly<{ pressed: boolean; focused: boolean }>

const FOCUS_OFFSET = -4

const TARGET_KEYS: ReadonlySet<string> = new Set([
  'position', 'top', 'right', 'bottom', 'left', 'start', 'end', 'inset', 'insetBlock', 'insetBlockStart', 'insetBlockEnd', 'insetInline', 'insetInlineStart', 'insetInlineEnd', 'zIndex',
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'marginStart', 'marginEnd', 'marginHorizontal', 'marginVertical',
  'marginBlock', 'marginBlockStart', 'marginBlockEnd', 'marginInline', 'marginInlineStart', 'marginInlineEnd',
  'alignSelf', 'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight', 'aspectRatio', 'display',
  'outlineColor', 'outlineOffset', 'outlineStyle', 'outlineWidth', 'cursor',
])

const CORNER_KEY = /^border.*(?:Radius|Curve)$/

function splitPressStyle(style: StyleProp<ViewStyle>): Readonly<{ target: ViewStyle; face: ViewStyle }> {
  const target: Record<string, unknown> = {}
  const face: Record<string, unknown> = {}
  for (const [key, value] of Object.entries({ ...StyleSheet.flatten(style) })) {
    if (CORNER_KEY.test(key)) {
      target[key] = value
      face[key] = value
    } else if (TARGET_KEYS.has(key)) target[key] = value
    else face[key] = value
  }
  return { target, face }
}

interface MotionPressableProps extends Omit<PressableProps, 'children' | 'style'> {
  children?: ReactNode | ((state: MotionPressState) => ReactNode)
  style?: StyleProp<ViewStyle> | ((state: MotionPressState) => StyleProp<ViewStyle>)
  static?: boolean
  focusInset?: boolean
  focusOffset?: number
  focusColor?: ColorValue
  selectionRingWidth?: number
  selectionRingColor?: ColorValue
  selectionRingRestColor?: ColorValue
}

function useMotionPressableElement(
  { static: isStatic = false, focusInset = false, focusOffset = FOCUS_OFFSET, focusColor, selectionRingWidth, selectionRingColor, selectionRingRestColor,
    style, children, onPressIn, onPressOut, onFocus, onBlur, ...props }: Readonly<MotionPressableProps>,
  ref: ForwardedRef<View>,
  tokens: AppTokensV2,
): ReactElement {
  const [pressed, setPressed] = useState(false)
  const [focused, setFocused] = useState(false)
  const reducedMotion = usePrefersReducedMotion()
  const selected = Boolean(props.accessibilityState?.selected || props.accessibilityState?.checked)
  const focusShown = focusInset && focused && !props.disabled
  const { target, face } = splitPressStyle(typeof style === 'function' ? style({ pressed, focused }) : style)

  return (
    <Pressable
      ref={ref}
      {...props}
      onFocus={(event) => { if (focusInset && event.target === event.currentTarget) setFocused(true); onFocus?.(event) }}
      onBlur={(event) => { if (focusInset && event.target === event.currentTarget) setFocused(false); onBlur?.(event) }}
      onPressIn={(event) => { setPressed(true); onPressIn?.(event) }}
      onPressOut={(event) => { setPressed(false); onPressOut?.(event) }}
      style={[target, focusShown ? { outlineWidth: 2, outlineOffset: focusOffset, outlineStyle: 'solid', outlineColor: focusColor ?? tokens.fg1 } : null]}
    >
      <PressScale pressed={pressed && !isStatic} disabled={Boolean(props.disabled || props.accessibilityState?.disabled)} style={[face, styles.face]}>
        {selectionRingWidth === undefined ? null : <SelectionRing shape={face} width={selectionRingWidth} color={selectionRingColor ?? tokens.primary} restColor={selectionRingRestColor} shown={selected}
          inset={focusShown ? focusRingInnerEdge(0, focusOffset, false) : 0} reducedMotion={reducedMotion} />}
        {typeof children === 'function' ? children({ pressed, focused }) : children}
      </PressScale>
    </Pressable>
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

const styles = StyleSheet.create({
  face: { flexGrow: 1, flexShrink: 1, alignSelf: 'stretch' },
})
