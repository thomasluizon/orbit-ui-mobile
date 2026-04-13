import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
} from 'react'
import { findNodeHandle } from 'react-native'
import { BottomSheetTextInput } from '@gorhom/bottom-sheet'
import { useKeyboardAwareInputReveal } from './keyboard-aware-scroll-view'

type BottomSheetAppTextInputProps = ComponentProps<typeof BottomSheetTextInput>

export const BottomSheetAppTextInput = forwardRef<
  unknown,
  BottomSheetAppTextInputProps
>(function BottomSheetAppTextInput(
  { onBlur, onChangeText, onFocus, value, ...props },
  ref,
) {
  const localRef = useRef<Parameters<typeof findNodeHandle>[0]>(null)
  const keyboardAware = useKeyboardAwareInputReveal()
  const isFocusedRef = useRef(false)
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
    <BottomSheetTextInput
      ref={assignRef}
      {...props}
      value={draftValue}
      onBlur={handleBlur}
      onChangeText={handleChangeText}
      onFocus={handleFocus}
    />
  )
})
