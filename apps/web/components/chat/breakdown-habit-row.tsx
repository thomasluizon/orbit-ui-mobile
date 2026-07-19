'use client'

import { X } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import type { BreakdownEditableHabit } from '@orbit/shared/utils'
import { BreakdownFrequencyPicker } from './breakdown-frequency-picker'

export type EditableHabit = BreakdownEditableHabit

interface FrequencyOption {
  value: string
  label: string
}

interface BreakdownHabitRowProps {
  habit: EditableHabit
  frequencyOptions: FrequencyOption[]
  onUpdate: (patch: Partial<EditableHabit>) => void
  onRemove: () => void
}

export function BreakdownHabitRow({
  habit,
  frequencyOptions,
  onUpdate,
  onRemove,
}: Readonly<BreakdownHabitRowProps>) {
  const t = useTranslations()
  return (
    <div className="bg-[var(--bg-elev)] rounded-[12px] p-3 flex items-center justify-between gap-3 shadow-[inset_0_0_0_1px_var(--hairline)]">
      <div className="flex flex-col flex-1 min-w-0 gap-1">
        <input
          type="text"
          value={habit.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          placeholder={t('habits.breakdown.habitNamePlaceholder')}
          className="w-full bg-transparent text-sm font-medium text-[var(--fg-1)] placeholder:text-[var(--fg-3)] outline-none rounded-sm focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]"
        />
        <BreakdownFrequencyPicker
          frequencyUnit={habit.frequencyUnit}
          frequencyQuantity={habit.frequencyQuantity}
          frequencyOptions={frequencyOptions}
          onSelectUnit={(val) =>
            onUpdate({
              frequencyUnit: val,
              frequencyQuantity: val ? habit.frequencyQuantity : null,
            })
          }
          onChangeQuantity={(quantity) =>
            onUpdate({ frequencyQuantity: quantity })
          }
        />
      </div>
      <button
        type="button"
        aria-label={t('habits.breakdown.removeHabit', { name: habit.title || t('habits.breakdown.habitNamePlaceholder') })}
        className="relative shrink-0 p-1.5 rounded-full text-[var(--fg-3)] hover:text-[var(--status-bad)] hover:bg-[var(--status-bad)]/10 active:scale-[0.96] transition-[color,background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] after:absolute after:-inset-2"
        onClick={onRemove}
      >
        <X className="size-3.5" />
      </button>
    </div>
  )
}
