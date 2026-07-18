import {
  forwardRef,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from 'react'
import { StyleSheet, Text, TextInput } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useKeyboardAwareInputReveal } from './keyboard-aware-scroll-view'

type AppTokens = ReturnType<typeof createTokensV2>

type AppTextInputProps = ComponentProps<typeof TextInput> & {
  /** Validation message rendered as a sibling caption; also paints the status-bad ring. */
  error?: string
}

export const AppTextInput = forwardRef<TextInput, AppTextInputProps>(
  function AppTextInput(
    { onBlur, onFocus, placeholderTextColor, style, error, ...props },
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
    const dimmed = props.editable === false

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
      <>
        <TextInput
          ref={assignRef}
          placeholderTextColor={placeholderTextColor ?? tokens.fg3}
          {...props}
          style={[
            styles.input,
            focused ? styles.inputFocused : null,
            error ? styles.inputError : null,
            dimmed ? styles.inputDisabled : null,
            style,
          ]}
          onBlur={handleBlur}
          onFocus={handleFocus}
        />
        {error ? <Text style={styles.errorCaption}>{error}</Text> : null}
      </>
    )
  },
)

function createStyles(tokens: AppTokens) {
  return StyleSheet.create({
    input: {
      minHeight: 54,
      borderRadius: 14,
      backgroundColor: tokens.bgField,
      borderWidth: 1,
      borderColor: tokens.hairline,
      paddingHorizontal: 16,
      paddingVertical: 16,
      fontFamily: 'Rubik_400Regular',
      fontSize: 16,
      color: tokens.fg1,
    },
    inputFocused: {
      borderWidth: 2,
      borderColor: tokens.primary,
      paddingHorizontal: 15,
      paddingVertical: 15,
    },
    inputError: {
      borderWidth: 2,
      borderColor: tokens.statusBad,
      paddingHorizontal: 15,
      paddingVertical: 15,
    },
    inputDisabled: {
      opacity: 0.6,
    },
    errorCaption: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 12,
      marginTop: 4,
      color: tokens.statusBadText,
    },
  })
}
