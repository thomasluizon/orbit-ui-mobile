
export interface ListRowAction {
  icon: string
  label: string
  onPress: () => void
  danger?: boolean
}

export interface ListRowBase {
  icon?: string | React.ReactNode
  textMode?: 'label' | 'personal'
  title: string
  wrapTitle?: boolean
  accessibilityLabel?: string
  expanded?: boolean
  controls?: string
  description?: string
  value?: string
  wrapValue?: boolean
  trailing?: React.ReactNode
  danger?: boolean
  chevron?: boolean
  href?: string
  onClick?: () => void
  disabled?: boolean
  /** False selects a bare 52px row with 4px block padding and no inline padding. */
  inset?: boolean
  compact?: boolean
  inForm?: boolean
}

export type ListRowMode =
  | { readOnly: true; action?: never }
  | { readOnly?: false; action?: ListRowAction }

export type ListRowProps = ListRowBase & ListRowMode
