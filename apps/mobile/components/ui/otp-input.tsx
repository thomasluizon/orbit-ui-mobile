import type { OtpInputProps } from '@orbit/shared/contracts/forms'
import { useEffect, useMemo, useRef } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const CELL_COUNT = 6

export function OtpInput({ label, value, onChange, error }: Readonly<OtpInputProps>) {
  const inputRef = useRef<TextInput>(null)
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const digits = value.slice(0, CELL_COUNT).split('')
  const activeIndex = Math.min(value.length, CELL_COUNT - 1)

  function handleChange(nextValue: string) {
    onChange(nextValue.replace(/\D/g, '').slice(0, CELL_COUNT))
  }

  useEffect(() => {
    if (error) inputRef.current?.focus()
  }, [error])

  return (
    <View style={styles.root} data-error={error ? '' : undefined}>
      <View style={styles.cellRow}>
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={handleChange}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          autoFocus
          accessibilityLabel={label}
          accessibilityHint={error}
          style={styles.realInput}
        />
        {Array.from({ length: CELL_COUNT }, (_, index) => (
          <View
            key={index}
            pointerEvents="none"
            data-active={index === activeIndex ? '' : undefined}
            style={[
              styles.cell,
              {
                backgroundColor: tokens.bgField,
                borderColor: error
                  ? tokens.statusBad
                  : index === activeIndex
                    ? tokens.primary
                    : tokens.hairline,
                borderWidth: error || index === activeIndex ? 2 : 1,
              },
            ]}
          >
            <Text style={[styles.digit, { color: tokens.fg1 }]}>{digits[index] ?? ''}</Text>
          </View>
        ))}
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={[styles.caption, { color: tokens.statusBadText }]}>
          {error}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  cellRow: { position: 'relative', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  realInput: { ...StyleSheet.absoluteFill, zIndex: 1, opacity: 0.01 },
  cell: { width: 48, height: 58, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  digit: { fontFamily: 'Roboto_500Medium', fontSize: 26, fontVariant: ['tabular-nums'] },
  caption: { fontFamily: 'Rubik_400Regular', fontSize: 12 },
})
