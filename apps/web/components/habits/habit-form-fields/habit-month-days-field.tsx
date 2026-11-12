'use client'

import { useId, type CSSProperties } from 'react'
import { useTranslations } from 'next-intl'
import { formatHabitMonthDaySchedule, HABIT_MONTH_DAY_OPTIONS, resolveHabitMonthDaySelection } from '@orbit/shared/utils'

const SHORT_MONTH_DAY = 29

interface HabitMonthDaysFieldProps {
  visible: boolean
  monthDays: readonly number[]
  anchorDay: number
  quantity: number
  disabled?: boolean
  proposed?: boolean
  onToggle: (day: number) => void
}

export function HabitMonthDaysField({ visible, monthDays, anchorDay, quantity, disabled = false, proposed = false, onToggle }: Readonly<HabitMonthDaysFieldProps>) {
  const t = useTranslations()
  const summaryId = useId()
  if (!visible) return null
  const selected = resolveHabitMonthDaySelection(monthDays, anchorDay)
  const question = t('habits.form.monthDaysQuestion')
  return (
    <section data-habit-month-days="" className="flex min-w-0 flex-col gap-2">
      <span className="text-sm font-medium text-[var(--fg-2)]">{question}</span>
      <fieldset aria-label={question} aria-describedby={summaryId} className="grid min-w-0 grid-cols-7" style={{ gap: 8, maxWidth: 'calc(7 * var(--touch-min) + 6 * 8px)' }}>
        {HABIT_MONTH_DAY_OPTIONS.map((day) => {
          const chosen = selected.includes(day)
          return <button key={day} type="button" aria-pressed={chosen} disabled={disabled}
            style={proposed ? { '--selection-ring-color': 'var(--fg-3)' } as CSSProperties : undefined}
            className={`orbit-selection-ring orbit-selection-ring-thin habit-control-motion grid min-h-[var(--touch-min)] min-w-[24px] place-items-center rounded-full border-0 font-mono text-sm tabular-nums enabled:hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] active:scale-[0.96] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--fg-1)] disabled:opacity-40 ${chosen ? proposed ? 'bg-[var(--bg-well)] text-[var(--fg-2)]' : 'bg-[var(--primary-dim)] text-[var(--fg-1)]' : 'bg-[var(--bg-well)] text-[var(--fg-2)] shadow-[inset_0_0_0_1px_var(--hairline)] enabled:hover:text-[var(--fg-1)]'}`}
            onClick={() => onToggle(day)}>{day}</button>
        })}
      </fieldset>
      <p id={summaryId} data-month-days-summary="" className={`text-sm ${proposed ? 'text-[var(--fg-3)]' : 'text-[var(--fg-2)]'}`}>{formatHabitMonthDaySchedule(selected, quantity, t)}</p>
      {selected.some((day) => day >= SHORT_MONTH_DAY) ? <p className="text-sm text-[var(--fg-3)]">{t('habits.form.monthDaysShortMonth')}</p> : null}
    </section>
  )
}
