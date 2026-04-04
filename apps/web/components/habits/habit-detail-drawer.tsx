'use client'

import { useState, useCallback, useMemo } from 'react'
import { Clock, Bell, CalendarDays, Flame, Trophy, BarChart3, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { format } from 'date-fns'
import { AppOverlay } from '@/components/ui/app-overlay'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { HabitChecklist } from './habit-checklist'
import { HabitCalendar } from './habit-calendar'
import { DescriptionViewer } from './description-viewer'
import { useHabitFullDetail, useUpdateChecklist, useLogHabit } from '@/hooks/use-habits'
import type { NormalizedHabit } from '@orbit/shared/types/habit'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface HabitDetailDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  habit: NormalizedHabit | null
  onDelete?: (habitId: string) => void
  onEdit?: (habitId: string) => void
  onLogged?: (habitId: string) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HabitDetailDrawer({
  open,
  onOpenChange,
  habit,
  onDelete,
  onEdit,
  onLogged,
}: HabitDetailDrawerProps) {
  const t = useTranslations()
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

  const logsWithNotes = useMemo(
    () => (logs ?? []).filter((l) => l.note).slice(0, 5),
    [logs],
  )

  const handleEdit = useCallback(() => {
    if (habit) {
      onEdit?.(habit.id)
      onOpenChange(false)
    }
  }, [habit, onEdit, onOpenChange])

  const handleDelete = useCallback(() => {
    if (habit) {
      onDelete?.(habit.id)
      onOpenChange(false)
    }
  }, [habit, onDelete, onOpenChange])

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
        footer={
          habit ? (
            <div className="flex gap-3">
              <button
                className="flex-1 py-4 rounded-xl border border-border text-text-primary font-bold text-sm hover:bg-surface-elevated/80 transition-all duration-150"
                onClick={handleEdit}
              >
                {t('common.edit')}
              </button>
              <button
                className="flex-[2] py-4 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary/90 transition-all duration-150 flex items-center justify-center gap-2 shadow-[var(--shadow-glow)]"
                onClick={handleDelete}
              >
                <Trash2 className="size-3" />
                {t('common.delete')}
              </button>
            </div>
          ) : undefined
        }
      >
        {habit && (
          <div className="space-y-6">
            {/* Due time */}
            {habit.dueTime && (
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <Clock className="size-4 text-primary" />
                <span>
                  {habit.dueTime}
                  {habit.dueEndTime ? ` - ${habit.dueEndTime}` : ''}
                </span>
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
                  {format(new Date(habit.endDate), 'MMM d, yyyy')}
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

            {/* Stats grid (3-column) */}
            {metrics && !metricsLoading ? (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-surface-ground border border-border-muted rounded-xl p-3 flex flex-col items-center gap-1 shadow-[var(--shadow-sm)]">
                  <Flame className="size-5 text-primary" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                    {t('habits.detail.currentStreak')}
                  </span>
                  <span className="text-lg font-bold text-text-primary">
                    {t('habits.detail.streakDays', {
                      n: metrics.currentStreak,
                    })}
                  </span>
                </div>
                <div className="bg-surface-ground border border-border-muted rounded-xl p-3 flex flex-col items-center gap-1 shadow-[var(--shadow-sm)]">
                  <Trophy className="size-5 text-primary" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                    {t('habits.detail.longestStreak')}
                  </span>
                  <span className="text-lg font-bold text-text-primary">
                    {t('habits.detail.streakDays', {
                      n: metrics.longestStreak,
                    })}
                  </span>
                </div>
                <div className="bg-surface-ground border border-border-muted rounded-xl p-3 flex flex-col items-center gap-1 shadow-[var(--shadow-sm)]">
                  <BarChart3 className="size-5 text-primary" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-text-secondary">
                    {t('habits.detail.monthlyRate')}
                  </span>
                  <span className="text-lg font-bold text-text-primary">
                    {Math.round(metrics.monthlyCompletionRate)}%
                  </span>
                </div>
              </div>
            ) : metricsLoading ? (
              <div className="grid grid-cols-3 gap-3">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="bg-surface-ground border border-border-muted rounded-xl p-3 flex flex-col items-center gap-2"
                  >
                    <div className="size-5 rounded-full bg-surface-elevated animate-pulse" />
                    <div className="h-2.5 w-10 bg-surface-elevated rounded animate-pulse" />
                    <div className="h-5 w-8 bg-surface-elevated rounded animate-pulse" />
                  </div>
                ))}
              </div>
            ) : null}

            {/* Calendar heatmap */}
            <div>
              <h3 className="text-sm font-bold text-text-primary mb-3">
                {t('habits.detail.activity')}
              </h3>
              <HabitCalendar habitId={habit.id} logs={logs} />
            </div>

            {/* Recent notes */}
            {logsWithNotes.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-text-primary mb-3">
                  {t('habits.detail.recentNotes')}
                </h3>
                <div className="space-y-2">
                  {logsWithNotes.map((log) => (
                    <div
                      key={log.id}
                      className="bg-surface-ground border border-border-muted rounded-lg p-3 shadow-[var(--shadow-sm)]"
                    >
                      <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1">
                        {format(new Date(log.date), 'MMM d, yyyy')}
                      </p>
                      <p className="text-sm text-text-secondary">{log.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
