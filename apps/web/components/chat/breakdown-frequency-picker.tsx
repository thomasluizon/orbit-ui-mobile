'use client'

import { useTranslations } from 'next-intl'
import { ChevronDown } from 'lucide-react'
import type { FrequencyUnit } from '@orbit/shared/types/habit'
import { frequencyUnitSchema } from '@orbit/shared/types/habit'

interface FrequencyOption {
  value: string
  label: string
}

interface BreakdownFrequencyPickerProps {
  frequencyUnit: FrequencyUnit | null
  frequencyQuantity: number | null
  frequencyOptions: FrequencyOption[]
  onSelectUnit: (unit: FrequencyUnit | null) => void
  onChangeQuantity: (quantity: number) => void
}

export function BreakdownFrequencyPicker({
  frequencyUnit,
  frequencyQuantity,
  frequencyOptions,
  onSelectUnit,
  onChangeQuantity,
}: Readonly<BreakdownFrequencyPickerProps>) {
  const t = useTranslations()
  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <select
          value={frequencyUnit ?? ''}
          onChange={(e) => {
            const rawVal = e.target.value
            const parsed = frequencyUnitSchema.safeParse(rawVal)
            const val: FrequencyUnit | null = parsed.success ? parsed.data : null
            onSelectUnit(val)
          }}
          className="appearance-none bg-transparent pr-4 text-[11px] text-[var(--fg-2)] outline-none cursor-pointer rounded-sm focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
        >
          {frequencyOptions.map((opt) => (
            <option
              key={opt.value}
              value={opt.value}
              className="bg-[var(--bg-elev)] text-[var(--fg-1)]"
            >
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={12}
          strokeWidth={1.8}
          className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-[var(--fg-4)]"
        />
      </div>
      {frequencyUnit && (
        <>
          <span className="text-[11px] text-[var(--fg-3)]">{t('habits.breakdown.every')}</span>
          <input
            type="number"
            min={1}
            aria-label={t('habits.breakdown.frequencyQuantityLabel')}
            value={frequencyQuantity ?? 1}
            onChange={(e) => onChangeQuantity(Number(e.target.value) || 1)}
            className="w-8 bg-transparent text-[11px] text-[var(--fg-2)] text-center outline-none rounded-sm focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="text-[11px] text-[var(--fg-3)]">
            {t(`habits.form.unit${frequencyUnit}` as Parameters<typeof t>[0])}
          </span>
        </>
      )}
    </div>
  )
}
