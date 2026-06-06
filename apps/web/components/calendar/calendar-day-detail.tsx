'use client'

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { plural } from '@/lib/plural'
import { useTimeFormat } from '@/hooks/use-time-format'
import { useDateFormat } from '@/hooks/use-date-format'
import { parseAPIDate } from '@orbit/shared/utils'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import { AppOverlay } from '@/components/ui/app-overlay'

interface CalendarDayDetailProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dateStr: string | null
  entries: CalendarDayEntry[]
}

// Tint for the outcome badge. Only resolved states are rendered, so there is no upcoming
// case: for bad habits "indulged" (completed) reads as a setback, "resisted" (missed) as a win.
function statusBadgeClass(entry: CalendarDayEntry): string {
  const border = 'border border-[var(--hairline)]'
  if (entry.isBadHabit) {
    return `${entry.status === 'completed' ? 'text-[var(--status-bad)]' : 'text-[var(--status-done)]'} ${border}`
  }
  return `${entry.status === 'completed' ? 'text-[var(--status-done)]' : 'text-[var(--status-overdue)]'} ${border}`
}

function statusIconBg(entry: CalendarDayEntry): string {
  if (entry.status === 'completed') return 'bg-[var(--bg-elev)] border-[var(--status-done)]'
  return 'border-[var(--hairline-strong)]'
}

export function CalendarDayDetail({
  open,
  onOpenChange,
  dateStr,
  entries,
}: Readonly<CalendarDayDetailProps>) {
  const t = useTranslations()
  const { displayTime } = useTimeFormat()
  const { displayWeekdayDate } = useDateFormat()
  const [showRecurring, setShowRecurring] = useState(true)

  const formattedDate = useMemo(() => {
    if (!dateStr) return ''
    const date = parseAPIDate(dateStr)
    return displayWeekdayDate(date)
  }, [dateStr, displayWeekdayDate])

  const filteredEntries = useMemo(() => {
    if (showRecurring) return entries
    return entries.filter((e) => e.isOneTime)
  }, [entries, showRecurring])

  const completedCount = filteredEntries.filter((e) => e.status === 'completed').length

  // Only resolved states carry a visible badge; an upcoming habit shows none.
  const statusLabel = useCallback((entry: CalendarDayEntry): string | null => {
    if (entry.isBadHabit) {
      if (entry.status === 'completed') return t('calendar.status.indulged')
      if (entry.status === 'missed') return t('calendar.status.resisted')
      return null
    }
    if (entry.status === 'completed') return t('calendar.status.completed')
    if (entry.status === 'missed') return t('calendar.status.missed')
    return null
  }, [t])

  return (
    <AppOverlay
      open={open}
      onOpenChange={onOpenChange}
      title={formattedDate}
      footer={
        <Link
          href={`/?date=${dateStr ?? ''}`}
          className="w-full py-3 rounded-[var(--radius-lg)] bg-[var(--primary)] text-[var(--fg-on-primary)] font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[var(--primary-pressed)] transition-[background-color,transform] duration-150 active:scale-[0.98]"
          onClick={() => onOpenChange(false)}
        >
          <ArrowRight className="size-4" />
          {t('calendar.goToDay')}
        </Link>
      }
    >
      {entries.length === 0 ? (
        <div className="text-[var(--fg-3)] text-sm text-center py-8">
          {t('calendar.noHabitsScheduled')}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--fg-3)]">
              {plural(t('calendar.dayDetail.completionSummary', {
                done: completedCount,
                total: filteredEntries.length,
              }), filteredEntries.length)}
            </p>
            <label className="flex items-center gap-2 text-sm text-[var(--fg-2)] cursor-pointer">
              <input
                type="checkbox"
                checked={showRecurring}
                onChange={(e) => setShowRecurring(e.target.checked)}
                className="accent-[var(--primary)]"
              />
              {t('calendar.showRecurring')}
            </label>
          </div>

          {filteredEntries.length === 0 && (
            <div className="text-[var(--fg-3)] text-sm text-center py-6">
              {t('calendar.noHabitsScheduled')}
            </div>
          )}

          {filteredEntries.map((entry, i) => {
            const label = statusLabel(entry)
            return (
              <div key={entry.habitId}>
                <div className="flex items-center gap-3 py-3">
                  <div
                    className={`shrink-0 size-6 rounded-full border flex items-center justify-center ${statusIconBg(entry)}`}
                  >
                    {entry.status === 'completed' && (
                      <Check className="size-3 text-[var(--status-done)]" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span
                        className={`text-sm font-medium text-[var(--fg-1)] truncate ${entry.status === 'completed' ? 'opacity-60' : ''}`}
                      >
                        {entry.title}
                      </span>
                      {entry.dueTime && (
                        <span className="shrink-0 text-[11px] font-semibold text-[var(--fg-2)]">
                          {displayTime(entry.dueTime)}
                        </span>
                      )}
                    </div>
                  </div>

                  {label && (
                    <span
                      className={`shrink-0 px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${statusBadgeClass(entry)}`}
                    >
                      {label}
                    </span>
                  )}
                </div>
                {i < filteredEntries.length - 1 && <div className="h-px bg-[var(--hairline)]" />}
              </div>
            )
          })}
        </div>
      )}
    </AppOverlay>
  )
}
