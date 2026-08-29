export type CheckRowProps = {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  description?: string
  error?: string
  value?: string | number
  disabled?: boolean
  loading?: boolean
}
