import {
  forwardRef,
  useCallback,
  useRef,
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
  { onFocus, ...props },
  ref,
) {
  const localRef = useRef<Parameters<typeof findNodeHandle>[0]>(null)
  const keyboardAware = useKeyboardAwareInputReveal()

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
      keyboardAware?.revealInput(localRef.current)
      onFocus?.(event)
    },
    [keyboardAware, onFocus],
  )

  return (
    <BottomSheetTextInput
      ref={assignRef}
      {...props}
      onFocus={handleFocus}
    />
  )
})
