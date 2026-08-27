'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import { Sheet } from '@/components/ui/sheet'

import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { HabitChecklist } from './habit-checklist'
import { HabitCalendar } from './habit-calendar'
import {
  HabitDetailStatsGrid,
  type TranslationFn,
} from './habit-detail-sections'
import { HabitDetailHeader } from './habit-detail-drawer/habit-detail-header'
import { HabitDetailReminders } from './habit-detail-drawer/habit-detail-reminders'
import { HabitAskAstraButton } from './habit-detail-drawer/habit-ask-astra-button'
import { DescriptionViewer } from './description-viewer'
import { useTimeFormat } from '@/hooks/use-time-format'
import { useHabitFullDetail, useUpdateChecklist, useLogHabit } from '@/hooks/use-habits'
import { useAppToast } from '@/hooks/use-app-toast'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import {
  formatHabitDetailSummary,
  formatLocaleDate,
  getFriendlyErrorMessage,
} from '@orbit/shared/utils'
import { PillButton } from '@/components/ui/pill-button'

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
  const { showError } = useAppToast()
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
  const [showChecklistClearConfirm, setShowChecklistClearConfirm] = useState(false)
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
    } catch (error: unknown) {
      showError(
        getFriendlyErrorMessage(
          error,
          (key, values) => t(key, values),
          'errors.logHabit',
          'habit',
        ),
      )
    }
  }, [habit, logHabit, onLogged, showError, t])

  const handleChecklistReset = useCallback(() => {
    if (!habit) return
    const items = liveChecklist.map((i) => ({ ...i, isChecked: false }))
    updateChecklist.mutate({ habitId: habit.id, items })
  }, [habit, liveChecklist, updateChecklist])

  const handleChecklistClear = useCallback(() => {
    setShowChecklistClearConfirm(true)
  }, [])

  const confirmChecklistClear = useCallback(() => {
    if (!habit) return
    setShowChecklistClearConfirm(false)
    updateChecklist.mutate({ habitId: habit.id, items: [] })
  }, [habit, updateChecklist])

  const askPrompt = habit?.checklistItems && habit.checklistItems.length > 0
    ? t('habits.detail.askAstraSubHabits')
    : t('habits.detail.askAstraDefault')

  const router = useRouter()
  function handleAskAstra() {
    if (!habit) return
    const seed =
      habit.checklistItems.length > 0
        ? t('habits.detail.askAstraSeedSubHabits', { title: habit.title })
        : t('habits.detail.askAstraSeedDefault', { title: habit.title })
    if ('localStorage' in globalThis) {
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

      {open ? (<Sheet
        open
        onClose={() => onOpenChange(false)}
        title={habit?.title}
      >
        {habit && (
          <div className="overlay-bleed">
            <HabitDetailHeader habit={habit} summaryStrip={summaryStrip} showTitle={false} />
            {habit.description ? (
              <button
                type="button"
                className="mx-6 mb-3 block rounded-[12px] bg-[var(--bg-well)] p-3 text-start text-sm text-[var(--fg-2)]"
                onClick={() => setDescriptionViewerOpen(true)}
              >
                {habit.description}
              </button>
            ) : null}
            {liveChecklist.length > 0 && (
              <>
                <SectionLabel>{t('habits.form.checklist')}</SectionLabel>
                <div style={{ padding: '0 20px 12px' }}>
                  <HabitChecklist
                    items={liveChecklist}
                    interactive
                    onToggle={handleChecklistToggle}
                    onReset={handleChecklistReset}
                    onClear={handleChecklistClear}
                  />
                </div>
              </>
            )}

            {habit.frequencyUnit || habit.isGeneral ? (
              <HabitDetailStatsGrid
                metrics={metrics}
                loading={metricsLoading}
                isBadHabit={habit.isBadHabit}
                t={t as TranslationFn}
              />
            ) : null}

            <HabitDetailReminders habit={habit} displayTime={displayTime} />

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
                divider={false}
              />
            )}

            {habit.linkedGoals && habit.linkedGoals.length > 0 && (
              <>
                <SectionLabel>{t('habits.detail.linkedGoal')}</SectionLabel>
                {habit.linkedGoals.map((goal) => (
                  <SettingsRow key={goal.id} label={goal.title} accessory="none" />
                ))}
              </>
            )}

            <SectionLabel>{t('habits.detail.activity')}</SectionLabel>
            <div style={{ padding: '0 20px 12px' }}>
              <HabitCalendar habitId={habit.id} logs={logs} />
            </div>

            <HabitAskAstraButton askPrompt={askPrompt} onPress={handleAskAstra} />
          </div>
        )}
      </Sheet>) : null}

      {showChecklistLogPrompt ? <Sheet open title={t('habits.checklistCompleteTitle')} onClose={() => {
  (setShowChecklistLogPrompt)(false);
}} actions={<><PillButton variant="ghost" onClick={() => {
    (() => setShowChecklistLogPrompt(false))();
    (setShowChecklistLogPrompt)(false);
  }}>{t('common.cancel')}</PillButton><PillButton variant="primary" onClick={() => {
    (() => void confirmChecklistLog())();
    (setShowChecklistLogPrompt)(false);
  }}>{t('habits.checklistCompleteConfirm')}</PillButton></>}><p className="text-sm text-[var(--fg-2)]">{t('habits.checklistCompleteMessage', {
      name: habit?.title ?? ''
    })}</p></Sheet> : null}

      {showChecklistClearConfirm ? <Sheet open title={t('habits.checklistClearTitle')} onClose={() => {
  (setShowChecklistClearConfirm)(false);
}} actions={<><PillButton variant="ghost" onClick={() => {
    (() => setShowChecklistClearConfirm(false))();
    (setShowChecklistClearConfirm)(false);
  }}>{t('common.cancel')}</PillButton><PillButton variant="destructive" onClick={() => {
    (confirmChecklistClear)();
    (setShowChecklistClearConfirm)(false);
  }}>{t('habits.form.clearChecklist')}</PillButton></>}><p className="text-sm text-[var(--fg-2)]">{t('habits.checklistClearMessage')}</p></Sheet> : null}
    </>
  )
}

