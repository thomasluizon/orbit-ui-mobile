export interface OtpInputProps {
  length?: number
  value: string
  onChange: (value: string) => void
  onComplete?: (value: string) => void
  error?: string
  hint?: string
  disabled?: boolean
  autoFocus?: boolean
  label: string
  id?: string
}
