
export interface RadioRowBase {
  label: string
  wrapLabel?: boolean
  textMode?: 'personal'
  description?: string
  selected?: boolean
  onSelect?: () => void
  leading?: React.ReactNode
  depth?: number
  meta?: string
  tag?: string
}

export type RadioRowDisabled =
  | { disabled: true; reason: string }
  | { disabled?: false; reason?: never }

export type RadioRowProps = RadioRowBase & RadioRowDisabled
