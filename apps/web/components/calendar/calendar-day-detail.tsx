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

function statusBadgeColor(entry: CalendarDayEntry): string {
  if (entry.isBadHabit) {
    return entry.status === 'completed' ? 'var(--status-bad)' : 'var(--status-done)'
  }
  return entry.status === 'completed' ? 'var(--status-done)' : 'var(--status-overdue)'
}

function statusCircleStyle(entry: CalendarDayEntry): React.CSSProperties {
  if (entry.status === 'completed') {
    return {
      background: entry.isBadHabit ? 'var(--status-bad)' : 'var(--status-done)',
    }
  }
  if (entry.status === 'missed' && !entry.isBadHabit) {
    return { boxShadow: 'inset 0 0 0 2px var(--status-overdue)' }
  }
  return { boxShadow: 'inset 0 0 0 2px var(--status-empty)' }
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
          className="flex w-full items-center justify-center gap-[9px] rounded-full bg-[var(--primary)] text-[var(--fg-on-primary)] hover:bg-[var(--primary-pressed)] transition-[background-color,transform] duration-[var(--dur-fast)] active:scale-[0.98]"
          style={{
            padding: '15px 26px',
            fontFamily: 'var(--font-sans)',
            fontSize: 16,
            fontWeight: 500,
            boxShadow: 'var(--primary-glow)',
          }}
          onClick={() => onOpenChange(false)}
        >
          <ArrowRight size={18} strokeWidth={1.8} aria-hidden="true" />
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

          {filteredEntries.length > 0 && (
            <div
              style={{
                borderRadius: 18,
                background: 'var(--bg-card)',
                boxShadow: 'inset 0 0 0 1px var(--hairline)',
                overflow: 'hidden',
              }}
            >
              {filteredEntries.map((entry, i) => {
                const label = statusLabel(entry)
                return (
                  <div
                    key={entry.habitId}
                    className="flex items-center gap-3"
                    style={{
                      padding: '15px 18px',
                      borderBottom:
                        i < filteredEntries.length - 1
                          ? '1px solid var(--hairline)'
                          : 'none',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      className="inline-flex size-6 shrink-0 items-center justify-center rounded-full"
                      style={statusCircleStyle(entry)}
                    >
                      {entry.status === 'completed' && (
                        <Check size={15} strokeWidth={2.5} color="var(--fg-on-primary)" />
                      )}
                    </span>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span
                          className={`truncate ${
                            entry.status === 'completed'
                              ? 'text-[var(--fg-3)] line-through'
                              : 'text-[var(--fg-1)]'
                          }`}
                          style={{
                            fontFamily: 'var(--font-sans)',
                            fontSize: 15,
                            fontWeight: 500,
                          }}
                        >
                          {entry.title}
                        </span>
                        {entry.dueTime && (
                          <span
                            className="shrink-0 text-[var(--fg-3)]"
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: 12,
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {displayTime(entry.dueTime)}
                          </span>
                        )}
                      </div>
                    </div>

                    {label && (
                      <span
                        className="shrink-0 rounded-full uppercase"
                        style={{
                          padding: '3px 9px',
                          fontFamily: 'var(--font-sans)',
                          fontSize: 10.5,
                          fontWeight: 600,
                          letterSpacing: '0.06em',
                          color: statusBadgeColor(entry),
                          boxShadow: 'inset 0 0 0 1px var(--hairline)',
                        }}
                      >
                        {label}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </AppOverlay>
  )
}
