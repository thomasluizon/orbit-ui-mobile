import React, { forwardRef, useImperativeHandle } from 'react'
import { ScrollView, View } from 'react-native'

type BottomSheetModalHandle = {
  present: () => void
  dismiss: () => void
}

type BottomSheetModalProps = Readonly<{
  children?: React.ReactNode
}>

export type BottomSheetBackdropProps = Readonly<{
  children?: React.ReactNode
}>

const BottomSheetModal = forwardRef<BottomSheetModalHandle, BottomSheetModalProps>(
  function BottomSheetModal({ children }, ref) {
    useImperativeHandle(
      ref,
      () => ({
        present: () => {},
        dismiss: () => {},
      }),
      [],
    )

    return <View>{children}</View>
  },
)

function BottomSheetBackdrop({ children }: BottomSheetBackdropProps) {
  return <View>{children}</View>
}

function BottomSheetScrollView({
  children,
}: Readonly<{
  children?: React.ReactNode
}>) {
  return <ScrollView>{children}</ScrollView>
}

export { BottomSheetBackdrop, BottomSheetModal, BottomSheetScrollView }
