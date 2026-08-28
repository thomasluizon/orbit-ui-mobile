import type { ReactNode } from 'react'

export interface MonthGridProps {
  weekdayLabels?: string[]
  children?: ReactNode
  gap?: string | number
  label?: string
}
