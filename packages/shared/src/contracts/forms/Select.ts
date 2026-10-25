export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps {
  value: string | null
  onChange: (value: string) => void
  options: readonly SelectOption[]
  label: string
  disabled?: boolean
}
