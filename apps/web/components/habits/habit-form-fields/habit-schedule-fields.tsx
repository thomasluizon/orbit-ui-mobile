'use client'

import { useTranslations } from 'next-intl'
import type { FrequencyUnit } from '@orbit/shared/types/habit'
import { buildHabitFrequencyUnits, type HabitScheduleFieldsProps } from '@orbit/shared/utils'
import { Input } from '@/components/ui/input'
import { RadioGroup } from '@/components/ui/radio-row'
import { RadioRow } from '@/components/ui/select-check'

export function HabitScheduleFields({ unit, quantity, flexible, disabled, onChange }: Readonly<HabitScheduleFieldsProps>) {
  const t = useTranslations()
  const availability = disabled ? { disabled: true as const, reason: t('common.locked') } : { disabled: false as const }
  const invalid = Boolean(unit) && (quantity === null || !Number.isInteger(quantity) || quantity < 1)
  const change = (nextUnit: FrequencyUnit, nextQuantity: number | null, nextFlexible: boolean) => {
    if (!disabled) onChange(nextUnit, nextQuantity, nextFlexible)
  }
  return (
    <section className="flex min-w-0 flex-col gap-4">
      <RadioGroup aria-label={t('habits.form.frequency')} className="-mx-4">
        <RadioRow label={t('habits.form.every')} selected={Boolean(unit) && !flexible} {...availability} onSelect={() => change(unit ?? 'Day', quantity ?? 1, false)} />
        <RadioRow label={t('habits.form.timesPerUnit')} selected={flexible} {...availability} onSelect={() => change(unit ?? 'Week', quantity ?? 3, true)} />
      </RadioGroup>
      <Input
        label={t('habits.form.frequency')}
        name="frequencyQuantity"
        autoComplete="off"
        kind="number"
        inputMode="numeric"
        mono
        value={quantity === null ? '' : String(quantity)}
        disabled={disabled}
        error={invalid ? t('habits.form.frequencyRequired') : undefined}
        onChange={(value) => change(unit ?? 'Day', value.trim() === '' ? null : Number(value), flexible)}
      />
      <div className="flex min-w-0 flex-col gap-2">
        <span className="text-sm font-medium text-[var(--fg-2)]">{t('habits.form.unit')}</span>
        <RadioGroup aria-label={t('habits.form.unit')} className="-mx-4">
          {buildHabitFrequencyUnits({ unitDay: t('habits.form.unitDay'), unitWeek: t('habits.form.unitWeek'), unitMonth: t('habits.form.unitMonth'), unitYear: t('habits.form.unitYear') }).map((option) => (
            <RadioRow key={option.value} label={option.label} selected={unit === option.value} {...availability} onSelect={() => change(option.value, quantity ?? 1, flexible)} />
          ))}
        </RadioGroup>
      </div>
      {flexible && unit && quantity !== null && !invalid ? <span className="text-sm leading-[1.5] text-[var(--fg-3)]">{t('habits.form.flexibleDescription', { n: quantity, unit: t(`habits.form.unit${unit}`) })}</span> : null}
    </section>
  )
}
