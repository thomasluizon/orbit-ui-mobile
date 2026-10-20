export interface OtpInputProps {
  length?: number
  value: string
  onChange: (value: string) => void
  focusRequest?: number
  onBlur?: () => void
  onComplete?: (value: string) => void
  error?: string
  hint?: string
  disabled?: boolean
  autoFocus?: boolean
  label: string
  id?: string
  name?: string
}
