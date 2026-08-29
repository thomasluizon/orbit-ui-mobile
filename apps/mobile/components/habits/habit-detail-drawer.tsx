import { useState, useCallback, useMemo } from 'react'
import {
  Pressable,
  Text,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { Expand } from '@/components/ui/icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { Sheet, useSheetHost } from '@/components/ui/sheet'
import { withDrawerContentInset } from '@/components/ui/drawer-content-inset'

import { SectionLabel } from '@/components/ui/section-label'
import { SettingsRow } from '@/components/ui/settings-row'
import { DateRow } from '@/components/ui/date-row'
import { HabitChecklist } from './habit-checklist'
import { DescriptionViewer } from './description-viewer'
import { HabitCalendar } from './habit-calendar'
import { HabitDetailStatsRow } from './habit-detail-sections'
import { HabitDetailHeader } from './habit-detail-drawer/habit-detail-header'
import { HabitDetailReminders } from './habit-detail-drawer/habit-detail-reminders'
import { HabitAskAstraButton } from './habit-detail-drawer/habit-ask-astra-button'
import { createDrawerStyles } from './habit-detail-drawer/styles'
import { useTimeFormat } from '@/hooks/use-time-format'
import {
  useHabitFullDetail,
  useUpdateChecklist,
  useLogHabit,
} from '@/hooks/use-habits'
import { useAppToast } from '@/hooks/use-app-toast'
import type { NormalizedHabit } from '@orbit/shared/types/habit'
import {
  formatHabitDetailSummary,
  formatAPIDate,
  formatLocaleDate,
  getFriendlyErrorMessage,
} from '@orbit/shared/utils'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface HabitDetailDrawerProps {
  open: boolean
  onClose: () => void
  habit: NormalizedHabit | null
  selectedDate?: string
  onLogged?: (habitId: string) => void
}

type HabitDetailStyles = ReturnType<typeof createDrawerStyles>
type HabitDetailTokens = ReturnType<typeof createTokensV2>

type ChecklistItems = NonNullable<NormalizedHabit['checklistItems']>
type HabitMetrics = NonNullable<
  ReturnType<typeof useHabitFullDetail>['data']
>['metrics']
type HabitLogs = NonNullable<
  ReturnType<typeof useHabitFullDetail>['data']
>['logs']

interface HabitDetailContentProps {
  habit: NormalizedHabit
  tokens: HabitDetailTokens
  styles: HabitDetailStyles
  metrics: HabitMetrics | null
  metricsLoading: boolean
  logs: HabitLogs | null
  liveChecklist: ChecklistItems
  summaryStrip: string
  askPrompt: string
  locale: string
  displayTime: (time: string) => string
  onOpenDescription: () => void
  onChecklistToggle: (index: number) => void
  onChecklistReset: () => void
  onChecklistClear: () => void
  onAskAstra: () => void
}

function HabitDetailContent({
  habit,
  tokens,
  styles,
  metrics,
  metricsLoading,
  logs,
  liveChecklist,
  summaryStrip,
  askPrompt,
  locale,
  displayTime,
  onOpenDescription,
  onChecklistToggle,
  onChecklistReset,
  onChecklistClear,
  onAskAstra,
}: Readonly<HabitDetailContentProps>) {
  const { t } = useTranslation()
  return (
    <View style={withDrawerContentInset(styles.scrollContent)}>
      <HabitDetailHeader
        habit={habit}
        tokens={tokens}
        styles={styles}
        summaryStrip={summaryStrip}
      />

      {habit.description ? (
        <Pressable
          onPress={onOpenDescription}
          accessibilityRole="button"
          accessibilityLabel={t('habits.detail.viewDescription')}
          style={({ pressed }) => [
            styles.descriptionRow,
            pressed ? styles.descriptionRowPressed : null,
          ]}
        >
          <Text style={styles.description} numberOfLines={2}>
            {habit.description}
          </Text>
          <Expand
            size={14}
            color={tokens.fg4}
            strokeWidth={1.8}
            importantForAccessibility="no"
          />
        </Pressable>
      ) : null}

      {liveChecklist.length > 0 ? (
        <View>
          <SectionLabel top={4} bottom={8}>
            {t('habits.form.checklist')}
          </SectionLabel>
          <View style={styles.sectionInset}>
            <HabitChecklist
              items={liveChecklist}
              interactive
              onToggle={onChecklistToggle}
              onReset={onChecklistReset}
              onClear={onChecklistClear}
            />
          </View>
        </View>
      ) : null}

      {habit.frequencyUnit || habit.isGeneral ? (
        <View>
          <SectionLabel top={4} bottom={8}>
            {t('habits.detail.stats')}
          </SectionLabel>
          <HabitDetailStatsRow
            metrics={metrics}
            loading={metricsLoading}
            isBadHabit={habit.isBadHabit}
            t={t}
            tokens={tokens}
          />
        </View>
      ) : null}

      <HabitDetailReminders habit={habit} displayTime={displayTime} />

      {habit.endDate ? (
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
      ) : null}

      <DateRow
        label={t('habits.detail.startedOn')}
        value={formatLocaleDate(habit.createdAtUtc, locale, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })}
        note={t('habits.detail.startDateNote')}
      />

      {habit.linkedGoals && habit.linkedGoals.length > 0 ? (
        <View>
          <SectionLabel top={8} bottom={0}>
            {t('habits.detail.linkedGoal')}
          </SectionLabel>
          {habit.linkedGoals.map((g) => (
            <SettingsRow
              key={g.id}
              label={g.title}
              accessory="none"
            />
          ))}
        </View>
      ) : null}


      <View>
        <SectionLabel top={8} bottom={8}>
          {t('habits.detail.activity')}
        </SectionLabel>
        <View style={styles.sectionInset}>
          <HabitCalendar habitId={habit.id} logs={logs} />
        </View>
      </View>

      <HabitAskAstraButton
        tokens={tokens}
        styles={styles}
        askPrompt={askPrompt}
        onPress={onAskAstra}
      />
    </View>
  )
}

