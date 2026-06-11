'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Orbit, ChevronRight } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { AppOverlay } from '@/components/ui/app-overlay'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
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
        titleContent={
          habit ? (
            <span className="flex items-center gap-3">
              {habit.emoji ? (
                <span
                  aria-hidden="true"
                  className="inline-flex shrink-0 items-center justify-center"
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 14,
                    fontSize: 22,
                    background: habit.isBadHabit
                      ? 'color-mix(in srgb, var(--status-bad) 12%, transparent)'
                      : 'var(--bg-elev)',
                  }}
                >
                  {habit.emoji}
                </span>
              ) : null}
              <span className="flex min-w-0 flex-col" style={{ gap: 2 }}>
                <span
                  className="truncate"
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 22,
                    fontWeight: 500,
                    lineHeight: 1.3,
                    color: 'var(--fg-1)',
                  }}
                >
                  {habit.title}
                </span>
                {summaryStrip ? (
                  <span
                    className="truncate"
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: 13,
                      fontWeight: 400,
                      color: habit.isBadHabit ? 'var(--status-bad)' : 'var(--fg-3)',
                    }}
                  >
                    {summaryStrip}
                  </span>
                ) : null}
              </span>
            </span>
          ) : undefined
        }
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
              <div className="relative flex-1 min-w-0" style={{ paddingLeft: 14 }}>
                <span
                  aria-hidden="true"
                  className="absolute rounded-[1px]"
                  style={{ left: 0, top: 4, bottom: 4, width: 2, background: 'var(--primary)' }}
                />
                <div className="inline-flex items-center" style={{ gap: 6, marginBottom: 6 }}>
                  <Orbit size={12} strokeWidth={1.7} color="var(--primary)" />
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10.5,
                      fontWeight: 500,
                      letterSpacing: '0.06em',
                      color: 'var(--fg-3)',
                    }}
                  >
                    {t('habits.detail.askAstraEyebrow')}
                  </span>
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 15,
                    fontStyle: 'italic',
                    lineHeight: 1.5,
                    color: 'var(--fg-2)',
                    textWrap: 'pretty',
                  }}
                >
                  {askPrompt}
                </div>
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

