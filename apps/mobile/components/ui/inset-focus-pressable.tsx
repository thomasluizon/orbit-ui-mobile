import { useMemo, useState, type ReactNode, type Ref } from 'react'
import { Pressable, StyleSheet, View, type ColorValue, type PressableProps, type PressableStateCallbackType, type ViewStyle } from 'react-native'
import Animated from 'react-native-reanimated'
import { SELECTION_RING_WIDTH } from '@orbit/shared/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import { usePrefersReducedMotion } from '@/lib/motion'
import { selectionSettleTransition } from '@/components/motion/selection-settle'

const AnimatedRing = Animated.createAnimatedComponent(View)
const RESTING_RING_WIDTH = 1
const FOCUS_CONTRAST_WIDTH = 4

export interface InsetFocusPressableProps extends Omit<PressableProps, 'children'> {
  children?: ReactNode | ((state: PressableStateCallbackType & { focused: boolean }) => ReactNode)
  ref?: Ref<View>
  focusInset?: number
  focusOffset?: number
  focusColor?: ColorValue
  focusContrastColor?: ColorValue
  /** Draws the selection ring of a selected or checked control. */
  selectionRing?: boolean
  selectionRingColor?: ColorValue
  /** The ring colour at rest, such as a chip's hairline; transparent by default. */
  selectionRingRestColor?: ColorValue
}

function cornerRadius(radius: ViewStyle['borderRadius'], inset: number) {
  return typeof radius === 'number' ? Math.max(0, radius - inset) : radius
}

function cornerRadii(shape: ViewStyle | undefined, inset = 0) {
  return {
    borderRadius: cornerRadius(shape?.borderRadius, inset),
    borderTopLeftRadius: cornerRadius(shape?.borderTopLeftRadius, inset),
    borderTopRightRadius: cornerRadius(shape?.borderTopRightRadius, inset),
    borderBottomLeftRadius: cornerRadius(shape?.borderBottomLeftRadius, inset),
    borderBottomRightRadius: cornerRadius(shape?.borderBottomRightRadius, inset),
  }
}

/** The inner edge of a focus ring that sits `focusInset` inside the target with an outline at `focusOffset` and an optional contrast band. */
export function focusRingInnerEdge(focusInset: number, focusOffset: number, contrastBand: boolean): number {
  return Math.max(0, focusInset - focusOffset, contrastBand ? focusInset + FOCUS_CONTRAST_WIDTH : 0)
}

/**
 * The selection ring of a ringed control: one inset ring of `SELECTION_RING_WIDTH` inside the control's own shape, as
 * the web inset ring is. It takes no layout, and its colour settles on the selection preset. While focus shows, `inset`
 * moves it directly inside the focus ring, so a focused option keeps its selected cue.
 */
export function SelectionRing({ shape, color, restColor = 'transparent', shown, inset = 0, reducedMotion }: Readonly<{ shape: ViewStyle | undefined; color: ColorValue; restColor?: ColorValue; shown: boolean; inset?: number; reducedMotion: boolean }>) {
  return (
    <AnimatedRing
      testID="selection-ring"
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[
        StyleSheet.absoluteFill,
        cornerRadii(shape, inset),
        { top: inset, right: inset, bottom: inset, left: inset },
        { borderWidth: shown ? SELECTION_RING_WIDTH : RESTING_RING_WIDTH, borderColor: shown ? color : restColor, transition: selectionSettleTransition('border-color', shown, reducedMotion) },
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
  selectionRing = false,
  selectionRingColor,
  selectionRingRestColor,
  ...props
}: Readonly<InsetFocusPressableProps>) {
  const [focused, setFocused] = useState(false)
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
  const reducedMotion = usePrefersReducedMotion()
  const selected = Boolean(props.accessibilityState?.selected || props.accessibilityState?.checked)
  const focusShown = focused && !props.disabled
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
          {selectionRing ? <SelectionRing shape={shape} color={selectionRingColor ?? tokens.primary} restColor={selectionRingRestColor} shown={selected}
            inset={focusShown ? focusRingInnerEdge(focusInset, focusOffset, Boolean(focusContrastColor)) : 0} reducedMotion={reducedMotion} /> : null}
          {typeof children === 'function' ? children({ ...state, focused }) : children}
          {focusShown ? <View
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
