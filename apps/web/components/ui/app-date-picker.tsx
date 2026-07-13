'use client'

import { useState, useId, useRef, useCallback, useMemo, useEffect } from 'react'
import {
  addMonths,
  subMonths,
  setYear,
  startOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  format,
  isSameMonth,
  isSameDay,
  parseISO,
} from 'date-fns'
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { formatLocaleDate, splitMonthYear } from '@orbit/shared/utils'
import { useProfile } from '@/hooks/use-profile'
import { YearPicker } from '@/components/ui/year-picker'
import { CenteredOverlay } from '@/components/ui/centered-overlay'

interface AppDatePickerProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function AppDatePicker({
  value,
  onChange,
  placeholder,
}: Readonly<AppDatePickerProps>) {
  const t = useTranslations()
  const locale = useLocale()
  const { profile } = useProfile()
  const weekStartsOn: 0 | 1 = profile?.weekStartDay ?? 0
  const [isOpen, setIsOpen] = useState(false)
  const [pickerMode, setPickerMode] = useState<'days' | 'years'>('days')
  const [viewDate, setViewDate] = useState(() => (value ? parseISO(value) : new Date()))
  const [lastSyncedValue, setLastSyncedValue] = useState(value)
  if (value !== lastSyncedValue) {
    setLastSyncedValue(value)
    if (value) setViewDate(parseISO(value))
  }
  const dialogLabelId = useId()
  const gridRef = useRef<HTMLTableElement>(null)
  const [focusedDate, setFocusedDate] = useState<Date | null>(null)

  const selectedDate = value ? parseISO(value) : null

  const { lead: monthLead, year: yearLabel } = splitMonthYear(viewDate, locale)

  const weekDays = useMemo(() => {
    const sundayFirst = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const keys = weekStartsOn === 1
      ? [...sundayFirst.slice(1), sundayFirst[0]]
      : sundayFirst
    return keys.map((key) => ({
      key,
      label: t(`dates.daysShort.${key}`).charAt(0),
    }))
  }, [weekStartsOn, t])

  const calendarDays = useMemo(() => {
    const calStart = startOfWeek(startOfMonth(viewDate), { weekStartsOn })
    return Array.from({ length: 42 }, (_, index) => addDays(calStart, index))
  }, [viewDate, weekStartsOn])

  const calendarWeeks = (() => {
    const weeks: Date[][] = []
    for (let index = 0; index < calendarDays.length; index += 7) {
      weeks.push(calendarDays.slice(index, index + 7))
    }
    return weeks
  })()

  const rovingDay = useMemo(() => {
    if (focusedDate && isSameMonth(focusedDate, viewDate)) return focusedDate
    if (selectedDate && isSameMonth(selectedDate, viewDate)) return selectedDate
    const today = new Date()
    if (isSameMonth(today, viewDate)) return today
    return startOfMonth(viewDate)
  }, [focusedDate, selectedDate, viewDate])

  function prevMonth() {
    setViewDate((d) => subMonths(d, 1))
  }

  function nextMonth() {
    setViewDate((d) => addMonths(d, 1))
  }

  function selectYear(year: number) {
    setViewDate((d) => setYear(d, year))
    setPickerMode('days')
  }

  const closePicker = useCallback(() => {
    setIsOpen(false)
    setFocusedDate(null)
    setPickerMode('days')
  }, [])

  function selectDay(day: Date) {
    onChange(format(day, 'yyyy-MM-dd'))
    closePicker()
  }

  const displayValue = value ? formatLocaleDate(value, locale) : ''

  useEffect(() => {
    if (!isOpen) return
    requestAnimationFrame(() => {
      gridRef.current?.querySelector<HTMLButtonElement>('button[tabindex="0"]')?.focus()
    })
  }, [isOpen])

  function focusDayButton(day: Date) {
    setFocusedDate(day)
    if (!isSameMonth(day, viewDate)) setViewDate(day)
    requestAnimationFrame(() => {
      gridRef.current
        ?.querySelector<HTMLButtonElement>(`button[data-day="${format(day, 'yyyy-MM-dd')}"]`)
        ?.focus()
    })
  }

  function handleGridKeyDown(e: React.KeyboardEvent) {
    const anchor = focusedDate ?? selectedDate ?? new Date()
    let next: Date | null = null
    if (e.key === 'ArrowLeft') next = addDays(anchor, -1)
    else if (e.key === 'ArrowRight') next = addDays(anchor, 1)
    else if (e.key === 'ArrowUp') next = addDays(anchor, -7)
    else if (e.key === 'ArrowDown') next = addDays(anchor, 7)
    else if (e.key === 'Home') next = startOfWeek(anchor, { weekStartsOn })
    else if (e.key === 'End') next = endOfWeek(anchor, { weekStartsOn })
    else if (e.key === 'PageUp') next = subMonths(anchor, 1)
    else if (e.key === 'PageDown') next = addMonths(anchor, 1)
    if (!next) return
    e.preventDefault()
    focusDayButton(next)
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={displayValue ? t('common.selectedDate', { date: displayValue }) : t('common.selectDate')}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className="w-full min-h-[54px] bg-[var(--bg-field)] text-[var(--fg-1)] rounded-[14px] py-3 px-4 text-base shadow-[inset_0_0_0_1px_var(--hairline)] text-left flex items-center justify-between focus:outline-none focus:shadow-[inset_0_0_0_2px_var(--primary)] transition-[background-color,box-shadow,color] duration-[var(--dur-fast)]"
        onClick={() => (isOpen ? closePicker() : setIsOpen(true))}
      >
        <span>{displayValue || placeholder || t('common.selectDate')}</span>
        <Calendar size={20} strokeWidth={1.8} className="text-[var(--fg-4)]" />
      </button>

      <CenteredOverlay
        open={isOpen}
        onDismiss={closePicker}
        ariaLabelledBy={dialogLabelId}
        panelClassName="w-[min(90vw,320px)] rounded-[16px] bg-[var(--bg-sheet)] p-2.5 text-[var(--fg-1)] shadow-[var(--shadow-2),inset_0_0_0_1px_var(--hairline)]"
      >
        <div className="flex items-center justify-between mb-2">
          <button
            type="button"
            className={`p-[13px] rounded-lg hover:bg-[var(--bg-elev)] ${pickerMode === 'years' ? 'invisible' : ''}`}
            aria-label={t('common.previousMonth')}
            onClick={prevMonth}
          >
            <ChevronLeft size={18} strokeWidth={1.8} className="text-[var(--fg-3)]" />
          </button>
          <span id={dialogLabelId} className="flex items-center gap-1" aria-live="polite">
            {monthLead && (
              <span className="text-xs font-medium text-[var(--fg-1)]">{monthLead}</span>
            )}
            <button
              type="button"
              aria-label={t('common.selectYear')}
              aria-expanded={pickerMode === 'years'}
              onClick={() => setPickerMode((mode) => (mode === 'years' ? 'days' : 'years'))}
              className="relative text-xs font-medium rounded-md px-1 py-0.5 hover:bg-[var(--bg-elev)] transition-[background-color,color] after:content-[''] after:absolute after:-inset-[10px]"
              style={{ color: pickerMode === 'years' ? 'var(--primary)' : 'var(--fg-1)' }}
            >
              {yearLabel}
            </button>
          </span>
          <button
            type="button"
            className={`p-[13px] rounded-lg hover:bg-[var(--bg-elev)] ${pickerMode === 'years' ? 'invisible' : ''}`}
            aria-label={t('common.nextMonth')}
            onClick={nextMonth}
          >
            <ChevronRight size={18} strokeWidth={1.8} className="text-[var(--fg-3)]" />
          </button>
        </div>

        {pickerMode === 'years' ? (
          <YearPicker
            selectedYear={viewDate.getFullYear()}
            onSelectYear={selectYear}
          />
        ) : (
          <table
            ref={gridRef}
            role="grid"
            className="w-full border-separate border-spacing-0"
            onKeyDown={handleGridKeyDown}
          >
            <thead aria-hidden="true">
              <tr>
                {weekDays.map((day) => (
                  <th
                    key={day.key}
                    scope="col"
                    className="py-1 text-center text-xs font-normal uppercase text-[var(--fg-3)]"
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {day.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calendarWeeks.map((week) => (
                <tr key={week[0]?.toISOString()}>
                  {week.map((day) => {
                    const isSelected = selectedDate && isSameDay(day, selectedDate)
                    const isToday = isSameDay(day, new Date())
                    const isCurrentMonth = isSameMonth(day, viewDate)

                    const isRoving = isSameDay(day, rovingDay)

                    return (
                      <td key={day.toISOString()} className="p-0">
                        <button
                          type="button"
                          data-day={format(day, 'yyyy-MM-dd')}
                          tabIndex={isRoving ? 0 : -1}
                          aria-label={formatLocaleDate(day, locale, {
                            month: 'long',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                          aria-pressed={!!isSelected}
                          aria-current={isToday ? 'date' : undefined}
                          className={`flex aspect-square w-full items-center justify-center rounded-full text-xs transition-colors focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--primary)] ${
                            isCurrentMonth
                              ? 'text-[var(--fg-1)] hover:bg-[var(--bg-elev)]'
                              : 'text-[var(--fg-3)]'
                          } ${
                            isSelected
                              ? 'bg-[var(--primary)] text-[var(--fg-on-primary)] hover:bg-[var(--primary-pressed)]'
                              : ''
                          } ${
                            isToday && !isSelected
                              ? 'shadow-[inset_0_0_0_1px_var(--primary)]'
                              : ''
                          }`}
                          onClick={() => selectDay(day)}
                        >
                          {format(day, 'd')}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CenteredOverlay>
    </div>
  )
}
