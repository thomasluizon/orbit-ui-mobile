import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from 'react'
import { findNodeHandle, StyleSheet, TextInput } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useKeyboardAwareInputReveal } from './keyboard-aware-scroll-view'

type AppTokens = ReturnType<typeof createTokensV2>

type BottomSheetAppTextInputProps = ComponentProps<typeof TextInput>

export const BottomSheetAppTextInput = forwardRef<
  unknown,
  BottomSheetAppTextInputProps
>(function BottomSheetAppTextInput(
  { onBlur, onChangeText, onFocus, placeholderTextColor, style, value, ...props },
  ref,
) {
  const localRef = useRef<Parameters<typeof findNodeHandle>[0]>(null)
  const keyboardAware = useKeyboardAwareInputReveal()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const isFocusedRef = useRef(false)
  const [focused, setFocused] = useState(false)
  const lastSyncedValueRef = useRef(value)
  const [draftValue, setDraftValue] = useState(value)

  useEffect(() => {
    if (!isFocusedRef.current && value !== lastSyncedValueRef.current) {
      setDraftValue(value)
      lastSyncedValueRef.current = value
    }
  }, [value])

  const assignRef = useCallback(
    (node: unknown) => {
      localRef.current = node as Parameters<typeof findNodeHandle>[0]

      if (typeof ref === 'function') {
        ref(node)
        return
      }

      if (ref) {
        ref.current = node
      }
    },
    [ref],
  )

  const handleFocus = useCallback<
    NonNullable<BottomSheetAppTextInputProps['onFocus']>
  >(
    (event) => {
      isFocusedRef.current = true
      setFocused(true)
      keyboardAware?.revealInput(localRef.current)
      onFocus?.(event)
    },
    [keyboardAware, onFocus],
  )

  const handleBlur = useCallback<
    NonNullable<BottomSheetAppTextInputProps['onBlur']>
  >(
    (event) => {
      isFocusedRef.current = false
      setFocused(false)
      if (value !== draftValue) {
        setDraftValue(value)
        lastSyncedValueRef.current = value
      }
      onBlur?.(event)
    },
    [draftValue, onBlur, value],
  )

  const handleChangeText = useCallback(
    (nextValue: string) => {
      setDraftValue(nextValue)
      lastSyncedValueRef.current = nextValue
      onChangeText?.(nextValue)
    },
    [onChangeText],
  )

  return (
    <TextInput
      ref={assignRef}
      placeholderTextColor={placeholderTextColor ?? tokens.fg3}
      {...props}
      style={[styles.input, focused ? styles.inputFocused : null, style]}
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
      borderColor: tokens.hairline,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontFamily: 'Rubik_400Regular',
      fontSize: 16,
      color: tokens.fg1,
    },
    inputFocused: {
      borderWidth: 2,
      borderColor: tokens.primary,
      paddingHorizontal: 15,
      paddingVertical: 13,
    },
  })
}
