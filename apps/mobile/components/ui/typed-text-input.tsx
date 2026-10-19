import { forwardRef, useMemo, type ComponentProps } from 'react'
import { TextInput } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type TypedTextInputProps = ComponentProps<typeof TextInput> & { proposed?: boolean }

export const TypedTextInput = forwardRef<TextInput, TypedTextInputProps>(
  function TypedTextInput({ style, placeholderTextColor, proposed = false, ...props }, ref) {
    const { currentScheme, currentTheme } = useAppTheme()
    const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
    return <TextInput {...props} ref={ref} placeholderTextColor={placeholderTextColor ?? tokens.fg3} style={[style, { color: proposed ? tokens.fg3 : tokens.fg1 }]} />
  },
)
