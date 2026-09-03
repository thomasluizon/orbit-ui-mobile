import type { InputProps } from '@orbit/shared/contracts/forms'
import { useMemo, useRef, useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useKeyboardAwareInputReveal } from '@/components/ui/keyboard-aware-scroll-view'

type InputKind = NonNullable<InputProps['kind']>
type InputMode = InputProps['inputMode']

function getKeyboardType(kind: InputKind, inputMode: InputMode) {
  if (kind === 'email' || inputMode === 'email') return 'email-address'
  if (inputMode === 'decimal') return 'decimal-pad'
  if (kind === 'number' || inputMode === 'numeric') {
    return 'number-pad'
  }
  return 'default'
}

export function Input({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
  error,
  maxLength,
  kind = 'text',
  inputMode,
  autoComplete,
  mono = false,
  autoFocus = false,
  onSubmit,
  trailing,
  ...shape
}: Readonly<InputProps>) {
  const inputRef = useRef<TextInput>(null)
  const keyboardAware = useKeyboardAwareInputReveal()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const [focused, setFocused] = useState(false)
  const multiline = shape.multiline === true
  const borderColor = error
    ? tokens.statusBad
    : focused
      ? tokens.primary
      : tokens.hairline

  return (
    <View style={styles.root} data-multiline={multiline ? '' : undefined} data-error={error ? '' : undefined}>
      <Text style={[styles.label, { color: tokens.fg2 }]}>{label}</Text>
      <View style={styles.controlRow}>
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={tokens.fg3}
          editable={!disabled}
          maxLength={maxLength}
          multiline={multiline || undefined}
          numberOfLines={multiline ? shape.rows : undefined}
          textAlignVertical={multiline ? 'top' : 'center'}
          keyboardType={getKeyboardType(kind, inputMode)}
          autoComplete={autoComplete === 'off' ? 'off' : autoComplete}
          autoCapitalize={kind === 'email' ? 'none' : 'sentences'}
          autoCorrect={kind !== 'email'}
          autoFocus={autoFocus}
          onSubmitEditing={onSubmit}
          accessibilityLabel={label}
          accessibilityState={{ disabled }}
          accessibilityHint={error}
          onFocus={() => {
            setFocused(true)
            keyboardAware?.revealInput(inputRef.current)
          }}
          onBlur={() => setFocused(false)}
          style={[
            styles.input,
            multiline ? styles.multiline : null,
            {
              color: tokens.fg1,
              backgroundColor: tokens.bgField,
              borderColor,
              borderWidth: error || focused ? 2 : 1,
              fontFamily: mono ? 'GeistMono_400Regular' : 'Geist_400Regular',
            },
            disabled ? styles.disabled : null,
          ]}
        />
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
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
  root: { width: '100%', gap: 8 },
  label: { fontFamily: 'Geist_500Medium', fontSize: 14 },
  controlRow: { position: 'relative' },
  input: {
    width: '100%',
    minHeight: 54,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    lineHeight: 24,
  },
  multiline: { minHeight: 96 },
  trailing: { position: 'absolute', right: 16, top: 16 },
  disabled: { opacity: 0.6 },
  caption: { fontFamily: 'Geist_400Regular', fontSize: 12 },
})
