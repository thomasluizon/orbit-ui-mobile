
export interface ListRowAction {
  icon: string
  label: string
  onPress: () => void
  danger?: boolean
}

export interface ListRowBase {
  icon?: string | React.ReactNode
  title: string
  wrapTitle?: boolean
  accessibilityLabel?: string
  description?: string
  value?: string
  trailing?: React.ReactNode
  danger?: boolean
  chevron?: boolean
  href?: string
  onClick?: () => void
  disabled?: boolean
  inset?: boolean
}

export type ListRowMode =
  | { readOnly: true; action?: never }
  | { readOnly?: false; action?: ListRowAction }

export type ListRowProps = ListRowBase & ListRowMode
