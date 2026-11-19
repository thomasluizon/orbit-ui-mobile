'use client'

import type { HabitPhraseToken } from '@orbit/shared/utils'
import { Input } from '@/components/ui/input'

interface PhraseFieldProps {
  label: string
  value: string
  placeholder: string
  maxLength: number
  hint?: string
  marks: readonly HabitPhraseToken[]
  marksLabel: string
  focusRequest?: number
  onChange: (value: string) => void
  onSubmit: () => void
}

/** The free path of the first step of a guided create flow: the person's own words, read live on the device. Onboarding and the habit create flow both render it. */
export function PhraseField({ label, value, placeholder, maxLength, hint, marks, marksLabel, focusRequest, onChange, onSubmit }: Readonly<PhraseFieldProps>) {
  return (
    <Input autoFocus hideLabel multiline rows={3} name="title" maxLength={maxLength} label={label} value={value} placeholder={placeholder}
      error={hint} marks={marks} marksLabel={marksLabel} focusRequest={focusRequest} onChange={onChange} onSubmit={onSubmit} />
  )
}
