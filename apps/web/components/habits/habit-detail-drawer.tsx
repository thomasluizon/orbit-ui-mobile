'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, ChevronRight } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { AppOverlay } from '@/components/ui/app-overlay'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { InfoRow } from '@/components/ui/info-row'
import { PullQuote } from '@/components/chat/pull-quote'
import { HabitChecklist } from './habit-checklist'
import { HabitCalendar } from './habit-calendar'
import {
  HabitDetailStatsGrid,
  type TranslationFn,
} from './habit-detail-sections'
import { DescriptionViewer } from './description-viewer'
import { useTimeFormat } from '@/hooks/use-time-format'
import { useHabitFullDetail, useUpdateChecklist, useLogHabit } from '@/hooks/use-habits'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import { formatHabitDetailSummary, formatLocaleDate } from '@orbit/shared/utils'

interface HabitDetailDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  habit: NormalizedHabit | null
  onLogged?: (habitId: string) => void
}

export function HabitDetailDrawer({
  open,
  onOpenChange,
  habit,
  onLogged,
}: Readonly<HabitDetailDrawerProps>) {
  const t = useTranslations()
  const locale = useLocale()
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

  const summaryStrip = useMemo(() => {
    if (!habit) return ''
    return formatHabitDetailSummary({
      currentStreak: habit.currentStreak ?? 0,
      streakLabel: t('habits.detail.currentStreak'),
      hasLinkedGoal: (habit.linkedGoals?.length ?? 0) > 0,
      linkedGoalLabel: t('habits.detail.linkedGoal'),
      checklistChecked: liveChecklist.filter((i) => i.isChecked).length,
      checklistTotal: liveChecklist.length,
    })
  }, [habit, liveChecklist, t])

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

  const askPrompt = habit?.checklistItems && habit.checklistItems.length > 0
    ? t('habits.detail.askAstraSubHabits')
    : t('habits.detail.askAstraDefault')

  const router = useRouter()
  function handleAskAstra() {
    const seed = habit?.title ? `${askPrompt} (${habit.title})` : askPrompt
    if (typeof globalThis !== 'undefined' && typeof globalThis.localStorage !== 'undefined') {
      globalThis.localStorage.setItem('orbit-chat-draft', seed)
    }
    onOpenChange(false)
    router.push('/chat')
  }

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
          <button
            type="button"
            onClick={handleAskAstra}
            aria-label={`${t('habits.detail.askAstraEyebrow')}: ${askPrompt}`}
            className="block w-full text-left appearance-none border-0 bg-transparent cursor-pointer transition-[background-color,transform] duration-150 ease-out hover:bg-[var(--bg-elev-pressed)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary active:scale-[0.99]"
            style={{ borderRadius: 8, padding: '8px 10px', margin: '-8px -10px' }}
          >
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
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
              </div>
              <ChevronRight
                size={16}
                strokeWidth={1.7}
                color="var(--fg-3)"
                aria-hidden="true"
                className="shrink-0"
              />
            </div>
          </button>
        }
      >
        {habit && (
          <div className="-mx-6">
            {summaryStrip ? <InfoRow label={summaryStrip} /> : null}

            {habit.dueTime && (
              <SettingsRow
                label={t('habits.form.dueTime')}
                value={displayTime(habit.dueTime)}
                mono
                accessory="none"
              />
            )}

            {habit.scheduledReminders && habit.scheduledReminders.length > 0 && (
              <>
                <SectionLabel>{t('habits.detail.reminders')}</SectionLabel>
                {habit.scheduledReminders.map((sr, idx) => (
                  <SettingsRow
                    key={`${sr.when}-${sr.time}-${idx}`}
                    label={
                      sr.when === 'day_before'
                        ? t('habits.form.scheduledReminderDayBefore')
                        : t('habits.form.scheduledReminderSameDay')
                    }
                    value={displayTime(sr.time)}
                    mono
                    accessory="none"
                  />
                ))}
              </>
            )}

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

            {habit.frequencyUnit || habit.isGeneral ? (
              <HabitDetailStatsGrid
                metrics={metrics}
                loading={metricsLoading}
                t={t as TranslationFn}
              />
            ) : null}

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

