import { useState, useCallback, useMemo } from 'react'
import {
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { Expand, Users } from '@/components/ui/icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { withDrawerContentInset } from '@/components/ui/drawer-content-inset'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsGroup } from '@/components/ui/settings-group'
import { SettingsRow } from '@/components/ui/settings-row'
import { HabitChecklist } from './habit-checklist'
import { DescriptionViewer } from './description-viewer'
import { HabitCalendar } from './habit-calendar'
import { HabitDetailStatsRow } from './habit-detail-sections'
import { HabitDetailHeader } from './habit-detail-drawer/habit-detail-header'
import { HabitDetailReminders } from './habit-detail-drawer/habit-detail-reminders'
import { HabitAskAstraButton } from './habit-detail-drawer/habit-ask-astra-button'
import { createDrawerStyles } from './habit-detail-drawer/styles'
import { NewPairFlow } from '@/app/social/_components/new-pair-flow'
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
  formatLocaleDate,
  getFriendlyErrorMessage,
} from '@orbit/shared/utils'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface HabitDetailDrawerProps {
  open: boolean
  onClose: () => void
  habit: NormalizedHabit | null
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
  onPairBuddy: () => void
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
  onPairBuddy,
}: Readonly<HabitDetailContentProps>) {
  const { t } = useTranslation()
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={withDrawerContentInset(styles.scrollContent)}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="always"
    >
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
        />
      ) : null}

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

      <SettingsGroup>
        <SettingsRow
          label={t('social.buddies.pairThisHabit')}
          icon={Users}
          onPress={onPairBuddy}
        />
        <HabitAskAstraButton
          tokens={tokens}
          styles={styles}
          askPrompt={askPrompt}
          onPress={onAskAstra}
        />
      </SettingsGroup>
    </ScrollView>
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
  const [pairFlowOpen, setPairFlowOpen] = useState(false)
  const [showChecklistCompleteConfirm, setShowChecklistCompleteConfirm] =
    useState(false)
  const [showChecklistClearConfirm, setShowChecklistClearConfirm] =
    useState(false)

  const router = useRouter()
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
    onClose()
    router.push('/chat')
  }, [habit, onClose, router, t])

  const handlePairBuddy = useCallback(() => {
    setPairFlowOpen(true)
  }, [])

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

      {habit ? (
        <NewPairFlow
          open={pairFlowOpen}
          onClose={() => setPairFlowOpen(false)}
          initialHabitId={habit.id}
        />
      ) : null}

      <ConfirmDialog
        open={showChecklistCompleteConfirm}
        onOpenChange={setShowChecklistCompleteConfirm}
        title={t('habits.checklistCompleteTitle')}
        description={t('habits.checklistCompleteMessage', {
          name: habit?.title ?? '',
        })}
        confirmLabel={t('habits.checklistCompleteConfirm')}
        cancelLabel={t('common.cancel')}
        variant="success"
        onConfirm={() => {
          void (async () => {
          if (!habit) return
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
          } finally {
            setShowChecklistCompleteConfirm(false)
          }
          })()
        }}
      />

      <ConfirmDialog
        open={showChecklistClearConfirm}
        onOpenChange={setShowChecklistClearConfirm}
        title={t('habits.checklistClearTitle')}
        description={t('habits.checklistClearMessage')}
        confirmLabel={t('habits.form.clearChecklist')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        onConfirm={confirmChecklistClear}
        onCancel={() => setShowChecklistClearConfirm(false)}
      />

      <BottomSheetModal
        open={open}
        onClose={onClose}
        title={habit?.title}
        contentKey={habitId}
        snapPoints={['68%', '92%']}
        contentManagesScroll
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
            onPairBuddy={handlePairBuddy}
          />
        ) : null}
      </BottomSheetModal>
    </>
  )
}
