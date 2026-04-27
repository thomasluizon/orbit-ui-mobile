import {
  forwardRef,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from 'react'
import { StyleSheet, TextInput } from 'react-native'
import { radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useKeyboardAwareInputReveal } from './keyboard-aware-scroll-view'

type AppTextInputProps = ComponentProps<typeof TextInput>

export const AppTextInput = forwardRef<TextInput, AppTextInputProps>(
  function AppTextInput(
    { onBlur, onFocus, style, ...props },
    ref,
  ) {
    const localRef = useRef<TextInput>(null)
    const keyboardAware = useKeyboardAwareInputReveal()
    const { colors } = useAppTheme()
    const [focused, setFocused] = useState(false)
    const styles = useMemo(() => createStyles(colors), [colors])

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

function createStyles(
  colors: ReturnType<typeof useAppTheme>['colors'],
) {
  return StyleSheet.create({
    input: {
      color: colors.textPrimary,
      borderColor: colors.borderMuted,
      borderRadius: radius.md,
    },
    inputFocused: {
      borderColor: colors.primaryTintBorder,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.12,
      shadowRadius: 10,
    },
  })
}
