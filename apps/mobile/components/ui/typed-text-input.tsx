import { forwardRef, useMemo, type ComponentProps } from 'react'
import { TextInput } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export const TypedTextInput = forwardRef<TextInput, ComponentProps<typeof TextInput>>(
  function TypedTextInput({ style, placeholderTextColor, ...props }, ref) {
    const { currentScheme, currentTheme } = useAppTheme()
    const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
    return <TextInput {...props} ref={ref} placeholderTextColor={placeholderTextColor ?? tokens.fg3} style={[style, { color: tokens.fg1 }]} />
  },
)
