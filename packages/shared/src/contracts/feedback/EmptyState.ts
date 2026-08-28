import type { ReactElement } from 'react'

export interface EmptyStateProps {
  title: string
  mark?: 'orbit' | 'astra'
  action?: ReactElement
}
