import { forwardRef, type ComponentProps } from 'react'
import { TextInput } from 'react-native'

type AppTextInputProps = ComponentProps<typeof TextInput>

export const AppTextInput = forwardRef<TextInput, AppTextInputProps>(
  function AppTextInput(props, ref) {
    return <TextInput ref={ref} {...props} />
  },
)
