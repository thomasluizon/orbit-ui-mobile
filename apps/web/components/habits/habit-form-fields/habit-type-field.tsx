'use client'

import { useTranslations } from 'next-intl'
import type { HabitFormHelpers } from '@/hooks/use-habit-form'
import { RadioGroup } from '@/components/ui/radio-group'
import { RadioRow } from '@/components/ui/select-check'

export function HabitTypeField({ formHelpers, lockedGeneral, onChange }: Readonly<{ formHelpers: HabitFormHelpers; lockedGeneral: boolean | null; onChange: () => void }>) {
  const t = useTranslations()
  const itemType = formHelpers.form.watch('itemType')
  const errors = formHelpers.form.formState.errors
  const recurrenceMismatch = errors.datePhrase?.message === 'habits.form.recurrenceRequiresHabit' || errors.datePhrase?.message === 'errors.api.generalMismatchWithParent'
  const choose = (type: 'task' | 'habit') => { onChange(); formHelpers.chooseItemType(type) }
  return (
      <div className="flex min-w-0 flex-col gap-2">
        <span className="form-label">{t('habits.form.itemType')}</span>
        <RadioGroup aria-label={t('habits.form.itemType')} focusRequest={recurrenceMismatch ? formHelpers.validationFocusRequest : undefined} aria-required="true">
          <RadioRow wrapLabel label={t('habits.form.typeTask')} description={t('habits.form.typeTaskHint')} selected={itemType === 'task'} {...(lockedGeneral === true ? { disabled: true as const, reason: t('common.locked') } : { disabled: false as const })} onSelect={() => choose('task')} />
          <RadioRow wrapLabel label={t('habits.form.typeHabit')} description={t('habits.form.typeHabitHint')} selected={itemType === 'habit'} disabled={false} onSelect={() => choose('habit')} />
        </RadioGroup>
      </div>
  )
}
