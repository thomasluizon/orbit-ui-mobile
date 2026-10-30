import { useState } from 'react'
import type { LayoutChangeEvent } from 'react-native'

export function useListScrollReservation(scope: string) {
  const [reservation, setReservation] = useState({ scope, viewport: 0, offset: 0 })
  if (scope !== reservation.scope) setReservation({ scope, viewport: reservation.viewport, offset: 0 })
  return {
    minimumHeight: reservation.viewport + (reservation.scope === scope ? Math.max(0, reservation.offset) : 0),
    onLayout: (event: LayoutChangeEvent) => {
      const viewport = event.nativeEvent.layout.height
      setReservation((current) => current.viewport === viewport ? current : { ...current, viewport })
    },
    onOffset: (offset: number) => setReservation((current) => current.offset === offset ? current : { ...current, offset }),
  }
}
