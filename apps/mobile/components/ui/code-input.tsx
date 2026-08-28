import { useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import type { OtpInputProps } from '@orbit/shared/contracts/forms'
import { normalizeStepUpCode } from '@orbit/shared/utils'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  error,
  hint,
  disabled = false,
  autoFocus = false,
  label,
}: Readonly<OtpInputProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [focused, setFocused] = useState(false)
  const normalizedValue = normalizeStepUpCode(value, length)
  const activeIndex = Math.min(normalizedValue.length, length - 1)

  function handleChange(nextValue: string) {
    const normalized = normalizeStepUpCode(nextValue, length)
    onChange(normalized)
    if (normalized.length === length) onComplete?.(normalized)
  }

  return (
    <View style={styles.root}>
      <View style={styles.inputWrap}>
        <View style={styles.row} pointerEvents="none">
          {Array.from({ length }, (_, index) => {
            const digit = normalizedValue[index] ?? ''
            const active = focused && !disabled && index === activeIndex
            return (
              <View
                key={`otp-cell-${index}`}
                testID={`otp-cell-${index}`}
                accessibilityElementsHidden
                style={[
                  styles.cell,
                  {
                    backgroundColor: tokens.bgField,
                    borderColor: error
                      ? tokens.statusBad
                      : active
                        ? tokens.primary
                        : tokens.hairline,
                    borderWidth: error || active ? 2 : 1,
                    opacity: disabled ? 0.4 : 1,
                  },
                ]}
              >
                {digit ? (
                  <Text style={[styles.digit, { color: tokens.fg1 }]}>{digit}</Text>
                ) : active ? (
                  <View style={[styles.caret, { backgroundColor: tokens.primary }]} />
                ) : null}
              </View>
            )
          })}
        </View>
        <TextInput
          value={normalizedValue}
          onChangeText={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          editable={!disabled}
          autoFocus={autoFocus}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          caretHidden
          accessibilityLabel={label}
          accessibilityState={{ disabled }}
          style={styles.realInput}
        />
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={[styles.feedback, { color: tokens.statusBadText }]}>
          {error}
        </Text>
      ) : hint ? (
        <Text style={[styles.hint, { color: tokens.fg3 }]}>{hint}</Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'flex-start',
    gap: 8,
  },
  inputWrap: {
    position: 'relative',
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  cell: {
    alignItems: 'center',
    borderRadius: 12,
    height: 56,
    justifyContent: 'center',
    width: 44,
  },
  digit: {
    fontFamily: 'Roboto_500Medium',
    fontSize: 26,
    fontVariant: ['tabular-nums'],
  },
  caret: {
    height: 28,
    width: 1,
  },
  realInput: {
    bottom: 0,
    color: 'transparent',
    left: 0,
    opacity: 0.02,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  feedback: {
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    lineHeight: 21,
  },
  hint: {
    fontFamily: 'Roboto_400Regular',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    lineHeight: 18,
  },
})