/**
 * Habit Detail Drawer. Covers all variants by data-driven section presence:
 * active, skipped (checklist hidden when empty), checklist, bad, linked goal
 * (when `linkedGoals` non empty).
 */
export function HabitDetailDrawer({
  open,
  onClose,
  habit,
  selectedDate,
  onLogged,
}: Readonly<HabitDetailDrawerProps>) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const { displayTime } = useTimeFormat()
  const { showError } = useAppToast()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = useMemo(() => createDrawerStyles(tokens), [tokens])
  const habitId = habit?.id ?? ''
  const viewedDate = selectedDate ?? formatAPIDate(new Date())

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

  const [descriptionViewerOpen, setDescriptionViewerOpen] = useState(false)
  const [showChecklistCompleteConfirm, setShowChecklistCompleteConfirm] =
    useState(false)
  const [showChecklistClearConfirm, setShowChecklistClearConfirm] =
    useState(false)

  const router = useRouter()
  const { sheetRef, closeSheet } = useSheetHost()
  const askPrompt = useMemo(() => {
    if (!habit) return ''
    return habit.checklistItems.length > 0
      ? t('habits.detail.askAstraSubHabits')
      : t('habits.detail.askAstraDefault')
  }, [habit, t])

  const handleAskAstra = useCallback(() => {
    if (!habit) return
    const seed =
      habit.checklistItems.length > 0
        ? t('habits.detail.askAstraSeedSubHabits', { title: habit.title })
        : t('habits.detail.askAstraSeedDefault', { title: habit.title })
    void AsyncStorage.setItem('orbit-chat-draft', seed)
    closeSheet(() => {
      onClose()
      router.push('/chat')
    })
  }, [closeSheet, habit, onClose, router, t])

  const handleChecklistToggle = useCallback(
    (index: number) => {
      if (!habit) return
      const items = [...liveChecklist]
      const item = items[index]
      if (!item) return
      items[index] = { ...item, isChecked: !item.isChecked }
      updateChecklist.mutate({ habitId: habit.id, items })
      if (
        items.length > 0 &&
        items.every((i) => i.isChecked) &&
        !habit.isCompleted
      ) {
        setShowChecklistCompleteConfirm(true)
      }
    },
    [habit, liveChecklist, updateChecklist],
  )

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

  const confirmChecklistLog = useCallback(async () => {
    if (!habit) return
    setShowChecklistCompleteConfirm(false)
    try {
      await logHabit.mutateAsync({ habitId: habit.id, date: viewedDate, intent: 'log' })
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
  }, [habit, logHabit, onLogged, showError, t, viewedDate])

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

  return (
    <>
      {habit?.description ? (
        <DescriptionViewer
          open={descriptionViewerOpen}
          onClose={() => setDescriptionViewerOpen(false)}
          title={habit.title}
          description={habit.description}
        />
      ) : null}

      <ConfirmSheet
        open={showChecklistCompleteConfirm}
        title={t('habits.checklistCompleteTitle')}
        message={t('habits.checklistCompleteMessage', { name: habit?.title ?? '' })}
        confirmLabel={t('habits.checklistCompleteConfirm')}
        onCancel={() => setShowChecklistCompleteConfirm(false)}
        onConfirm={() => void confirmChecklistLog()}
      />

      <ConfirmSheet
        open={showChecklistClearConfirm}
        title={t('habits.checklistClearTitle')}
        message={t('habits.checklistClearMessage')}
        confirmLabel={t('habits.form.clearChecklist')}
        destructive
        onCancel={() => setShowChecklistClearConfirm(false)}
        onConfirm={confirmChecklistClear}
      />

      {open ? (<Sheet
        ref={sheetRef}
        open
        onClose={onClose}
        title={habit?.title}
        key={habitId}
      >
        {habit ? (
          <HabitDetailContent
            habit={habit}
            tokens={tokens}
            styles={styles}
            metrics={metrics}
            metricsLoading={metricsLoading}
            logs={logs}
            liveChecklist={liveChecklist}
            summaryStrip={summaryStrip}
            askPrompt={askPrompt}
            locale={locale}
            displayTime={displayTime}
            onOpenDescription={() => setDescriptionViewerOpen(true)}
            onChecklistToggle={handleChecklistToggle}
            onChecklistReset={handleChecklistReset}
            onChecklistClear={handleChecklistClear}
            onAskAstra={handleAskAstra}
          />
        ) : null}
      </Sheet>) : null}
    </>
  )
}
