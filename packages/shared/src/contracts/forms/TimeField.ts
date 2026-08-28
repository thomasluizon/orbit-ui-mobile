type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
type Hour24 = `0${Digit}` | `1${Digit}` | `2${'0' | '1' | '2' | '3'}`
type Minute = `${'0' | '1' | '2' | '3' | '4' | '5'}${Digit}`

export type Time24 = `${Hour24}:${Minute}`

export type TimeFieldProps = {
  label?: string
  value: Time24 | ''
  onChange: (value: Time24) => void
  onClear?: () => void
  hourCycle?: 'h23' | 'h12'
  id?: string
  placeholder?: string
  ariaLabel?: string
  accessibilityLabel?: string
  className?: string
  hint?: string
  disabled?: boolean
  error?: string
}
