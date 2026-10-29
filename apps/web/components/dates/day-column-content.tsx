'use client'

import { useContext, type ReactNode } from 'react'
import { MONTH_GRID_TARGET_MIN } from '@orbit/shared/theme'
import { DayColumnPosition } from './month-selection'

export function DayColumnContent({ children }: Readonly<{ children: ReactNode }>) {
  const position = useContext(DayColumnPosition)
  return <span className="inline-flex w-full items-center" style={{ maxWidth: MONTH_GRID_TARGET_MIN, minHeight: MONTH_GRID_TARGET_MIN }}>
    <span style={{ flex: position }} />{children}<span style={{ flex: 1 - position }} />
  </span>
}
