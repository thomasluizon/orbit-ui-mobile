import { forwardRef, useCallback, useEffect, useMemo, useRef, type ComponentProps } from 'react'
import { markFieldBlurred, markFieldFocused } from '@/lib/focused-field'
import { useKeyboardAwareInputReveal } from './keyboard-aware-scroll-view'
import { useKeyboardRevealGroup } from './keyboard-reveal-group'
import { Platform, StyleSheet, TextInput, type StyleProp, type TextStyle } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type TypedTextInputProps = ComponentProps<typeof TextInput> & {
  proposed?: boolean
  mirrored?: boolean
}

const MIRRORED_INK = { selectionColor: 'transparent', cursorColor: 'transparent', selectionHandleColor: 'transparent' } as const
// WHY: Android Fabric reads the colour 0 ('transparent') as no colour, so the typed text keeps the default black text colour. https://github.com/facebook/react-native/blob/v0.88.1/packages/react-native/ReactCommon/react/renderer/attributedstring/TextAttributes.cpp#L20-L24
const MIRRORED_TEXT_COLOR = 'rgba(255, 255, 255, 0)'

// WHY: React Native sets the text and the selection of a focused iOS field again when the typed text and the React tree text differ in paragraph style. UITextField sets the line height of typed text to 0 and adds its own paragraph style when the React tree text has none. https://github.com/react/react-native/issues/58904
const IOS_SINGLE_LINE_PARAGRAPH = { lineBreakModeIOS: 'tail' } as const

function singleLineStyle(style: StyleProp<TextStyle>): TextStyle {
  const next = { ...StyleSheet.flatten(style) }
  delete next.lineHeight
  return next
}

export const TypedTextInput = forwardRef<TextInput, TypedTextInputProps>(
  function TypedTextInput({ style, placeholderTextColor, proposed = false, mirrored = false, onFocus, onBlur, onLayout, onContentSizeChange, ...props }, ref) {
    const inputRef = useRef<TextInput>(null)
    const focusedRef = useRef(false)
    const fieldToken = useRef({})
    useEffect(() => {
      const token = fieldToken.current
      return () => markFieldBlurred(token)
    }, [])
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
    const iosSingleLine = Platform.OS === 'ios' && !props.multiline
    return (
      <TextInput
        {...props}
        {...(mirrored ? MIRRORED_INK : {})}
        {...(iosSingleLine ? IOS_SINGLE_LINE_PARAGRAPH : {})}
        ref={assignRef}
        onFocus={(event) => {
          focusedRef.current = true
          markFieldFocused(fieldToken.current)
          reveal()
          onFocus?.(event)
        }}
        onBlur={(event) => {
          focusedRef.current = false
          markFieldBlurred(fieldToken.current)
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
        style={[iosSingleLine ? singleLineStyle(style) : style, { color: mirrored ? MIRRORED_TEXT_COLOR : proposed ? tokens.fg3 : tokens.fg1 }]}
      />
    )
  },
)
