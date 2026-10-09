import { useMemo, useState, type ReactNode, type Ref } from 'react'
import { Pressable, StyleSheet, View, type ColorValue, type PressableProps, type PressableStateCallbackType, type ViewStyle } from 'react-native'
import { selectedBorderStyle } from './selected-focus-indicator'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'

export interface InsetFocusPressableProps extends Omit<PressableProps, 'children'> {
  children?: ReactNode | ((state: PressableStateCallbackType & { focused: boolean }) => ReactNode)
  ref?: Ref<View>
  focusOffset?: number
  focusColor?: ColorValue
  selectionRingWidth?: number
  selectionRingColor?: ColorValue
}

export function InsetFocusPressable({
  style,
  onFocus,
  onBlur,
  children,
  focusOffset = -4,
  focusColor,
  selectionRingWidth,
  selectionRingColor,
  ...props
}: Readonly<InsetFocusPressableProps>) {
  const [focused, setFocused] = useState(false)
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
  return (
    <Pressable
      {...props}
      onFocus={(event) => { if (event.target === event.currentTarget) setFocused(true); onFocus?.(event) }}
      onBlur={(event) => { if (event.target === event.currentTarget) setFocused(false); onBlur?.(event) }}
      style={(state) => [
        typeof style === 'function' ? style(state) : style,
        selectedBorderStyle(Boolean(props.accessibilityState?.selected || props.accessibilityState?.checked), focused, selectionRingWidth, selectionRingColor ?? tokens.primary),
      ]}
    >
      {(state) => {
        const shape = StyleSheet.flatten<ViewStyle | undefined>(typeof style === 'function' ? style(state) : style)
        return <>
          {typeof children === 'function' ? children({ ...state, focused }) : children}
          {focused && !props.disabled ? <View
            pointerEvents="none"
            accessible={false}
            focusable={false}
            importantForAccessibility="no-hide-descendants"
            style={[
              StyleSheet.absoluteFill,
              {
                borderRadius: shape?.borderRadius,
                borderTopLeftRadius: shape?.borderTopLeftRadius,
                borderTopRightRadius: shape?.borderTopRightRadius,
                borderBottomLeftRadius: shape?.borderBottomLeftRadius,
                borderBottomRightRadius: shape?.borderBottomRightRadius,
                outlineWidth: 2,
                outlineOffset: focusOffset,
                outlineStyle: 'solid',
                outlineColor: focusColor ?? tokens.fg1,
              },
            ]}
          /> : null}
        </>
      }}
    </Pressable>
  )
}
