import type { ReactNode } from 'react'

/** Static badge: chip radius 8, NEVER a pill (999 means interactive). Neutral only; a static badge is not an accent role. */
export interface BadgeProps {
  variant?: 'solid' | 'outline'
  children?: ReactNode
}
