'use client'

import { useMemo, useCallback } from 'react'
import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { plural } from '@/lib/plural'
import { useTimeFormat } from '@/hooks/use-time-format'
import { useDateFormat } from '@/hooks/use-date-format'
import { parseAPIDate, filterRecurringEntries } from '@orbit/shared/utils'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import { ShowRecurringToggle } from '@/components/calendar/show-recurring-toggle'

interface CalendarDayDetailProps {
  dateStr: string | null
  entries: CalendarDayEntry[]
  showRecurring: boolean
  onShowRecurringChange: (value: boolean) => void
  /** Desktop side-panel mode: the entries list scrolls within the viewport, a
   *  bottom fade hints at more content, and the go-to-day CTA stays pinned below. */
  fitViewport?: boolean
}

function statusBadgeColor(entry: CalendarDayEntry): string {
  if (entry.isBadHabit) {
    return entry.status === 'completed' ? 'var(--status-bad-text)' : 'var(--status-done)'
  }
  return entry.status === 'completed' ? 'var(--status-done)' : 'var(--status-overdue-text)'
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
  if (entry.status === 'missed' && entry.isBadHabit) {
    return { boxShadow: 'inset 0 0 0 2px var(--status-done)' }
  }
  return { boxShadow: 'inset 0 0 0 2px var(--status-empty)' }
}

/** Inline selected-day section: the day's entries in a kit card with per-entry
 *  status rings, and the go-to-day ghost pill. */
export function CalendarDayDetail({
  dateStr,
  entries,
  showRecurring,
  onShowRecurringChange,
  fitViewport = false,
}: Readonly<CalendarDayDetailProps>) {
  const t = useTranslations()
  const { displayTime } = useTimeFormat()
  const { displayWeekdayDate } = useDateFormat()

  const formattedDate = useMemo(() => {
    if (!dateStr) return ''
    const date = parseAPIDate(dateStr)
    return displayWeekdayDate(date)
  }, [dateStr, displayWeekdayDate])

  const filteredEntries = useMemo(
    () => filterRecurringEntries(entries, showRecurring),
    [entries, showRecurring],
  )

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

  if (!dateStr) return null

  const recurringToggle = entries.length > 0 && (
    <div className="flex shrink-0 justify-end" style={{ marginBottom: 12 }}>
      <ShowRecurringToggle
        checked={showRecurring}
        onChange={onShowRecurringChange}
      />
    </div>
  )

  const body = (
    <>
      {entries.length === 0 && (
        <div
          className="text-[var(--fg-3)] text-sm text-center"
          style={{
            padding: '24px 18px',
            borderRadius: 18,
            background: 'var(--bg-card)',
            boxShadow: 'inset 0 0 0 1px var(--hairline)',
          }}
        >
          {t('calendar.noHabitsScheduled')}
        </div>
      )}

      {entries.length > 0 && (
        <div className="flex flex-col" style={{ gap: 12 }}>
          <p
            className="text-sm text-[var(--fg-3)]"
            style={{ margin: 0 }}
          >
            {plural(t('calendar.dayDetail.completionSummary', {
              done: completedCount,
              total: filteredEntries.length,
            }), filteredEntries.length)}
          </p>

          {filteredEntries.length === 0 && (
            <div
              className="text-[var(--fg-3)] text-sm text-center"
              style={{
                padding: '24px 18px',
                borderRadius: 18,
                background: 'var(--bg-card)',
                boxShadow: 'inset 0 0 0 1px var(--hairline)',
              }}
            >
              {t('calendar.noHabitsScheduled')}
            </div>
          )}

          {filteredEntries.length > 0 && (
            <div
              className="stagger-enter"
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
    </>
  )

  const goToDay = (
    <Link
      href={`/?date=${dateStr}`}
      className="flex w-full shrink-0 sm:max-w-[360px] sm:mx-auto items-center justify-center gap-[9px] rounded-full bg-transparent text-[var(--fg-1)] transition-[background-color,transform] duration-[var(--dur-fast)] ease-[var(--ease-standard)] hover:bg-[var(--bg-elev)] active:scale-[0.98]"
      style={{
        marginTop: 16,
        padding: '14px 26px',
        fontFamily: 'var(--font-sans)',
        fontSize: 16,
        fontWeight: 500,
        boxShadow: 'inset 0 0 0 1.5px var(--hairline-strong)',
      }}
    >
      <ArrowRight size={18} strokeWidth={1.8} aria-hidden="true" />
      {t('calendar.goToDay')}
    </Link>
  )

  if (fitViewport) {
    return (
      <section
        aria-label={formattedDate}
        className="flex min-h-0 flex-1 flex-col"
        style={{ padding: '12px 20px 12px' }}
      >
        {recurringToggle}
        <div className="relative min-h-0 flex-1">
          <div
            className="h-full overflow-y-auto overscroll-contain"
            style={{ paddingBottom: 8 }}
          >
            {body}
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0"
            style={{ height: 24, background: 'linear-gradient(to top, var(--bg), transparent)' }}
          />
        </div>
        {goToDay}
      </section>
    )
  }

  return (
    <section aria-label={formattedDate} style={{ padding: '12px 20px 12px' }}>
      {recurringToggle}
      {body}
      {goToDay}
    </section>
  )
}
