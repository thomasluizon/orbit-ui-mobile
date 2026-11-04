import { useState } from 'react'
import type { LayoutChangeEvent } from 'react-native'

export function useListScrollReservation() {
  const [viewport, setViewport] = useState(0)
  return {
    minimumHeight: viewport,
    onLayout: (event: LayoutChangeEvent) => {
      setViewport(event.nativeEvent.layout.height)
    },
  }
}
