
export interface RadioRowBase {
  selection?: boolean
  hideMeta?: boolean
  label: string
  proposed?: boolean
  wrapLabel?: boolean
  textMode?: 'personal'
  description?: string
  selected?: boolean
  onSelect?: () => void
  onFocus?: () => void
  onBlur?: () => void
  leading?: React.ReactNode
  depth?: number
  meta?: string
  tag?: string
}

export type RadioRowDisabled =
  | { disabled: true; busy?: false; reason: string }
  | { disabled: true; busy?: false; reasonScope: 'group'; reason?: never }
  | { disabled?: false; busy: true; reason: string }
  | { disabled?: false; busy?: false; reason?: never }

export type RadioRowProps = RadioRowBase & RadioRowDisabled
