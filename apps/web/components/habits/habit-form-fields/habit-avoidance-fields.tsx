'use client'

import { useTranslations } from 'next-intl'
import type { createHabitFormController } from '@orbit/shared/utils'
import type { HabitFormHelpers } from '@/hooks/use-habit-form'
import { ListRow } from '@/components/ui/list-row'
import { FormSectionLabel } from './form-section-label'
import { SlipAlertSection } from './slip-alert-section'

interface SlipAlertEditorProps {
  visible: boolean
  hasProAccess: boolean
  slipAlertEnabled: boolean
  onToggle: () => void
  t: ReturnType<typeof useTranslations>
}

/** The slip alert of a habit to avoid: a switch for Pro, or a Pro row that opens the upgrade route. */
export function SlipAlertEditor({ visible, hasProAccess, slipAlertEnabled, onToggle, t }: Readonly<SlipAlertEditorProps>) {
  if (!visible) return null
  return (
    <section className="flex flex-col gap-2">
      <FormSectionLabel>{t('habits.form.slipAlertQuestion')}</FormSectionLabel>
      <SlipAlertSection inline hasProAccess={hasProAccess} slipAlertEnabled={slipAlertEnabled} onToggle={onToggle} t={t} />
    </section>
  )
}

/** "Quer largar?" with its two hints, then the slip alert. An undated item has neither. */
export function HabitAvoidanceFields({ formHelpers, controller, hasProAccess }: Readonly<{ formHelpers: HabitFormHelpers; controller: ReturnType<typeof createHabitFormController>; hasProAccess: boolean }>) {
  const t = useTranslations()
  const { form } = formHelpers
  const isBadHabit = form.watch('isBadHabit') ?? false
  const slipAlertEnabled = form.watch('slipAlertEnabled') ?? false
  if (formHelpers.isGeneral) return null
  return (
    <section className="flex flex-col gap-4">
      <FormSectionLabel>{t('habits.form.avoidGroup')}</FormSectionLabel>
      <div><ListRow placement="field" title={t('habits.form.habitTypeAvoid')} description={isBadHabit ? t('habits.form.habitTypeAvoidHint') : t('habits.form.habitTypeBuildHint')} toggle={{ checked: isBadHabit, onChange: (checked) => form.setValue('isBadHabit', checked, { shouldDirty: true }) }} /></div>
      <SlipAlertEditor visible={isBadHabit} hasProAccess={hasProAccess} slipAlertEnabled={slipAlertEnabled} onToggle={() => controller.setSlipAlertEnabled(!slipAlertEnabled)} t={t} />
    </section>
  )
}
