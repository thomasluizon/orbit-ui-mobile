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
 * The selection ring of a ringed control. It paints over the border band the control reserves, so the ring takes the
 * place of that border without moving the content, and it settles on the selection preset. A ringed control does not
 * clip its children, because Android clips them to the padding box, inside that band.
 */
function SelectionRing({ shape, width, color, shown, reducedMotion }: Readonly<{ shape: ViewStyle | undefined; width: number; color: ColorValue; shown: boolean; reducedMotion: boolean }>) {
  const band = -(Number(shape?.borderWidth) || 0)
  return (
    <AnimatedRing
      testID="selection-ring"
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        StyleSheet.absoluteFill,
        cornerRadii(shape),
        { top: band, right: band, bottom: band, left: band, borderWidth: width, borderColor: shown ? color : 'transparent', transition: selectionSettleTransition('border-color', shown, reducedMotion) },
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
          {selectionRingWidth === undefined ? null : <SelectionRing shape={shape} width={selectionRingWidth} color={selectionRingColor ?? tokens.primary} shown={selected && !focused} reducedMotion={reducedMotion} />}
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
