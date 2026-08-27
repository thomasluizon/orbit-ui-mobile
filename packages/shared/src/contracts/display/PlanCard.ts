import type { ReactNode } from 'react'

/** Selectable plan card. The tint and ring on the chosen plan are a selected state (current-position accent role), not decoration. */
export interface PlanCardProps {
  name: string
  price: string
  /** e.g. a Badge like "2 MESES GRÁTIS" */
  badge?: ReactNode
  selected?: boolean
  disabled?: boolean
  loading?: boolean
  onClick?: () => void
}
