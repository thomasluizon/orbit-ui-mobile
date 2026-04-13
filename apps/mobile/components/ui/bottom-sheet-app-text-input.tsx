import type { ComponentProps } from 'react'
import { BottomSheetTextInput } from '@gorhom/bottom-sheet'

type BottomSheetAppTextInputProps = ComponentProps<typeof BottomSheetTextInput>

export function BottomSheetAppTextInput(props: BottomSheetAppTextInputProps) {
  return <BottomSheetTextInput {...props} />
}
