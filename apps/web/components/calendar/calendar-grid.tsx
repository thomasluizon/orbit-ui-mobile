'use client'

import { useMemo } from 'react'
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  getDate,
  format,
} from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import { useTranslations, useLocale } from 'next-intl'
import { formatAPIDate } from '@orbit/shared/utils'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import { useProfile } from '@/hooks/use-profile'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CalendarGridProps {
  currentMonth: Date
  dayMap: Map<string, CalendarDayEntry[]>
  onSelectDay: (dateStr: string) => void
}

interface GridDay {
  date: Date
  dateStr: string
  day: number
  isCurrentMonth: boolean
  isToday: boolean
  entries: CalendarDayEntry[]
  completedCount: number
  totalCount: number
  completionRatio: number
}

type DayStatus = 'empty' | 'done' | 'missed' | 'upcoming'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dayStatus(cell: GridDay): DayStatus {
  if (!cell.isCurrentMonth || cell.totalCount === 0) return 'empty'
  if (cell.completedCount === cell.totalCount) return 'done'
  const hasMissed = cell.entries.some((e) => e.status === 'missed')
  if (hasMissed) return 'missed'
  return 'upcoming'
}

function dayBgClass(cell: GridDay): string {
  const status = dayStatus(cell)
  switch (status) {
    case 'done':
      return cell.completionRatio >= 0.9 ? 'bg-green-500' : 'bg-green-500/60'
    case 'missed':
      return 'bg-orange-500/30'
    case 'upcoming':
      return 'bg-primary/20'
    default:
      return cell.isCurrentMonth ? 'bg-surface-ground' : ''
  }
}

function dayTextClass(cell: GridDay): string {
  if (!cell.isCurrentMonth) return 'text-text-faded/40'
  const status = dayStatus(cell)
  switch (status) {
    case 'done':
      return 'text-white font-bold'
    case 'missed':
      return 'text-orange-300 font-medium'
    case 'upcoming':
      return 'text-text-primary font-medium'
    default:
      return 'text-text-faded'
  }
}

function dotClass(cell: GridDay): string {
  const status = dayStatus(cell)
  switch (status) {
    case 'done':
      return 'bg-green-400 animate-perfect-day'
    case 'missed':
      return 'bg-orange-400'
    case 'upcoming':
      return 'bg-primary-400'
    default:
      return ''
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CalendarGrid({ currentMonth, dayMap, onSelectDay }: Readonly<CalendarGridProps>) {
  const t = useTranslations()
  const locale = useLocale()
  const dateFnsLocale = locale === 'pt-BR' ? ptBR : enUS
  const { profile } = useProfile()
  const weekStartsOn: 0 | 1 = (profile?.weekStartDay as 0 | 1) ?? 1

  const weekdayHeaders = useMemo(() => {
    const mondayFirst = [
      t('dates.daysShort.monday'),
      t('dates.daysShort.tuesday'),
      t('dates.daysShort.wednesday'),
      t('dates.daysShort.thursday'),
      t('dates.daysShort.friday'),
      t('dates.daysShort.saturday'),
      t('dates.daysShort.sunday'),
    ]
    if (weekStartsOn === 0) {
      return [
        t('dates.daysShort.sunday'),
        ...mondayFirst.slice(0, 6),
      ]
    }
    return mondayFirst
  }, [weekStartsOn, t])

  const gridDays = useMemo<GridDay[]>(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    const gridStart = startOfWeek(monthStart, { weekStartsOn })
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn })

    return eachDayOfInterval({ start: gridStart, end: gridEnd }).map((date) => {
      const dateStr = formatAPIDate(date)
      const entries = dayMap.get(dateStr) ?? []
      const completedCount = entries.filter((e) => e.status === 'completed').length
      const totalCount = entries.length

      return {
        date,
        dateStr,
        day: getDate(date),
        isCurrentMonth: isSameMonth(date, currentMonth),
        isToday: isToday(date),
        entries,
        completedCount,
        totalCount,
        completionRatio: totalCount > 0 ? completedCount / totalCount : 0,
      }
    })
  }, [currentMonth, dayMap, weekStartsOn])

  return (
    <div className="space-y-2" data-tour="tour-calendar-grid">
      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {weekdayHeaders.map((day) => (
          <div key={day} className="text-center text-xs font-bold text-text-faded">
            {day}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {gridDays.map((cell, index) => {
          const canSelect = cell.isCurrentMonth

          return (
            <button
              key={cell.dateStr}
              data-tour={index === 0 ? 'tour-calendar-day' : undefined}
              aria-label={format(cell.date, 'EEEE, MMMM d', { locale: dateFnsLocale })}
              aria-current={cell.isToday ? 'date' : undefined}
              aria-disabled={!canSelect}
              className={`aspect-square rounded-[var(--radius-xl)] flex flex-col items-center justify-center text-sm transition-all duration-150 relative gap-0.5 ${dayBgClass(cell)} ${dayTextClass(cell)} ${canSelect ? 'cursor-pointer hover:ring-2 hover:ring-primary/30' : ''} ${cell.isToday ? 'ring-2 ring-background ring-offset-2 ring-offset-primary' : ''}`}
              onClick={() => canSelect && onSelectDay(cell.dateStr)}
            >
              <span aria-hidden="true">{cell.day}</span>
              {cell.isCurrentMonth && cell.totalCount > 0 && (
                <span aria-hidden="true" className="flex gap-px">
                  <span className={`size-1 rounded-full ${dotClass(cell)}`} />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
