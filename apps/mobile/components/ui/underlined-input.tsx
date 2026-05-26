import { forwardRef, type ReactNode } from 'react'
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface UnderlinedInputProps
  extends Omit<TextInputProps, 'style' | 'placeholderTextColor'> {
  label?: ReactNode
  mono?: boolean
  large?: boolean
}

/**
 * v8 UnderlinedInput: optional tiny label, bare TextInput with hairline underline.
 * Mirrors `apps/web/components/ui/underlined-input.tsx` for shape parity.
 */
export const UnderlinedInput = forwardRef<TextInput, UnderlinedInputProps>(
  function UnderlinedInput(
    { label, mono = false, large = false, ...textInputProps },
    ref,
  ) {
    const { currentScheme, currentTheme } = useAppTheme()
    const tokens = createTokensV2(currentScheme, currentTheme)
    const fontSize = large ? 17 : 14
    const padY = large ? 8 : 4

    return (
      <View style={styles.root}>
        {label ? (
          <Text style={[styles.label, { color: tokens.fg3 }]}>{label}</Text>
        ) : null}
        <TextInput
          ref={ref}
          placeholderTextColor={tokens.fg3}
          {...textInputProps}
          style={[
            styles.input,
            {
              fontSize,
              fontFamily: mono ? 'GeistMono' : 'Geist',
              color: tokens.fg1,
              paddingVertical: padY,
              borderBottomColor: tokens.hairlineStrong,
            },
          ]}
        />
      </View>
    )
  },
)

const styles = StyleSheet.create({
  root: {
    gap: 6,
    width: '100%',
  },
  label: {
    fontFamily: 'Geist',
    fontSize: 11,
    fontWeight: '500',
  },
  input: {
    width: '100%',
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    paddingHorizontal: 0,
  },
})
