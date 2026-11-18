import { forwardRef, useCallback, useMemo, useRef, type ComponentProps } from 'react'
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

// WHY: UITextField drops the line height from typed text, so React Native reads the typed text as different from the React tree text and sets the text and the selection again in the middle of the entry. https://github.com/react/react-native/issues/58904
function nativeFieldStyle(style: StyleProp<TextStyle>, multiline: boolean | undefined): StyleProp<TextStyle> {
  if (Platform.OS !== 'ios' || multiline) return style
  const singleLineStyle = { ...StyleSheet.flatten(style) }
  delete singleLineStyle.lineHeight
  return singleLineStyle
}

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
        style={[nativeFieldStyle(style, props.multiline), { color: mirrored ? MIRRORED_TEXT_COLOR : proposed ? tokens.fg3 : tokens.fg1 }]}
      />
    )
  },
)
