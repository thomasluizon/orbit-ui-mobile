import { forwardRef, useState, type ReactNode } from 'react'
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface FieldInputProps
  extends Omit<TextInputProps, 'style' | 'placeholderTextColor'> {
  label?: ReactNode
  mono?: boolean
  /** Validation message rendered below the well; also paints the status-bad ring. */
  error?: string
}

/**
 * Kit Field: optional Rubik 14/500 label above a 54px filled well (radius 14,
 * inset hairline ring, primary ring on focus, status-bad ring + caption when
 * `error` is set, dimmed well when not editable).
 * Mirrors `apps/web/components/ui/field-input.tsx` for shape parity.
 */
export const FieldInput = forwardRef<TextInput, FieldInputProps>(
  function FieldInput(
    { label, mono = false, error, onBlur, onFocus, ...textInputProps },
    ref,
  ) {
    const { currentScheme, currentTheme } = useAppTheme()
    const tokens = createTokensV2(currentScheme, currentTheme)
    const [focused, setFocused] = useState(false)
    const dimmed = textInputProps.editable === false

    return (
      <View style={styles.root}>
        {label ? (
          <Text style={[styles.label, { color: tokens.fg2 }]}>{label}</Text>
        ) : null}
        <TextInput
          ref={ref}
          placeholderTextColor={tokens.fg3}
          {...textInputProps}
          onFocus={(event) => {
            setFocused(true)
            onFocus?.(event)
          }}
          onBlur={(event) => {
            setFocused(false)
            onBlur?.(event)
          }}
          style={[
            styles.input,
            {
              fontFamily: mono ? 'Roboto_400Regular' : 'Rubik_400Regular',
              color: tokens.fg1,
              backgroundColor: tokens.bgField,
              borderColor: tokens.hairline,
            },
            focused
              ? { borderWidth: 2, borderColor: tokens.primary, paddingHorizontal: 15 }
              : null,
            error
              ? { borderWidth: 2, borderColor: tokens.statusBad, paddingHorizontal: 15 }
              : null,
            dimmed ? styles.inputDisabled : null,
          ]}
        />
        {error ? (
          <Text style={[styles.errorCaption, { color: tokens.statusBadText }]}>
            {error}
          </Text>
        ) : null}
      </View>
    )
  },
)

const styles = StyleSheet.create({
  root: {
    gap: 8,
    width: '100%',
  },
  label: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 14,
  },
  input: {
    width: '100%',
    minHeight: 54,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  inputDisabled: {
    opacity: 0.6,
  },
  errorCaption: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 12,
  },
})
