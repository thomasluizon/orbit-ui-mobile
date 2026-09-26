
type InputBase = {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  error?: string
  hint?: string
  maxLength?: number
  kind?: 'text' | 'email' | 'number'
  inputMode?: 'text' | 'email' | 'numeric' | 'decimal' | 'tel' | 'url'
  autoComplete?: 'email' | 'name' | 'off'
  mono?: boolean
  autoFocus?: boolean
  focusRequest?: number
  name?: string
  onSubmit?: () => void
  onBlur?: () => void
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
