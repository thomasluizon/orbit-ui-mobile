import type { ReactNode } from 'react'

type InputBase = {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  error?: string
  maxLength?: number
  kind?: 'text' | 'email' | 'number'
  inputMode?: 'text' | 'email' | 'numeric' | 'decimal' | 'tel' | 'url'
  autoComplete?: 'email' | 'name' | 'off'
  mono?: boolean
  autoFocus?: boolean
  onSubmit?: () => void
  trailing?: ReactNode
}

type SingleLineInput = {
  multiline?: never
  rows?: never
}

type MultilineInput = {
  multiline: true
  rows?: number
}

export type InputProps = InputBase & (SingleLineInput | MultilineInput)
