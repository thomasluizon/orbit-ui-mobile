import type { HabitPhraseToken } from '@orbit/shared/utils'
import { Input } from '@/components/ui/input'

interface PhraseFieldProps {
  /** The question of the step: the accessible name of the field. The question heading shows it, so the label is hidden. */
  label: string
  value: string
  placeholder: string
  /** The limit of the record the phrase names: the onboarding title or the habit title. */
  maxLength: number
  /** The hint beside the field after an empty submit, or the server message of the phrase. */
  hint?: string
  /** The words the device read, marked live in the field. */
  marks: readonly HabitPhraseToken[]
  marksLabel: string
  focusRequest?: number
  onChange: (value: string) => void
}

/** The free path of the first step of a guided create flow: the person's own words, read live on the device. Onboarding and the habit create flow both render it. */
export function PhraseField({ label, value, placeholder, maxLength, hint, marks, marksLabel, focusRequest, onChange }: Readonly<PhraseFieldProps>) {
  return (
    <Input autoFocus hideLabel multiline rows={3} name="title" maxLength={maxLength} label={label} value={value} placeholder={placeholder}
      error={hint} marks={marks} marksLabel={marksLabel} focusRequest={focusRequest} onChange={onChange} />
  )
}
