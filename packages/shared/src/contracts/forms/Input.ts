
type InputBase = {
  label: string
  labelIcon?: React.ReactNode
  proposed?: boolean
  hideLabel?: boolean
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  required?: boolean
  error?: string
  hint?: string
  maxLength?: number
  kind?: 'text' | 'email' | 'number' | 'search'
  inputMode?: 'text' | 'email' | 'numeric' | 'decimal' | 'tel' | 'url'
  autoComplete?: 'email' | 'name' | 'off'
  mono?: boolean
  autoFocus?: boolean
  focusRequest?: number
  name?: string
  onSubmit?: () => void
  onBlur?: () => void
  onCancel?: () => void
  trailing?: React.ReactNode
}

type SingleLineInput = {
  multiline?: never
  rows?: never
}

type MultilineInput = {
  multiline: true
  rows?: number
} & (
  | { marks?: never; marksLabel?: never }
  | { marks: readonly { start: number; end: number }[]; marksLabel: string }
)

export type InputProps = InputBase & (SingleLineInput | MultilineInput)
