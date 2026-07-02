import { useState, type MutableRefObject } from 'react'
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

/** Kit OTP: six 48x58 filled boxes (radius 14, inset hairline ring), Roboto
 *  26/500 digits, primary ring on the focused box. */
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
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

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
          onFocus={() => setActiveIndex(index)}
          onBlur={() =>
            setActiveIndex((current) => (current === index ? null : current))
          }
          keyboardType="number-pad"
          textContentType={index === 0 ? 'oneTimeCode' : 'none'}
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={6}
          selectTextOnFocus
          editable={!disabled}
          autoFocus={autoFocusFirst && index === 0}
          accessibilityLabel={ariaLabelForIndex(index)}
          style={[
            styles.box,
            {
              color: tokens.fg1,
              backgroundColor: tokens.bgField,
              borderColor: tokens.hairline,
            },
            activeIndex === index
              ? { borderWidth: 2, borderColor: tokens.primary }
              : null,
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
    justifyContent: 'center',
    gap: 10,
  },
  box: {
    width: 48,
    height: 58,
    borderRadius: 14,
    borderWidth: 1,
    textAlign: 'center',
    fontFamily: 'Roboto_500Medium',
    fontSize: 26,
    fontVariant: ['tabular-nums'],
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
})
