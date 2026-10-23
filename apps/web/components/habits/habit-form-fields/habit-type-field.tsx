'use client'

import { useId } from 'react'
import { useTranslations } from 'next-intl'
import type { HabitFormHelpers } from '@/hooks/use-habit-form'
import { RadioGroup } from '@/components/ui/radio-row'
import { RadioRow } from '@/components/ui/select-check'

export function HabitTypeField({ formHelpers, lockedGeneral, onChange }: Readonly<{ formHelpers: HabitFormHelpers; lockedGeneral: boolean | null; onChange: () => void }>) {
  const id = useId()
  const errorId = `habit-type-error-${id}`
  const t = useTranslations()
  const itemType = formHelpers.form.watch('itemType')
  const errors = formHelpers.form.formState.errors
  const recurrenceMismatch = errors.datePhrase?.message === 'habits.form.recurrenceRequiresHabit'
  const choose = (type: 'task' | 'habit') => { onChange(); formHelpers.chooseItemType(type) }
  return (
      <div className="flex min-w-0 flex-col gap-2">
        <span className="form-label">{t('habits.form.itemType')}</span>
        <RadioGroup aria-label={t('habits.form.itemType')} focusRequest={errors.itemType || recurrenceMismatch ? formHelpers.validationFocusRequest : undefined} aria-required="true" aria-invalid={Boolean(errors.itemType)} aria-describedby={errors.itemType ? errorId : undefined}>
          <RadioRow wrapLabel label={t('habits.form.typeTask')} selected={itemType === 'task'} {...(lockedGeneral === true ? { disabled: true as const, reason: t('common.locked') } : { disabled: false as const })} onSelect={() => choose('task')} />
          <RadioRow wrapLabel label={t('habits.form.typeHabit')} selected={itemType === 'habit'} disabled={false} onSelect={() => choose('habit')} />
        </RadioGroup>
        {errors.itemType ? <p id={errorId} role="alert" className="text-sm text-[var(--status-bad-text)]">{t('habits.form.typeRequired')}</p> : null}
      </div>
  )
}
