'use client'

import type { CSSProperties } from 'react'
import type { HabitUnderstandingProps } from '@orbit/shared/utils'

type WeekdayPickerProps = Pick<HabitUnderstandingProps, 'days' | 'daily' | 'dayOptions' | 'onToggleDay' | 'proposed' | 'scheduleLocked'> & { label: string }

export function WeekdayPicker({ days, daily = false, dayOptions, onToggleDay, proposed = false, scheduleLocked = false, label }: Readonly<WeekdayPickerProps>) {
  return <fieldset aria-label={label} className="flex w-full flex-nowrap" style={{ gap: 4, maxWidth: 'calc(7 * var(--touch-min) + 6 * 4px)' }}>
    {dayOptions.map((day) => {
      const selected = daily || days.includes(day.value)
      return <button key={day.value} type="button" aria-pressed={selected} aria-label={day.accessibleLabel} disabled={scheduleLocked}
        style={proposed ? { '--selection-ring-color': 'var(--fg-3)' } as CSSProperties : undefined}
        className={`orbit-selection-ring orbit-selection-ring-thin habit-control-motion grid min-h-[var(--touch-min)] min-w-[24px] flex-1 basis-0 place-items-center rounded-full border-0 text-sm font-medium enabled:hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] active:scale-[0.96] disabled:opacity-40 ${selected ? proposed ? 'bg-[var(--bg-well)] text-[var(--fg-2)]' : 'bg-[var(--primary-dim)] text-[var(--fg-1)]' : 'bg-[var(--bg-well)] text-[var(--fg-2)] shadow-[inset_0_0_0_1px_var(--hairline)] enabled:hover:text-[var(--fg-1)]'}`}
        onClick={() => onToggleDay(day.value)}>{day.label.charAt(0)}</button>
    })}
  </fieldset>
}
