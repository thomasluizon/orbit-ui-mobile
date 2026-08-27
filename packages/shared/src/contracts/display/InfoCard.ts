import type { ReactNode } from 'react'

/** Quiet informational card. ONE tone only; no accent, no coloured side stripe, no severity variants. */
export interface InfoCardProps {
  icon?: ReactNode
  children?: ReactNode
}
