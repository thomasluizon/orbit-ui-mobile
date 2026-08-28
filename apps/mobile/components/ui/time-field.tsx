import type { Time24, TimeFieldProps } from '@orbit/shared/contracts/forms'
import { useMemo, useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { detectDefaultTimeFormat } from '@orbit/shared/utils'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useProfile } from '@/hooks/use-profile'

const TIME_24_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/
const TIME_12_PATTERN = /^(0?[1-9]|1[0-2]):([0-5]\d)\s*([ap]m)$/i

function presentTime(value: Time24 | '', hourCycle: 'h23' | 'h12'): string {
  if (!value) return ''
  if (hourCycle === 'h23') return value
  const [hourText, minute] = value.split(':')
  const hour = Number(hourText)
  return `${hour % 12 || 12}:${minute} ${hour < 12 ? 'am' : 'pm'}`
}

function parseTime(value: string, hourCycle: 'h23' | 'h12'): Time24 | null {
  if (hourCycle === 'h23') return TIME_24_PATTERN.test(value) ? value as Time24 : null
  const match = TIME_12_PATTERN.exec(value.trim())
  if (!match) return null
  const hour12 = Number(match[1])
  const hour24 = (hour12 % 12) + (match[3]!.toLowerCase() === 'pm' ? 12 : 0)
  return `${String(hour24).padStart(2, '0')}:${match[2]}` as Time24
}

export function TimeField({
  label,
  value,
  onChange,
  onClear,
  hourCycle,
  hint,
  disabled = false,
  error,
}: Readonly<TimeFieldProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const { i18n } = useTranslation()
  const { profile } = useProfile()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const uses24HourClock = profile?.uses24HourClock
    ?? detectDefaultTimeFormat(i18n.language) === '24h'
  const resolvedHourCycle = hourCycle ?? (uses24HourClock ? 'h23' : 'h12')
  const presentedValue = presentTime(value, resolvedHourCycle)
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)

  function handleChange(displayValue: string) {
    setDraft(displayValue)
    if (!displayValue) {
      onClear?.()
      return
    }
    const parsed = parseTime(displayValue, resolvedHourCycle)
    if (parsed) onChange(parsed)
  }

  return (
    <View style={styles.root} data-error={error ? '' : undefined}>
      <Text style={[styles.label, { color: tokens.fg2 }]}>{label}</Text>
      <TextInput
        value={draft ?? presentedValue}
        onChangeText={handleChange}
        editable={!disabled}
        keyboardType="numbers-and-punctuation"
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        accessibilityState={{ disabled }}
        onFocus={() => {
          setFocused(true)
          setDraft(presentedValue)
        }}
        onBlur={() => {
          setFocused(false)
          setDraft(null)
        }}
        style={[
          styles.input,
          {
            color: tokens.fg1,
            backgroundColor: tokens.bgField,
            borderColor: error ? tokens.statusBad : focused ? tokens.primary : tokens.hairline,
            borderWidth: error || focused ? 2 : 1,
          },
          disabled ? styles.disabled : null,
        ]}
      />
      {error || hint ? (
        <Text accessibilityRole={error ? 'alert' : undefined} style={[styles.caption, { color: error ? tokens.statusBadText : tokens.fg3 }]}>
          {error ?? hint}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { width: '100%', gap: 8 },
  label: { fontFamily: 'Rubik_500Medium', fontSize: 14 },
  input: { width: '100%', minHeight: 54, borderRadius: 12, paddingHorizontal: 16, fontFamily: 'Roboto_400Regular', fontSize: 16, fontVariant: ['tabular-nums'] },
  caption: { fontFamily: 'Rubik_400Regular', fontSize: 12 },
  disabled: { opacity: 0.6 },
})
