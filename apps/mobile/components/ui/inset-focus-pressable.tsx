import { useState, type Ref } from 'react'
import { Pressable, type PressableProps, type View } from 'react-native'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'

export interface InsetFocusPressableProps extends PressableProps {
  ref?: Ref<View>
  focusOffset?: number
}

export function InsetFocusPressable({
  style,
  onFocus,
  onBlur,
  focusOffset = -4,
  ...props
}: Readonly<InsetFocusPressableProps>) {
  const [focused, setFocused] = useState(false)
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return (
    <Pressable
      {...props}
      onFocus={(event) => { setFocused(true); onFocus?.(event) }}
      onBlur={(event) => { setFocused(false); onBlur?.(event) }}
      style={(state) => [
        typeof style === 'function' ? style(state) : style,
        focused && !props.disabled ? {
          outlineWidth: 2,
          outlineOffset: focusOffset,
          outlineStyle: 'solid',
          outlineColor: tokens.fg1,
        } : null,
      ]}
    />
  )
}
