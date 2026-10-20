export type CheckboxProps = {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  error?: boolean
  disabled?: boolean
  loading?: boolean
  as?: 'button' | 'span'
}
