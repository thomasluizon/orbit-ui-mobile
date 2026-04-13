import {
  forwardRef,
  useCallback,
  useRef,
  type ComponentProps,
} from 'react'
import { TextInput } from 'react-native'
import { useKeyboardAwareInputReveal } from './keyboard-aware-scroll-view'

type AppTextInputProps = ComponentProps<typeof TextInput>

export const AppTextInput = forwardRef<TextInput, AppTextInputProps>(
  function AppTextInput(
    { onFocus, ...props },
    ref,
  ) {
    const localRef = useRef<TextInput>(null)
    const keyboardAware = useKeyboardAwareInputReveal()

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
        keyboardAware?.revealInput(localRef.current)
        onFocus?.(event)
      },
      [keyboardAware, onFocus],
    )

    return (
      <TextInput
        ref={assignRef}
        {...props}
        onFocus={handleFocus}
      />
    )
  },
)
