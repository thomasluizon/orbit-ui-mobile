import type { ReactNode } from 'react'

/** A visible sheet. A closed sheet is unmounted, so `false` is not representable. */
export interface SheetProps {
  open?: true
  title?: string
  actions?: ReactNode
  onClose?: () => void
  children?: ReactNode
}
