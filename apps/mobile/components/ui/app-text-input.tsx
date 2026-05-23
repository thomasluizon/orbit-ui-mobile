import {
  forwardRef,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from 'react'
import { StyleSheet, TextInput } from 'react-native'
import { createTokensV2, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useKeyboardAwareInputReveal } from './keyboard-aware-scroll-view'

type AppTokens = ReturnType<typeof createTokensV2>

type AppTextInputProps = ComponentProps<typeof TextInput>

export const AppTextInput = forwardRef<TextInput, AppTextInputProps>(
  function AppTextInput(
    { onBlur, onFocus, style, ...props },
    ref,
  ) {
    const localRef = useRef<TextInput>(null)
    const keyboardAware = useKeyboardAwareInputReveal()
    const { currentScheme, currentTheme } = useAppTheme()
    const tokens = useMemo(
      () => createTokensV2(currentScheme, currentTheme),
      [currentScheme, currentTheme],
    )
    const [focused, setFocused] = useState(false)
    const styles = useMemo(() => createStyles(tokens), [tokens])

    const assignRef = useCallback(
      (node: TextInput | null) => {
        localRef.current = node

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

    const handleFocus = useCallback<NonNullable<AppTextInputProps['onFocus']>>(
      (event) => {
        setFocused(true)
        keyboardAware?.revealInput(localRef.current)
        onFocus?.(event)
      },
      [keyboardAware, onFocus],
    )

    const handleBlur = useCallback<NonNullable<AppTextInputProps['onBlur']>>(
      (event) => {
        setFocused(false)
        onBlur?.(event)
      },
      [onBlur],
    )

    return (
      <TextInput
        ref={assignRef}
        {...props}
        style={[styles.input, focused ? styles.inputFocused : null, style]}
        onBlur={handleBlur}
        onFocus={handleFocus}
      />
    )
  },
)

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    input: {
      color: tokens.fg1,
      borderColor: tokens.hairline,
      borderRadius: radius.md,
    },
    inputFocused: {
      borderColor: tokens.hairlineStrong,
      shadowColor: tokens.primary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.12,
      shadowRadius: 10,
    },
  })
}
