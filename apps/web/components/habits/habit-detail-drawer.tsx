'use client'

import { useState, useCallback, useMemo } from 'react'
import { Clock, Bell, CalendarDays } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { format } from 'date-fns'
import { enUS, ptBR } from 'date-fns/locale'
import { AppOverlay } from '@/components/ui/app-overlay'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { HabitChecklist } from './habit-checklist'
import { HabitCalendar } from './habit-calendar'
import {
  HabitDetailRecentNotes,
  HabitDetailStatsGrid,
  type TranslationFn,
} from './habit-detail-sections'
import { DescriptionViewer } from './description-viewer'
import { useTimeFormat } from '@/hooks/use-time-format'
import { useHabitFullDetail, useUpdateChecklist, useLogHabit } from '@/hooks/use-habits'
import type { NormalizedHabit } from '@orbit/shared/types/habit'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface HabitDetailDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  habit: NormalizedHabit | null
  onLogged?: (habitId: string) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HabitDetailDrawer({
  open,
  onOpenChange,
  habit,
  onLogged,
}: Readonly<HabitDetailDrawerProps>) {
  const t = useTranslations()
  const locale = useLocale()
  const dateFnsLocale = locale === 'pt-BR' ? ptBR : enUS
  const { displayTime } = useTimeFormat()
  const habitId = habit?.id ?? ''

  const { data: fullDetail, isLoading: metricsLoading } = useHabitFullDetail(
    open && habitId ? habitId : null,
  )
  const updateChecklist = useUpdateChecklist()
  const logHabit = useLogHabit()

  const metrics = fullDetail?.metrics ?? null
  const logs = fullDetail?.logs ?? null

  const [showChecklistLogPrompt, setShowChecklistLogPrompt] = useState(false)
  const [descriptionViewerOpen, setDescriptionViewerOpen] = useState(false)

  const recentNotes = useMemo(
    () =>
      (logs ?? [])
        .filter((log) => log.note)
        .slice(0, 5)
        .map((log) => ({
          id: log.id,
          note: log.note ?? '',
          dateLabel: format(
            new Date(log.date),
            locale === 'pt-BR' ? 'dd MMM yyyy' : 'MMM d, yyyy',
            { locale: dateFnsLocale },
          ),
        })),
    [dateFnsLocale, locale, logs],
  )

  const handleChecklistToggle = useCallback(
    (index: number) => {
      if (!habit) return
      const items = [...habit.checklistItems]
      const item = items[index]
      if (!item) return
      items[index] = { ...item, isChecked: !item.isChecked }
      updateChecklist.mutate({ habitId: habit.id, items })
      if (items.every((i) => i.isChecked) && !habit.isCompleted) {
        setShowChecklistLogPrompt(true)
      }
    },
    [habit, updateChecklist],
  )

  const confirmChecklistLog = useCallback(async () => {
    if (!habit) return
    setShowChecklistLogPrompt(false)
    try {
      await logHabit.mutateAsync({ habitId: habit.id })
      onLogged?.(habit.id)
    } catch {
      // Error handled by mutation
    }
  }, [habit, logHabit, onLogged])

  const handleChecklistReset = useCallback(() => {
    if (!habit) return
    const items = habit.checklistItems.map((i) => ({ ...i, isChecked: false }))
    updateChecklist.mutate({ habitId: habit.id, items })
  }, [habit, updateChecklist])

  const handleChecklistClear = useCallback(() => {
    if (!habit) return
    updateChecklist.mutate({ habitId: habit.id, items: [] })
  }, [habit, updateChecklist])

  return (
    <>
      {habit?.description && (
        <DescriptionViewer
          open={descriptionViewerOpen}
          onOpenChange={setDescriptionViewerOpen}
          title={habit.title}
          description={habit.description}
        />
      )}

      <AppOverlay
        open={open}
        onOpenChange={onOpenChange}
        title={habit?.title}
        description={habit?.description ?? undefined}
        expandable
        onExpandDescription={() => setDescriptionViewerOpen(true)}
      >
        {habit && (
          <div className="space-y-6">
            {/* Due time */}
            {habit.dueTime && (
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <Clock className="size-4 text-primary" />
                <span>{displayTime(habit.dueTime)}</span>
              </div>
            )}

            {/* Scheduled reminders */}
            {habit.scheduledReminders && habit.scheduledReminders.length > 0 && (
              <div className="flex items-start gap-2 text-sm text-text-secondary">
                <Bell className="size-4 text-primary mt-0.5" />
                <div className="flex flex-wrap gap-1.5">
                  {habit.scheduledReminders.map((sr, idx) => (
                    <span
                      key={`${sr.when}-${sr.time}-${idx}`}
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary"
                    >
                      {sr.when === 'day_before'
                        ? t('habits.form.scheduledReminderDayBeforeAt', {
                            time: sr.time.slice(0, 5),
                          })
                        : t('habits.form.scheduledReminderSameDayAt', {
                            time: sr.time.slice(0, 5),
                          })}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* End date */}
            {habit.endDate && (
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <CalendarDays className="size-4 text-primary" />
                <span>
                  {t('habits.detail.endsOn')}{' '}
                  {format(new Date(habit.endDate), locale === 'pt-BR' ? 'dd MMM yyyy' : 'MMM d, yyyy', { locale: dateFnsLocale })}
                </span>
              </div>
            )}

            {/* Checklist */}
            {habit.checklistItems && habit.checklistItems.length > 0 && (
              <HabitChecklist
                items={habit.checklistItems}
                interactive
                onToggle={handleChecklistToggle}
                onReset={handleChecklistReset}
                onClear={handleChecklistClear}
              />
            )}

            <HabitDetailStatsGrid metrics={metrics} loading={metricsLoading} t={t as TranslationFn} />

            {/* Calendar heatmap */}
            <div>
              <h3 className="text-sm font-bold text-text-primary mb-3">
                {t('habits.detail.activity')}
              </h3>
              <HabitCalendar habitId={habit.id} logs={logs} />
            </div>

            <HabitDetailRecentNotes notes={recentNotes} t={t as TranslationFn} />
          </div>
        )}
      </AppOverlay>

      <ConfirmDialog
        open={showChecklistLogPrompt}
        onOpenChange={setShowChecklistLogPrompt}
        title={t('habits.checklistCompleteTitle')}
        description={t('habits.checklistCompleteMessage', {
          name: habit?.title ?? '',
        })}
        confirmLabel={t('habits.checklistCompleteConfirm')}
        cancelLabel={t('common.cancel')}
        onConfirm={confirmChecklistLog}
        onCancel={() => setShowChecklistLogPrompt(false)}
        variant="success"
      />
    </>
  )
}
