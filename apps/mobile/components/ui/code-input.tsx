import type { MutableRefObject } from 'react'
import {
  StyleSheet,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface CodeInputProps {
  digits: string[]
  inputRefs: MutableRefObject<(TextInput | null)[]>
  onChange: (index: number, value: string) => void
  onKeyPress: (
    index: number,
    event: NativeSyntheticEvent<TextInputKeyPressEventData>,
  ) => void
  ariaLabelForIndex: (index: number) => string
  disabled?: boolean
  autoFocusFirst?: boolean
}

/** v8 6-digit code input: mono tabular-nums, bare hairline underline per slot. */
export function CodeInput({
  digits,
  inputRefs,
  onChange,
  onKeyPress,
  ariaLabelForIndex,
  disabled = false,
  autoFocusFirst = false,
}: Readonly<CodeInputProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <View style={styles.row}>
      {digits.map((digit, index) => (
        <TextInput
          key={`code-digit-${index}`}
          ref={(node) => {
            inputRefs.current[index] = node
          }}
          value={digit}
          onChangeText={(value) => onChange(index, value)}
          onKeyPress={(event) => onKeyPress(index, event)}
          keyboardType="number-pad"
          textContentType={index === 0 ? 'oneTimeCode' : 'none'}
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={6}
          selectTextOnFocus
          editable={!disabled}
          autoFocus={autoFocusFirst && index === 0}
          accessibilityLabel={ariaLabelForIndex(index)}
          placeholderTextColor={tokens.fg3}
          style={[
            styles.slot,
            {
              color: tokens.fg1,
              borderBottomColor: tokens.hairlineStrong,
            },
          ]}
        />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  slot: {
    flex: 1,
    minWidth: 0,
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: 'transparent',
    textAlign: 'center',
    fontFamily: 'GeistMono',
    fontSize: 28,
    fontWeight: '500',
    letterSpacing: 1.68,
    paddingVertical: 8,
    paddingHorizontal: 0,
  },
})
