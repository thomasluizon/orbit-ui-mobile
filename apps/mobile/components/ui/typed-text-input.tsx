import { forwardRef, useCallback, useMemo, useRef, type ComponentProps } from 'react'
import { useKeyboardAwareInputReveal } from './keyboard-aware-scroll-view'
import { useKeyboardRevealGroup } from './keyboard-reveal-group'
import { TextInput } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type TypedTextInputProps = ComponentProps<typeof TextInput> & {
  proposed?: boolean
  /** The caller draws the value itself (the code cells), so the native text, caret, selection and handles draw nothing. */
  mirrored?: boolean
}

const MIRRORED_INK = { selectionColor: 'transparent', cursorColor: 'transparent', selectionHandleColor: 'transparent' } as const

export const TypedTextInput = forwardRef<TextInput, TypedTextInputProps>(
  function TypedTextInput({ style, placeholderTextColor, proposed = false, mirrored = false, onFocus, onBlur, onLayout, onContentSizeChange, ...props }, ref) {
    const inputRef = useRef<TextInput>(null)
    const focusedRef = useRef(false)
    const keyboardAware = useKeyboardAwareInputReveal()
    const revealGroup = useKeyboardRevealGroup()
    const assignRef = useCallback((node: TextInput | null) => {
      inputRef.current = node
      if (typeof ref === 'function') {
        ref(node)
      } else if (ref) {
        ref.current = node
      }
    }, [ref])
    const revealTarget = () => revealGroup?.current ?? inputRef.current
    const reveal = () => {
      if (focusedRef.current) {
        keyboardAware?.revealInput(revealTarget())
      }
    }
    const { currentScheme, currentTheme } = useAppTheme()
    const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
    return (
      <TextInput
        {...props}
        {...(mirrored ? MIRRORED_INK : {})}
        ref={assignRef}
        onFocus={(event) => {
          focusedRef.current = true
          reveal()
          onFocus?.(event)
        }}
        onBlur={(event) => {
          focusedRef.current = false
          keyboardAware?.clearInput(revealTarget())
          onBlur?.(event)
        }}
        onLayout={(event) => {
          reveal()
          onLayout?.(event)
        }}
        onContentSizeChange={(event) => {
          reveal()
          onContentSizeChange?.(event)
        }}
        placeholderTextColor={placeholderTextColor ?? tokens.fg3}
        style={[style, { color: mirrored ? 'transparent' : proposed ? tokens.fg3 : tokens.fg1 }]}
      />
    )
  },
)
