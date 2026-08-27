import type { ReactNode } from 'react'

/** Floating action button: the next-action accent role. One per view, usually above the TabBar. */
export interface FabProps {
  /** accessible label, e.g. "Criar hábito" */
  label: string
  children?: ReactNode
  onClick?: () => void
}
