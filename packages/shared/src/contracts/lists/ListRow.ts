import type { ReactNode } from 'react'

export interface ListRowAction {
  icon: string
  label: string
  onPress: () => void
  danger?: boolean
}

export interface ListRowBase {
  icon?: string | ReactNode
  title: string
  description?: string
  value?: string
  trailing?: ReactNode
  danger?: boolean
  chevron?: boolean
  onClick?: () => void
  inset?: boolean
}

export type ListRowMode =
  | { readOnly: true; action?: never }
  | { readOnly?: false; action?: ListRowAction }

export type ListRowProps = ListRowBase & ListRowMode
