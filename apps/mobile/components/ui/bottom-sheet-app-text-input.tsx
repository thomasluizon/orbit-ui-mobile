import { SPACING } from '@orbit/shared/theme'
import { TypedTextInput } from '@/components/ui/typed-text-input'
import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from 'react'
import { StyleSheet, type TextInput } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type AppTokens = ReturnType<typeof createTokensV2>

type BottomSheetAppTextInputProps = ComponentProps<typeof TextInput> & {
  focusBorder?: boolean
  isChangeDisabled?: () => boolean
}

export const BottomSheetAppTextInput = forwardRef<
  TextInput,
  BottomSheetAppTextInputProps
>(function BottomSheetAppTextInput(
  { focusBorder = true, isChangeDisabled, onBlur, onChangeText, onFocus, placeholderTextColor, style, value, ...props },
  ref,
) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const [focused, setFocused] = useState(false)
  const lastSyncedValueRef = useRef(value)
  const [draftValue, setDraftValue] = useState(value)

  useEffect(() => {
    if (value !== lastSyncedValueRef.current) {
      setDraftValue(value)
      lastSyncedValueRef.current = value
    }
  }, [value])

  const handleFocus = useCallback<
    NonNullable<BottomSheetAppTextInputProps['onFocus']>
  >(
    (event) => {
      setFocused(true)
      onFocus?.(event)
    },
    [onFocus],
  )

  const handleBlur = useCallback<
    NonNullable<BottomSheetAppTextInputProps['onBlur']>
  >(
    (event) => {
      if (isChangeDisabled?.()) return
      setFocused(false)
      if (value !== draftValue) {
        setDraftValue(value)
        lastSyncedValueRef.current = value
      }
      onBlur?.(event)
    },
    [draftValue, isChangeDisabled, onBlur, value],
  )

  const handleChangeText = useCallback(
    (nextValue: string) => {
      if (isChangeDisabled?.()) return
      setDraftValue(nextValue)
      lastSyncedValueRef.current = nextValue
      onChangeText?.(nextValue)
    },
    [isChangeDisabled, onChangeText],
  )

  return (
    <TypedTextInput
      ref={ref}
      placeholderTextColor={placeholderTextColor ?? tokens.fg3}
      {...props}
      style={[styles.input, style, focused && focusBorder ? styles.inputFocused : null]}
      value={draftValue}
      onBlur={handleBlur}
      onChangeText={handleChangeText}
      onFocus={handleFocus}
    />
  )
})

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    input: {
      minHeight: 54,
      borderRadius: 14,
      backgroundColor: tokens.bgField,
      borderWidth: 1,
      borderColor: tokens.borderControl,
      paddingHorizontal: SPACING.s16,
      paddingVertical: SPACING.s12,
      fontFamily: 'Geist_400Regular',
      fontSize: 16,
      color: tokens.fg1,
    },
    inputFocused: {
      borderWidth: 2,
      borderColor: tokens.primary,
      borderTopWidth: 2,
      borderRightWidth: 2,
      borderBottomWidth: 2,
      borderLeftWidth: 2,
      borderTopColor: tokens.primary,
      borderRightColor: tokens.primary,
      borderBottomColor: tokens.primary,
      borderLeftColor: tokens.primary,
    },
  })
}
