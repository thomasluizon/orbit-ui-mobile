'use client'

import { useState, useCallback, useMemo } from 'react'
import { Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useDeviceLocale } from '@/hooks/use-device-locale'
import { AppOverlay } from '@/components/ui/app-overlay'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { PullQuote } from '@/components/chat/pull-quote'
import { HabitChecklist } from './habit-checklist'
import { HabitCalendar } from './habit-calendar'
import {
  HabitDetailStatsGrid,
  Last28Grid,
  type TranslationFn,
} from './habit-detail-sections'
import { DescriptionViewer } from './description-viewer'
import { useTimeFormat } from '@/hooks/use-time-format'
import { useHabitFullDetail, useUpdateChecklist, useLogHabit } from '@/hooks/use-habits'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { formatLocaleDate } from '@orbit/shared/utils'

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
  const locale = useDeviceLocale()
  const { displayTime } = useTimeFormat()
  const habitId = habit?.id ?? ''

  const { data: fullDetail, isLoading: metricsLoading } = useHabitFullDetail(
    open && habitId ? habitId : null,
  )
  const updateChecklist = useUpdateChecklist()
  const logHabit = useLogHabit()

  const metrics = fullDetail?.metrics ?? null
  const logs = fullDetail?.logs ?? null
  const liveChecklist = useMemo(
    () => fullDetail?.habit.checklistItems ?? habit?.checklistItems ?? [],
    [fullDetail?.habit.checklistItems, habit?.checklistItems],
  )

  const [showChecklistLogPrompt, setShowChecklistLogPrompt] = useState(false)
  const [descriptionViewerOpen, setDescriptionViewerOpen] = useState(false)

  const handleChecklistToggle = useCallback(
    (index: number) => {
      if (!habit) return
      const items = [...liveChecklist]
      const item = items[index]
      if (!item) return
      items[index] = { ...item, isChecked: !item.isChecked }
      updateChecklist.mutate({ habitId: habit.id, items })
      if (items.length > 0 && items.every((i) => i.isChecked) && !habit.isCompleted) {
        setShowChecklistLogPrompt(true)
      }
    },
    [habit, liveChecklist, updateChecklist],
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
    const items = liveChecklist.map((i) => ({ ...i, isChecked: false }))
    updateChecklist.mutate({ habitId: habit.id, items })
  }, [habit, liveChecklist, updateChecklist])

  const handleChecklistClear = useCallback(() => {
    if (!habit) return
    updateChecklist.mutate({ habitId: habit.id, items: [] })
  }, [habit, updateChecklist])

  // Build the "Last 28 days" boolean array from logs. Caller's habitId is "now"
  // and we walk back 28 days; missing logs render as empty cells.
  const last28 = useMemo(() => buildLast28FromLogs(logs), [logs])

  const askPrompt = habit?.checklistItems && habit.checklistItems.length > 0
    ? t('habits.detail.askAstraSubHabits')
    : t('habits.detail.askAstraDefault')

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
          <PullQuote
            paddingX={0}
            paddingY={0}
            eyebrow={
              <>
                <Sparkles size={12} strokeWidth={1.7} color="var(--primary)" />
                <span>{t('habits.detail.askAstraEyebrow')}</span>
              </>
            }
          >
            {askPrompt}
          </PullQuote>
        }
      >
        {habit && (
          <div className="-mx-6">
            {/* Due time */}
            {habit.dueTime && (
              <SettingsRow
                label={t('habits.form.dueTime')}
                value={displayTime(habit.dueTime)}
                mono
                accessory="none"
              />
            )}

            {/* Scheduled reminders */}
            {habit.scheduledReminders && habit.scheduledReminders.length > 0 && (
              <>
                <SectionLabel>{t('habits.detail.reminders')}</SectionLabel>
                {habit.scheduledReminders.map((sr, idx) => (
                  <SettingsRow
                    key={`${sr.when}-${sr.time}-${idx}`}
                    label={
                      sr.when === 'day_before'
                        ? t('habits.form.scheduledReminderDayBeforeAt', {
                            time: displayTime(sr.time),
                          })
                        : t('habits.form.scheduledReminderSameDayAt', {
                            time: displayTime(sr.time),
                          })
                    }
                    accessory="none"
                  />
                ))}
              </>
            )}

            {/* End date */}
            {habit.endDate && (
              <SettingsRow
                label={t('habits.detail.endsOn')}
                value={formatLocaleDate(habit.endDate, locale, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
                mono
                accessory="none"
              />
            )}

            {/* Last 28-day heatmap from logs (only when we have any logs). */}
            {last28.length > 0 && (
              <>
                <SectionLabel>{t('habits.detail.activity')}</SectionLabel>
                <Last28Grid done={last28} />
              </>
            )}

            <HabitDetailStatsGrid
              metrics={metrics}
              loading={metricsLoading}
              t={t as TranslationFn}
            />

            {/* Checklist */}
            {liveChecklist.length > 0 && (
              <div style={{ padding: '0 20px 12px' }}>
                <HabitChecklist
                  items={liveChecklist}
                  interactive
                  onToggle={handleChecklistToggle}
                  onReset={handleChecklistReset}
                  onClear={handleChecklistClear}
                />
              </div>
            )}

            {/* Calendar (kept for full-history detail) */}
            <SectionLabel>{t('habits.detail.activity')}</SectionLabel>
            <div style={{ padding: '0 20px 12px' }}>
              <HabitCalendar habitId={habit.id} logs={logs} />
            </div>
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

interface LogLike {
  date?: string
}

function buildLast28FromLogs(logs: readonly LogLike[] | null): boolean[] {
  if (!logs || logs.length === 0) return []
  const dateSet = new Set<string>()
  for (const log of logs) {
    if (log.date) dateSet.add(log.date.slice(0, 10))
  }
  const today = new Date()
  const result: boolean[] = []
  for (let offset = 27; offset >= 0; offset -= 1) {
    const d = new Date(today)
    d.setDate(today.getDate() - offset)
    const iso = d.toISOString().slice(0, 10)
    result.push(dateSet.has(iso))
  }
  return result
}
