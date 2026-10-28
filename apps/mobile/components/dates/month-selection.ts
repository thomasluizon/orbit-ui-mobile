import { createContext, useState } from 'react'
import { MONTH_GRID_TARGET_MIN } from '@orbit/shared/theme'
import type { LayoutChangeEvent } from 'react-native'
import type { SelectionBounds } from '@/components/ui/selection-indicator'

export const MovingDaySelection = createContext(false)

export function useMonthSelection(selectedIndex?: number) {
  const [rows, setRows] = useState<Record<number, number>>({})
  const [cells, setCells] = useState<Record<number, SelectionBounds>>({})
  const row = selectedIndex === undefined ? undefined : rows[Math.floor(selectedIndex / 7)]
  const cell = selectedIndex === undefined ? undefined : cells[selectedIndex]
  const size = cell ? Math.min(MONTH_GRID_TARGET_MIN, cell.width) : 0
  const bounds = cell && row !== undefined ? {
    x: cell.x + (cell.width - size) / 2,
    y: row + (cell.height - size) / 2,
    width: size,
    height: size,
  } : undefined
  return {
    bounds,
    measureRow: (index: number, event: LayoutChangeEvent) => {
      const y = event.nativeEvent.layout.y
      setRows((previous) => previous[index] === y ? previous : { ...previous, [index]: y })
    },
    measureCell: (index: number, event: LayoutChangeEvent) => {
      const layout = event.nativeEvent.layout
      setCells((previous) => JSON.stringify(previous[index]) === JSON.stringify(layout) ? previous : { ...previous, [index]: layout })
    },
  }
}
