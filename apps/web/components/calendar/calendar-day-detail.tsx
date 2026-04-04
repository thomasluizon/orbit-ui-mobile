'use client'

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import { ArrowRight, Check } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { plural } from '@/lib/plural'
import { useTimeFormat } from '@/hooks/use-time-format'
import { parseAPIDate } from '@orbit/shared/utils'
import type { CalendarDayEntry } from '@orbit/shared/types/calendar'
import { AppOverlay } from '@/components/ui/app-overlay'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CalendarDayDetailProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dateStr: string | null
  entries: CalendarDayEntry[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusBadgeClass(entry: CalendarDayEntry): string {
  if (entry.isBadHabit) {
    if (entry.status === 'completed') return 'text-red-400 bg-red-400/10'
    if (entry.status === 'missed') return 'text-emerald-400 bg-emerald-400/10'
    return 'text-primary bg-primary/10'
  }
  if (entry.status === 'completed') return 'text-emerald-400 bg-emerald-400/10'
  if (entry.status === 'missed') return 'text-orange-400 bg-orange-400/10'
  return 'text-primary bg-primary/10'
}

function statusIconBg(entry: CalendarDayEntry): string {
  if (entry.status === 'completed') return 'bg-emerald-500/20 border-emerald-500/30'
  return 'border-text-faded/30'
}

// formatDueTime is now handled by useTimeFormat hook

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CalendarDayDetail({
  open,
  onOpenChange,
  dateStr,
  entries,
}: CalendarDayDetailProps) {
  const t = useTranslations()
  const locale = useLocale()
  const { displayTime } = useTimeFormat()
  const [showRecurring, setShowRecurring] = useState(true)

  const dateFnsLocale = locale === 'pt-BR' ? ptBR : enUS

  const formattedDate = useMemo(() => {
    if (!dateStr) return ''
    const date = parseAPIDate(dateStr)
    return format(date, 'EEEE, MMM d', { locale: dateFnsLocale })
  }, [dateStr, dateFnsLocale])

  const filteredEntries = useMemo(() => {
    if (showRecurring) return entries
    return entries.filter((e) => e.isOneTime)
  }, [entries, showRecurring])

  const completedCount = filteredEntries.filter((e) => e.status === 'completed').length

  const statusLabel = useCallback((entry: CalendarDayEntry): string => {
    if (entry.isBadHabit) {
      if (entry.status === 'completed') return t('calendar.status.indulged')
      if (entry.status === 'missed') return t('calendar.status.resisted')
      return t('calendar.status.scheduled')
    }
    if (entry.status === 'completed') return t('calendar.status.completed')
    if (entry.status === 'missed') return t('calendar.status.missed')
    return t('calendar.status.upcoming')
  }, [t])

  return (
    <AppOverlay
      open={open}
      onOpenChange={onOpenChange}
      title={formattedDate}
      footer={
        <Link
          href={`/?date=${dateStr ?? ''}`}
          className="w-full py-3 rounded-[var(--radius-xl)] bg-primary text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-all duration-150 active:scale-[0.98] shadow-[var(--shadow-glow)]"
          onClick={() => onOpenChange(false)}
        >
          <ArrowRight className="size-4" />
          {t('calendar.goToDay')}
        </Link>
      }
    >
      {entries.length === 0 ? (
        <div className="text-text-muted text-sm text-center py-8">
          {t('calendar.noHabitsScheduled')}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-text-faded">
              {plural(t('calendar.dayDetail.completionSummary', {
                done: completedCount,
                total: filteredEntries.length,
              }), filteredEntries.length)}
            </p>
            <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={showRecurring}
                onChange={(e) => setShowRecurring(e.target.checked)}
                className="accent-primary"
              />
              {t('calendar.showRecurring')}
            </label>
          </div>

          {filteredEntries.length === 0 && (
            <div className="text-text-muted text-sm text-center py-6">
              {t('calendar.noHabitsScheduled')}
            </div>
          )}

          {filteredEntries.map((entry, i) => (
            <div key={entry.habitId}>
              <div className="flex items-center gap-3 py-3">
                {/* Status circle */}
                <div
                  className={`shrink-0 size-6 rounded-full border flex items-center justify-center ${statusIconBg(entry)}`}
                >
                  {entry.status === 'completed' && (
                    <Check className="size-3 text-emerald-400" />
                  )}
                </div>

                {/* Habit info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`text-sm font-medium text-text-primary truncate ${entry.status === 'completed' ? 'opacity-60' : ''}`}
                    >
                      {entry.title}
                    </span>
                    {entry.dueTime && (
                      <span className="shrink-0 text-[11px] font-semibold text-text-secondary">
                        {displayTime(entry.dueTime)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Status badge */}
                <span
                  className={`shrink-0 px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${statusBadgeClass(entry)}`}
                >
                  {statusLabel(entry)}
                </span>
              </div>
              {/* Divider */}
              {i < filteredEntries.length - 1 && <div className="h-px bg-border/30" />}
            </div>
          ))}
        </div>
      )}
    </AppOverlay>
  )
}
