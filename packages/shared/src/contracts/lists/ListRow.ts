
export interface ListRowAction {
  icon: string
  label: string
  onPress: () => void
  danger?: boolean
}

export interface ListRowBase {
  icon?: string | React.ReactNode
  textMode?: 'label' | 'personal'
  valueTextMode?: 'personal'
  personalExpanded?: boolean
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
  placement?: 'column'
  toggle?: { checked: boolean; onChange: (checked: boolean) => void; pending?: boolean }
  compact?: boolean
}

export type ListRowMode =
  | { readOnly: true; action?: never }
  | { readOnly?: false; action?: ListRowAction }

export type ListRowProps = ListRowBase & ListRowMode
