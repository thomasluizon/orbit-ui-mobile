import { useMemo, useState, type Ref } from 'react'
import { Pressable, type ColorValue, type PressableProps, type View } from 'react-native'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'

export interface InsetFocusPressableProps extends PressableProps {
  ref?: Ref<View>
  focusOffset?: number
  focusColor?: ColorValue
}

export function InsetFocusPressable({
  style,
  onFocus,
  onBlur,
  focusOffset = -4,
  focusColor,
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
        focused && !props.disabled ? {
          outlineWidth: 2,
          outlineOffset: focusOffset,
          outlineStyle: 'solid',
          outlineColor: focusColor ?? tokens.fg1,
        } : null,
      ]}
    />
  )
}
