import { useMemo, useState, type ReactNode, type Ref } from 'react'
import { Pressable, StyleSheet, View, type ColorValue, type PressableProps, type PressableStateCallbackType, type ViewStyle } from 'react-native'
import Animated from 'react-native-reanimated'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import { usePrefersReducedMotion } from '@/lib/motion'
import { selectionSettleTransition } from '@/components/motion/selection-settle'

const AnimatedRing = Animated.createAnimatedComponent(View)

export interface InsetFocusPressableProps extends Omit<PressableProps, 'children'> {
  children?: ReactNode | ((state: PressableStateCallbackType & { focused: boolean }) => ReactNode)
  ref?: Ref<View>
  focusInset?: number
  focusOffset?: number
  focusColor?: ColorValue
  focusContrastColor?: ColorValue
  selectionRingWidth?: number
  selectionRingColor?: ColorValue
  /** The ring colour at rest, such as a chip's hairline; transparent by default. */
  selectionRingRestColor?: ColorValue
}

function cornerRadii(shape: ViewStyle | undefined) {
  return {
    borderRadius: shape?.borderRadius,
    borderTopLeftRadius: shape?.borderTopLeftRadius,
    borderTopRightRadius: shape?.borderTopRightRadius,
    borderBottomLeftRadius: shape?.borderBottomLeftRadius,
    borderBottomRightRadius: shape?.borderBottomRightRadius,
  }
}

/**
 * The selection ring of a ringed control: an inset ring at the edge of the control's own shape, inside its clip, as the
 * web inset ring is. It takes the layout of no border, and its colour settles on the selection preset.
 */
export function SelectionRing({ shape, width, color, restColor = 'transparent', shown, reducedMotion }: Readonly<{ shape: ViewStyle | undefined; width: number; color: ColorValue; restColor?: ColorValue; shown: boolean; reducedMotion: boolean }>) {
  return (
    <AnimatedRing
      testID="selection-ring"
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        StyleSheet.absoluteFill,
        cornerRadii(shape),
        { borderWidth: width, borderColor: shown ? color : restColor, transition: selectionSettleTransition('border-color', shown, reducedMotion) },
      ]}
    />
  )
}

export function InsetFocusPressable({
  style,
  onFocus,
  onBlur,
  children,
  focusInset = 0,
  focusOffset = -4,
  focusColor,
  focusContrastColor,
  selectionRingWidth,
  selectionRingColor,
  selectionRingRestColor,
  ...props
}: Readonly<InsetFocusPressableProps>) {
  const [focused, setFocused] = useState(false)
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
  const reducedMotion = usePrefersReducedMotion()
  const selected = Boolean(props.accessibilityState?.selected || props.accessibilityState?.checked)
  return (
    <Pressable
      {...props}
      onFocus={(event) => { if (event.target === event.currentTarget) setFocused(true); onFocus?.(event) }}
      onBlur={(event) => { if (event.target === event.currentTarget) setFocused(false); onBlur?.(event) }}
      style={(state) => [typeof style === 'function' ? style(state) : style]}
    >
      {(state) => {
        const shape = StyleSheet.flatten<ViewStyle | undefined>(typeof style === 'function' ? style(state) : style)
        return <>
          {selectionRingWidth === undefined ? null : <SelectionRing shape={shape} width={selectionRingWidth} color={selectionRingColor ?? tokens.primary} restColor={selectionRingRestColor} shown={selected && !focused} reducedMotion={reducedMotion} />}
          {typeof children === 'function' ? children({ ...state, focused }) : children}
          {focused && !props.disabled ? <View
            pointerEvents="none"
            accessible={false}
            focusable={false}
            importantForAccessibility="no-hide-descendants"
            style={[
              StyleSheet.absoluteFill,
              cornerRadii(shape),
              {
                top: focusInset,
                right: focusInset,
                bottom: focusInset,
                left: focusInset,
                outlineWidth: 2,
                outlineOffset: focusOffset,
                outlineStyle: 'solid',
                outlineColor: focusColor ?? tokens.fg1,
                ...(focusContrastColor ? { borderWidth: 4, borderColor: focusContrastColor } : {}),
              },
            ]}
          /> : null}
        </>
      }}
    </Pressable>
  )
}
