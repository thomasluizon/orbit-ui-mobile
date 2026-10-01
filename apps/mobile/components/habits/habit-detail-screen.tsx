import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, TextInput, View, findNodeHandle, useWindowDimensions } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useIsFocused, useRouter } from 'expo-router'
import { addMonths, startOfMonth } from 'date-fns'
import { useReducedMotion } from 'react-native-reanimated'
import { motionEasings } from '@orbit/shared/theme'
import {
  buildHabitDetailUpdateRequest,
  createAccountScopedHabitDetailWriteQueue,
  buildHabitDetailHeaderSummary,
  isHabitDetailCompletionDisabled,
  buildHabitDetailReminderRows,
  buildHabitDetailChildDateModel,
  buildHabitHistoryMonth,
  buildHabitStripModel,
  buildRescheduleProposalLabels,
  buildRescheduleUpdateRequest,
  capitalizeFirstLetter,
  canNavigateHabitHistoryBack,
  canNavigateHabitHistoryForward,
  computeHabitFrequencyLabel,
  formatLocaleDate,
  formatWeekdayLabels,
  formatAPIDateInTimeZone,
  extractBackendErrorCode,
  getAvailableHabitDetailScopedChild,
  getHabitDetailChildCompletionReason,
  getHabitDetailChildUnavailableReasonKey,
  getHabitDaysWithoutLog,
  HABIT_SLIPPING_RATE_LIMIT,
  getHabitLogDateDecision,
  getHabitLogDateConfirmationKeys,
  getFriendlyErrorMessage,
  getTodayBoundary,
  hasAuthoritativeHabitRelationshipState,
  isHabitHistoryMonthLoaded,
  isHabitCompletedOnDate,
  isHabitSlipping,
  mergeHabitDetailWithScopedHabit,
  normalizeHabitDetailForDrill,
  parseAPIDate,
  shouldShowHabitMetrics,
} from '@orbit/shared/utils'
import { prepareChatRequest } from '@orbit/shared/stores'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'
import type { ChecklistItem, HabitMetrics, NormalizedHabit, RescheduleSuggestion } from '@orbit/shared/types/habit'
import { useAccountGeneration, useAccountScopedState } from '@/hooks/use-session-reset'
import { getAccountGeneration } from '@/lib/session-epoch'
import { FlowShell } from '@/components/shell/flow-shell'
import { AppBar } from '@/components/ui/app-bar'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { Badge } from '@/components/ui/badge'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { DayCell } from '@/components/dates/day-cell'
import { DayStrip } from '@/components/dates/day-strip'
import { ErrorState } from '@/components/ui/error-state'
import { ListRow } from '@/components/ui/list-row'
import { MonthGrid } from '@/components/dates/month-grid'
import { PillButton } from '@/components/ui/pill-button'
import { Proposed } from '@/components/ui/proposed'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronDown, ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from '@/components/ui/icons'
import { DateRow } from '@/components/ui/date-row'
import { StatTile } from '@/components/ui/stat-tile'
import { CreateHabitModal } from './create-habit-modal'
import { HabitDetailFields, HabitDetailSchedule } from './habit-detail-fields'
import { HabitChecklist } from './habit-checklist'
import { HabitEmojiSelector } from './habit-form-fields/habit-emoji-selector'
import { createStyles as createFormStyles } from './habit-form-fields/styles'
import { HabitLogButton } from './habit-log-button'
import { HabitRow } from './habit-row'
import { useHabitDetail, useHabitLogs, useHabitMetrics, useHabits } from '@/hooks/use-habit-queries'
import { useDeleteHabit, useLogHabit, useUpdateChecklist, useUpdateHabit } from '@/hooks/use-habits'
import { isQueuedResult } from '@/lib/offline-mutations'
import { findUnfinalizedFirstWrite, waitForFirstWriteFinalization } from '@/lib/offline-queue'
import { useProfile } from '@/hooks/use-profile'
import { useAppToast } from '@/hooks/use-app-toast'
import { useRescheduleSuggestion } from '@/hooks/use-reschedule-suggestion'
import { useTimeFormat } from '@/hooks/use-time-format'
import { createTokensV2, responsiveTypeStyle } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { useCurrentDate } from '@/app/(tabs)/use-today-date'

type ConfirmAction = 'clear' | 'delete' | 'log' | 'delete-child' | null

function habitStripCellSize(width: number): number {
  return width >= 480 ? 16 : 8
}

interface HabitDetailScreenProps {
  habitId: string
  date?: string | null
  fromToday?: boolean
  parentId?: string | null
}

function SectionTitle({ children, color }: Readonly<{ children: string; color: string }>) {
  return <Text numberOfLines={1} style={[styles.sectionTitle, { color }]}>{children}</Text>
}

function Surface({ children }: Readonly<{ children: React.ReactNode }>) {
  return <View style={styles.surface}>{children}</View>
}

function DayHabitsStatus({ reasonKey, onRetry, tokens }: Readonly<{ reasonKey: ReturnType<typeof getHabitDetailChildUnavailableReasonKey>; onRetry: () => void; tokens: ReturnType<typeof createTokensV2> }>) {
  const { t } = useTranslation()
  const status = reasonKey === 'calendar.dayCell.notScheduled' ? '' : t(reasonKey)
  return <View style={status ? styles.dayHabitsStatus : undefined}><Text style={[styles.muted, { color: tokens.fg2 }]}>{status}</Text>{reasonKey === 'habits.detail.dayHabitsLoadError' ? <PillButton variant="ghost" size="sm" onClick={onRetry}>{t('habits.detail.retry')}</PillButton> : null}</View>
}

function UnscheduledChildReason({ reason, notScheduledReason, tokens }: Readonly<{ reason?: string; notScheduledReason: string; tokens: ReturnType<typeof createTokensV2> }>) {
  if (reason !== notScheduledReason) return null
  return <Text style={[styles.muted, styles.childReason, { color: tokens.fg2 }]}>{reason}</Text>
}

function ReminderReadout({ habit, tokens }: Readonly<{ habit: NormalizedHabit; tokens: ReturnType<typeof createTokensV2> }>) {
  const { t } = useTranslation()
  const { displayTime } = useTimeFormat()
  const rows = buildHabitDetailReminderRows(habit, t)
  if (!rows.length) return null
  return <View testID="habit-detail-reminders" style={styles.reminders}><Text style={[styles.reminderHeading, { color: tokens.fg2 }]}>{t('habits.detail.reminders')}</Text>{rows.map((row) => <View key={row.key} style={styles.reminderRow}><Text style={[styles.reminderTime, { color: tokens.fg1 }]}>{displayTime(row.time)}</Text><Text style={[styles.muted, { color: tokens.fg3 }]}>{row.label}</Text></View>)}</View>
}

function AskAstraRow({ habit, tokens }: Readonly<{ habit: NormalizedHabit; tokens: ReturnType<typeof createTokensV2> }>) {
  const { t } = useTranslation()
  const openConversation = () => {
    prepareChatRequest(useChatStore.getState(), {
      id: `habit-detail:${habit.id}`,
      label: t('habits.detail.askAstra'),
      prompt: t('habits.detail.askAstraSeedDefault', { title: habit.title }),
    })
    useUIStore.getState().setAstraConversationOpen(true)
  }
  return (
    // eslint-disable-next-line local/max-button-words -- Canvas Orbit Habit Detail line 176 controls this label under D42.
    <Pressable accessibilityRole="button" accessibilityLabel={t('habits.detail.askAstra')} onPress={openConversation} style={({ pressed }) => [styles.astraRow, { opacity: pressed ? 0.8 : 1 }]}><View style={styles.astraGlyph} accessible={false}><AstraGlyph size={20} color={tokens.fg1} /></View><Text numberOfLines={1} style={[styles.astraLabel, { color: tokens.fg1 }]}>{t('habits.detail.askAstra')}</Text><ChevronRight size={24} strokeWidth={1.5} color={tokens.fg3} /></Pressable>
  )
}

function Metrics({ visible, loading, metrics, isBadHabit, tokens }: Readonly<{ visible: boolean; loading: boolean; metrics: ReturnType<typeof useHabitMetrics>['data']; isBadHabit: boolean; tokens: ReturnType<typeof createTokensV2> }>) {
  const { t } = useTranslation()
  if (!visible) return null
  if (loading) return <View style={styles.tileGrid}><Skeleton variant="stat-tile" label={t('habits.detail.loading')} /><Skeleton variant="stat-tile" label={t('habits.detail.loading')} /><Skeleton variant="stat-tile" label={t('habits.detail.loading')} /></View>
  if (!metrics || metrics.totalCompletions === 0) return <Text accessibilityLiveRegion="polite" style={[styles.muted, { color: tokens.fg3, textAlign: 'center', paddingVertical: 16 }]}>{t('habits.detail.noDataYet')}</Text>
  const values = [
    { label: t(isBadHabit ? 'habits.detail.daysFree' : 'habits.detail.currentStreak'), value: String(metrics.currentStreak) },
    { label: t('habits.detail.longestStreak'), value: String(metrics.longestStreak) },
    { label: t('habits.detail.monthlyRate'), value: `${Math.round(metrics.monthlyCompletionRate)}%` },
  ]
  return <View style={styles.tileGrid}>{values.map((item) => <StatTile key={item.label} label={item.label} value={item.value} />)}</View>
}

function Header({ habit, summary, completed, logged, tokens, onPatch, onLog, completionDisabled, completionReason }: Readonly<{ habit: NormalizedHabit; summary: string; completed: boolean; logged: boolean; tokens: ReturnType<typeof createTokensV2>; onPatch: (patch: Parameters<typeof buildHabitDetailUpdateRequest>[1]) => Promise<boolean>; onLog: () => void; completionDisabled: boolean; completionReason?: string }>) {
  const { t } = useTranslation()
  const { width } = useWindowDimensions()
  const [editing, setEditing] = useState(false)
  const [descriptionOpen, setDescriptionOpen] = useState(false)
  const [title, setTitle] = useState(habit.title)
  const formStyles = useMemo(() => createFormStyles(tokens), [tokens])
  const save = async () => {
    const next = title.trim()
    if (!next || next === habit.title) {
      setTitle(habit.title)
      setEditing(false)
      return
    }
    if (await onPatch({ title: next })) setEditing(false)
  }
  return (
    <>
      <View testID="habit-detail-header-row" style={styles.header}>
        <HabitEmojiSelector selectedEmoji={habit.emoji ?? ''} onSelect={(emoji) => { void onPatch({ emoji }) }} wellSize={76} tokens={tokens} styles={formStyles} />
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={styles.hiddenTitle}>{habit.title}</Text>
          {editing ? <TextInput autoFocus value={title} maxLength={200} accessibilityLabel={t('habits.detail.rename')} onChangeText={setTitle} onBlur={() => void save()} onSubmitEditing={() => void save()} style={[styles.titleInput, responsiveTypeStyle('habitTitle', width), { color: tokens.fg1, borderBottomColor: tokens.primary }]} /> : <Pressable accessibilityRole="button" accessibilityLabel={habit.title} accessibilityHint={t('habits.detail.rename')} onPress={() => setEditing(true)} style={styles.renameTarget}><Text numberOfLines={1} style={[responsiveTypeStyle('habitTitle', width), { color: tokens.fg1 }]}>{habit.title}</Text></Pressable>}
          {summary ? <Text numberOfLines={1} style={[styles.summary, { color: tokens.fg3 }]}>{summary}</Text> : null}
        </View>
        <PillButton variant="ghost" size="sm" iconOnly label={t('habits.detail.rename')} onClick={() => setEditing(true)}><Pencil size={20} color={tokens.fg1} /></PillButton>
        <HabitLogButton label={t(logged ? 'habits.detail.unlog' : 'habits.detail.log', { title: habit.title })} completed={completed} logged={logged} progress={completed ? 1 : 0} onPress={onLog} disabled={completionDisabled} disabledReason={completionReason} />
      </View>
      {habit.tags.length > 0 ? <View testID="habit-detail-tags" style={styles.headerMetadata}><View style={styles.tags}>{habit.tags.map((tag) => <View key={tag.id} style={[styles.tag, { borderColor: tokens.hairlineStrong }]}><Text numberOfLines={1} style={[styles.tagText, { color: tokens.fg2 }]}>{tag.name}</Text></View>)}</View></View> : null}
      {habit.description ? <Pressable testID="habit-detail-description" style={styles.headerMetadata} accessibilityRole="button" accessibilityLabel={habit.description} accessibilityHint={t('habits.detail.viewDescription')} accessibilityState={{ expanded: descriptionOpen }} onPress={() => setDescriptionOpen((open) => !open)} hitSlop={{ bottom: 12 }}><Text numberOfLines={descriptionOpen ? undefined : 1} style={[styles.muted, { color: tokens.fg3 }]}>{habit.description}</Text></Pressable> : null}
    </>
  )
}

function History({ habit, logs, today, locale, weekStartsOn, tokens }: Readonly<{ habit: NormalizedHabit; logs: ReturnType<typeof useHabitLogs>['data']; today: Date; locale: string; weekStartsOn: 0 | 1; tokens: ReturnType<typeof createTokensV2> }>) {
  const { t } = useTranslation()
  const [month, setMonth] = useState(startOfMonth(today))
  const { displayClock } = useTimeFormat()
  const loaded = isHabitHistoryMonthLoaded(month, today)
  const days = buildHabitHistoryMonth(habit, loaded ? logs ?? [] : [], month, today, weekStartsOn)
  const label = formatLocaleDate(month, locale, { month: 'long', year: 'numeric' })
  const weekdayLabels = formatWeekdayLabels(locale, weekStartsOn)
  const words = { none: t('habits.detail.missedWord'), partial: t('habits.detail.missedWord'), full: t('habits.detail.doneWord'), notScheduled: t('habits.detail.notScheduledWord'), of: t('habits.detail.ofWord'), today: t('habits.detail.todayWord'), readOnly: t('habits.detail.readOnlyWord') }
  const changeMonth = (offset: number) => {
    setMonth((value) => addMonths(value, offset))
  }
  return (
    <Surface>
      <View style={styles.sectionHeader}><SectionTitle color={tokens.fg1}>{t('habits.detail.history')}</SectionTitle><View style={styles.historyActions}><PillButton variant="ghost" size="sm" iconOnly label={t('habits.detail.previousMonth')} disabled={!canNavigateHabitHistoryBack(month, habit.createdAtUtc)} onClick={() => changeMonth(-1)}><ChevronLeft size={20} color={tokens.fg1} /></PillButton><Text style={[styles.summary, { flex: 1, textAlign: 'center', color: tokens.fg3 }]}>{capitalizeFirstLetter(label)}</Text><PillButton variant="ghost" size="sm" iconOnly label={t('habits.detail.nextMonth')} disabled={!canNavigateHabitHistoryForward(month, today)} onClick={() => changeMonth(1)}><ChevronRight size={20} color={tokens.fg1} /></PillButton></View></View>
      <View><MonthGrid weekdayLabels={weekdayLabels} gap={4} label={t('habits.detail.calendarLabel', { month: label })}>{days.map((day) => {
        const dateLabel = formatLocaleDate(day.date, locale, { dateStyle: 'full' })
        const cellLabel = day.loggedAt
          ? t('habits.detail.loggedAt', {
              date: dateLabel,
              time: displayClock(day.loggedAt),
            })
          : dateLabel
        if (day.outcome === 'future' || day.outcome === 'unavailable') {
          const outcomeWord = day.outcome === 'future' ? t('habits.detail.futureWord') : t('habits.detail.unavailableWord')
          return (
            <View
              key={day.dateStr}
              accessibilityRole="image"
              accessibilityElementsHidden={day.outsideMonth}
              importantForAccessibility={day.outsideMonth ? 'no-hide-descendants' : 'auto'}
              accessibilityLabel={day.outsideMonth ? undefined : `${cellLabel}, ${outcomeWord}, ${t('habits.detail.readOnlyWord')}`}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: day.outsideMonth ? 0 : 1 }}
            >
              <Text style={{ color: tokens.fg3, fontFamily: 'GeistMono_400Regular', fontSize: 14, fontVariant: ['tabular-nums'] }}>{day.day}</Text>
            </View>
          )
        }
        return <DayCell key={day.dateStr} day={day.day} done={day.outcome === 'full' ? 1 : 0} scheduled={day.outcome === 'not-scheduled' ? 0 : 1} outsideMonth={day.outsideMonth} today={day.today} label={cellLabel} words={words} habitHistory />
      })}</MonthGrid></View>
    </Surface>
  )
}

function useHabitRescue({ habitId, isBadHabit, slipping, overdue, hasPro, locale }: Readonly<{ habitId: string; isBadHabit: boolean; slipping: boolean; overdue: boolean; hasPro: boolean; locale: string }>) {
  const eligible = !isBadHabit && slipping && overdue
  const query = useRescheduleSuggestion({ habitId, locale, enabled: eligible && hasPro })
  return { query, open: eligible && extractBackendErrorCode(query.error) !== 'HABIT_NOT_OVERDUE' }
}

function SlippingLine({ visible, metrics, createdAtUtc, today, timeZone, tokens }: Readonly<{ visible: boolean; metrics: HabitMetrics | undefined; createdAtUtc: string; today: Date; timeZone: string | null | undefined; tokens: ReturnType<typeof createTokensV2> }>) {
  const { t } = useTranslation()
  if (!visible || !metrics) return null
  return <Text style={[styles.rescueBody, { color: tokens.fg2 }]}>{t('habits.detail.slippingLine', { days: getHabitDaysWithoutLog(metrics, createdAtUtc, today, timeZone), streak: metrics.currentStreak, limit: HABIT_SLIPPING_RATE_LIMIT })}</Text>
}

function renderRescueProposalValues(suggestion: RescheduleSuggestion, labels: ReturnType<typeof buildRescheduleProposalLabels>, finePrint: string, tokens: ReturnType<typeof createTokensV2>) {
  return <>
          <View style={styles.rescueValues}>
            <Text testID="rescue-proposed-schedule" style={styles.rescueDate}>{labels.dateLabel}{labels.timeLabel ? ` · ${labels.timeLabel}` : ''}</Text>
            {labels.scheduleLabel ? <Text style={[styles.rescueSchedule, { color: tokens.fg2 }]}>{labels.scheduleLabel}</Text> : null}
          </View>
          <Text style={[styles.rescueBody, { color: tokens.fg2 }]}>{suggestion.rationale}</Text>
          <Text style={[styles.rescueFinePrint, { color: tokens.fg3 }]}>{finePrint}</Text>
  </>
}

function RescheduleBlock({ habit, rescue: { query, open }, hasPro, locale, today, tokens, scheduleEditing, returnFocus }: Readonly<{ habit: NormalizedHabit; rescue: ReturnType<typeof useHabitRescue>; hasPro: boolean; locale: string; today: Date; tokens: ReturnType<typeof createTokensV2>; scheduleEditing: boolean; returnFocus: () => void }>) {
  const { t } = useTranslation()
  const router = useRouter()
  const updateHabit = useUpdateHabit()
  const { showError } = useAppToast()
  const { displayTime } = useTimeFormat()
  const [dismissed, setDismissed] = useAccountScopedState(false)
  const accountGeneration = useAccountGeneration()
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const isCurrentVisit = () => mounted.current && getAccountGeneration() === accountGeneration
  if (!open || dismissed) return null
  const close = () => {
    if (!isCurrentVisit()) return
    setDismissed(true)
    returnFocus()
  }
  const actionVariant = scheduleEditing ? 'ghost' : 'primary'
  const card = [styles.rescueCard, { backgroundColor: tokens.bgCard, borderColor: tokens.hairlineGhost }]
  const notNow = <PillButton variant="ghost" size="sm" disabled={updateHabit.isPending} onClick={close}>{t('habits.reschedule.dismiss')}</PillButton>
  if (!hasPro) {
    return (
      <View testID="rescue-free-card" style={card}>
        <View style={styles.rescueHead}><AstraGlyph size={20} color={tokens.fg1} /><Badge>{t('habits.detail.proGate')}</Badge></View>
        <Text style={[styles.rescueBody, { color: tokens.fg2 }]}>{t('habits.reschedule.freePrompt')}</Text>
        <View style={styles.rescueActions}>
          {/* eslint-disable-next-line local/max-button-words -- granted canvas label, Orbit Habit Detail.dc.html:857 (D42) */}
          <PillButton accessibilityRole="link" variant={actionVariant} size="sm" onClick={() => router.push('/upgrade')}>{t('habits.reschedule.upgrade')}</PillButton>
          {notNow}
        </View>
      </View>
    )
  }
  const accept = async (suggestion: RescheduleSuggestion) => {
    try {
      await updateHabit.mutateAsync({ habitId: habit.id, data: buildRescheduleUpdateRequest(habit, suggestion) })
      close()
    } catch {
      if (isCurrentVisit()) showError(t('habits.detail.rescheduleWriteError'))
    }
  }
  const suggestion = query.error ? null : query.suggestion
  return (
    <Proposed proposed scope="block" label={t('habits.form.proposedByAstra')}>
      <View style={card}>
        <View accessible accessibilityLiveRegion="polite" style={styles.rescueContent}>{suggestion ? renderRescueProposalValues(suggestion, buildRescheduleProposalLabels(suggestion, { locale, today, translate: t, formatTime: displayTime }), t('habits.detail.rescheduleFinePrint'), tokens) : <>
          <Text style={[styles.muted, { color: tokens.fg3 }]}>{query.error ? t('habits.detail.rescheduleError') : t('habits.detail.rescheduleLoading')}</Text>
        </>}</View>
        <View style={styles.rescueActions}>
          {suggestion ? <PillButton variant={actionVariant} size="sm" loading={updateHabit.isPending} onClick={() => void accept(suggestion)}>{t('habits.detail.rescheduleAccept')}</PillButton> : query.error ? <PillButton variant="ghost" size="sm" onClick={() => void query.refetch()}>{t('habits.detail.retry')}</PillButton> : null}
          {notNow}
        </View>
      </View>
    </Proposed>
  )
}

function FocusedRescheduleBlock(props: Readonly<Parameters<typeof RescheduleBlock>[0]>) {
  const isFocused = useIsFocused()
  return isFocused ? <RescheduleBlock {...props} /> : null
}

async function waitForQueuedDetailLog(response: unknown, toggleKey: string): Promise<void> {
  if (isQueuedResult(response)) {
    await waitForFirstWriteFinalization({ type: 'logHabit', dedupeKey: toggleKey })
  }
}

function CompletionBoundaryReason({ disabled, reason, tokens }: Readonly<{ disabled: boolean; reason?: string; tokens: ReturnType<typeof createTokensV2> }>) {
  if (!disabled || !reason) return null
  return <Text style={[styles.muted, { color: tokens.fg2, marginHorizontal: 16, marginBottom: 16 }]}>{reason}</Text>
}

function LogDateError({ visible, tokens }: Readonly<{ visible: boolean; tokens: ReturnType<typeof createTokensV2> }>) {
  const { t } = useTranslation()
  return <View accessibilityLiveRegion="polite">{visible ? <Text style={[styles.muted, { color: tokens.statusBadText, marginHorizontal: 16 }]}>{t('habits.detail.logDateUnavailable')}</Text> : null}</View>
}

function HabitDetailNavigation({ parentId, onBack, titleIsHeading = false }: Readonly<{ parentId?: string | null; onBack: () => void; titleIsHeading?: boolean }>) {
  const { t } = useTranslation()
  return <AppBar title={t('habits.detail.screenTitle')} titleIsHeading={titleIsHeading} onBack={onBack}
    backLabel={t(parentId ? 'common.backToParentHabit' : 'common.backToToday')} />
}

function DetailChecklist({ editing, ...props }: Readonly<React.ComponentProps<typeof HabitChecklist> & { editing: boolean }>) {
  return editing ? null : <HabitChecklist {...props} />
}

function useDetailWrites(habitId: string, accountGeneration: number): ReturnType<typeof createAccountScopedHabitDetailWriteQueue> {
  const [scope, setScope] = useState(() => ({ accountGeneration, habitId, queue: createAccountScopedHabitDetailWriteQueue(accountGeneration, getAccountGeneration) }))
  if (scope.accountGeneration !== accountGeneration || scope.habitId !== habitId) {
    setScope({ accountGeneration, habitId, queue: createAccountScopedHabitDetailWriteQueue(accountGeneration, getAccountGeneration) })
  }
  return scope.queue
}

export function HabitDetailScreen({ habitId, date, fromToday = false, parentId }: Readonly<HabitDetailScreenProps>) {
  const { t } = useTranslation()
  const router = useRouter()
  const { profile, isError, refetch } = useProfile()
  if (!profile) {
    return <FlowShell nav={false} header={<HabitDetailNavigation parentId={parentId} titleIsHeading onBack={() => {
      if (parentId || fromToday) router.back()
      else router.replace(date ? { pathname: '/(tabs)', params: { date } } : '/(tabs)')
    }} />}>
      {isError
        ? <ErrorState message={t('common.error')} action={<PillButton variant="secondary" onClick={() => void refetch()}>{t('habits.detail.retry')}</PillButton>} />
        : <View accessible accessibilityRole="progressbar" accessibilityLabel={t('profile.loading')} accessibilityState={{ busy: true }} style={styles.profileLoading}>
            <Skeleton variant="habit-row" grouped />
            <Skeleton variant="stat-tile" grouped />
            <Skeleton variant="grid" rows={6} cols={7} cell={32} gap={4} grouped />
          </View>}
    </FlowShell>
  }
  return <HabitDetailContent habitId={habitId} date={date} fromToday={fromToday} parentId={parentId} profile={profile} />
}

function HabitDetailContent({ habitId, date, fromToday = false, parentId, profile }: Readonly<HabitDetailScreenProps & { profile: NonNullable<ReturnType<typeof useProfile>['profile']> }>) {
  const { t, i18n } = useTranslation()
  const { displayTime } = useTimeFormat()
  const [stripWidth, setStripWidth] = useState(0)
  const router = useRouter()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
  const todayStr = useCurrentDate(profile.timeZone)
  const today = useMemo(() => parseAPIDate(todayStr), [todayStr])
  const dateStr = date ?? todayStr
  const selectedDate = useMemo(() => parseAPIDate(dateStr), [dateStr])
  const detailQuery = useHabitDetail(habitId)
  const logsQuery = useHabitLogs(habitId)
  const metricsQuery = useHabitMetrics(habitId)
  const habitsQuery = useHabits({
    dateFrom: dateStr,
    dateTo: dateStr,
    includeOverdue: dateStr === todayStr,
    includeGeneral: true,
  }, { completeDay: true })
  const todayHabitsQuery = useHabits({
    dateFrom: todayStr,
    dateTo: todayStr,
    includeOverdue: true,
    includeGeneral: true,
  }, { completeDay: true })
  const allHabitsQuery = useHabits({})
  const logHabit = useLogHabit()
  const updateHabit = useUpdateHabit()
  const detailAccountGeneration = useAccountGeneration()
  const detailWrites = useDetailWrites(habitId, detailAccountGeneration)
  const updateChecklist = useUpdateChecklist()
  const deleteHabit = useDeleteHabit()
  const { showError } = useAppToast()
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmAction>(null)
  const [pendingDateLog, setPendingDateLog] = useState<{ habitId: string; intent: 'log' | 'unlog'; date: string; name: string; permanent: boolean } | null>(null)
  const [invalidLogDate, setInvalidLogDate] = useState<{ date: string; habitId: string } | null>(null)
  const [childToDelete, setChildToDelete] = useState<string | null>(null)
  const pendingToggleKeysRef = useRef(new Set<string>())
  const stripLabelRef = useRef<Text>(null)
  const focusStrip = () => {
    const tag = findNodeHandle(stripLabelRef.current)
    if (tag != null) AccessibilityInfo.setAccessibilityFocus(tag)
  }
  const habit = useMemo(() => {
    if (!detailQuery.data) return null
    const merged = mergeHabitDetailWithScopedHabit(detailQuery.data, allHabitsQuery.data?.habitsById.get(habitId), dateStr, habitsQuery.data?.habitsById.get(habitId))
    return parentId ? { ...merged, parentId } : merged
  }, [allHabitsQuery.data, dateStr, detailQuery.data, habitId, habitsQuery.data, parentId])
  const relationshipControlsAvailable = detailQuery.data ? hasAuthoritativeHabitRelationshipState(detailQuery.data, allHabitsQuery.data?.habitsById.get(habitId), habitsQuery.data?.habitsById.get(habitId)) : false
  const logs = logsQuery.data ?? []
  const logged = logs.some((entry) => entry.date === dateStr && entry.value > 0)
  const completed = habit ? isHabitCompletedOnDate(habit, logs, dateStr) : false
  const summary = habit ? computeHabitFrequencyLabel(habit, t) : null
  const language = profile.language ?? i18n.language
  const strip = habit ? buildHabitStripModel(habit, logs, today, language, profile.weekStartDay) : null
  const slipping = habit ? isHabitSlipping(habit, metricsQuery.data ?? null, logs, today, profile.timeZone) : false
  const overdue = todayHabitsQuery.data?.habitsById.get(habitId)?.isOverdue === true
  const hasPro = profile.hasProAccess
  const rescue = useHabitRescue({ habitId, isBadHabit: habit?.isBadHabit === true, slipping, overdue, hasPro, locale: language })
  const dueTime = displayTime(habit?.dueTime)
  const headerSummary = buildHabitDetailHeaderSummary(summary, habit?.dueTime ?? null, dueTime)
  const boundary = getTodayBoundary(dateStr, todayStr)
  const completionDisabled = isHabitDetailCompletionDisabled(habit, dateStr, todayStr)
  const completionReason = boundary === 'read-only'
    ? t('habits.todayBoundary.readOnly')
    : boundary === 'future' ? t('habits.todayBoundary.future') : undefined
  const reducedMotion = useReducedMotion()
  const [detailChevron] = useState(() => new Animated.Value(0))
  const [detailOpacity] = useState(() => new Animated.Value(0))
  useEffect(() => {
    Animated.timing(detailChevron, { toValue: detailsOpen ? 1 : 0, duration: reducedMotion ? 0 : 220, easing: Easing.bezier(...motionEasings.standard), useNativeDriver: true }).start()
    if (detailsOpen) {
      detailOpacity.setValue(0)
      Animated.timing(detailOpacity, { toValue: 1, duration: reducedMotion ? 0 : 160, easing: Easing.bezier(...motionEasings.standard), useNativeDriver: true }).start()
    }
  }, [detailChevron, detailOpacity, detailsOpen, reducedMotion])
  const back = useCallback(() => {
    if (parentId) router.back()
    else if (fromToday) router.back()
    else router.replace({ pathname: '/(tabs)', params: { date: dateStr } })
  }, [dateStr, fromToday, parentId, router])
  const runWrite = useCallback(async (write: () => Promise<unknown>, errorMessage: string): Promise<boolean> => {
    try {
      await write()
      return true
    } catch {
      showError(errorMessage)
      return false
    }
  }, [showError])
  const patch = (next: Parameters<typeof buildHabitDetailUpdateRequest>[1]) => {
    if (!habit) return Promise.resolve(false)
    return detailWrites.save(habit, next, (request) => runWrite(() => updateHabit.mutateAsync({ habitId, data: request }), t('habits.detail.updateError')))
  }
  const writeLog = async (targetHabitId: string, intent: 'log' | 'unlog', confirmed = false) => {
    const currentDate = new Date()
    const accountToday = formatAPIDateInTimeZone(currentDate, profile.timeZone)
    const targetHabit = targetHabitId === habitId ? habit
      : habitsQuery.data?.habitsById.get(targetHabitId) ?? allHabitsQuery.data?.habitsById.get(targetHabitId)
    const decision = getHabitLogDateDecision(targetHabit, dateStr, accountToday, profile.timeZone, confirmed, intent)
    setInvalidLogDate(null)
    switch (decision) {
      case 'block':
        setInvalidLogDate({ date: dateStr, habitId: targetHabitId })
        return false
      case 'confirm':
      case 'confirm-permanent-unlog':
        setConfirm(null)
        setPendingDateLog({ habitId: targetHabitId, intent, date: dateStr, name: targetHabit?.title ?? habit?.title ?? '', permanent: decision === 'confirm-permanent-unlog' })
        return false
    }
    const toggleKey = `habit-toggle:${targetHabitId}:${dateStr}`
    const pendingToggleKeys = pendingToggleKeysRef.current
    if (
      pendingToggleKeys.has(toggleKey) ||
      findUnfinalizedFirstWrite({ type: 'logHabit', dedupeKey: toggleKey })
    ) return false

    pendingToggleKeys.add(toggleKey)
    let mutationCompleted = false
    try {
      const response = await logHabit.mutateAsync({ habitId: targetHabitId, date: dateStr, intent })
      mutationCompleted = true
      await waitForQueuedDetailLog(response, toggleKey)
      return true
    } catch (error) {
      if (mutationCompleted) showError(getFriendlyErrorMessage(error, (key, values) => t(key, values), 'habits.detail.logError'), t('common.dismiss'))
      return false
    } finally {
      pendingToggleKeys.delete(toggleKey)
    }
  }
  const setItems = (items: ChecklistItem[]) => runWrite(
    () => updateChecklist.mutateAsync({ habitId, items }),
    t('habits.detail.checklistError'),
  )
  const toggleItem = async (index: number) => {
    if (!habit) return
    const items = habit.checklistItems.map((item, itemIndex) => itemIndex === index ? { ...item, isChecked: !item.isChecked } : item)
    if (await setItems(items) && items.length > 0 && items.every((item) => item.isChecked) && !logged && !completionDisabled) setConfirm('log')
  }
  const confirmLog = async () => {
    if (completionDisabled) { setConfirm(null); return }
    if (await writeLog(habitId, 'log')) setConfirm(null)
  }
  const confirmDelete = async () => {
    if (!await runWrite(() => deleteHabit.mutateAsync(habitId), t('habits.detail.deleteError'))) return
    setConfirm(null)
    router.replace({ pathname: '/(tabs)', params: { date: dateStr } })
  }
  const confirmChildDelete = async () => {
    if (!childToDelete) return
    if (!await runWrite(() => deleteHabit.mutateAsync(childToDelete), t('habits.detail.deleteError'))) return
    setConfirm(null)
    setChildToDelete(null)
  }
  const openChild = (id: string) => router.push({ pathname: '/habits/[id]', params: { id, date: dateStr, parent: habitId, ...(fromToday ? { from: 'today' } : {}) } })
  const retryFailedQueries = () => {
    if (detailQuery.isError || !detailQuery.data) void detailQuery.refetch()
    if (allHabitsQuery.isError) void allHabitsQuery.refetch()
  }
  const childUnavailableReasonKey = getHabitDetailChildUnavailableReasonKey(
    habitsQuery.isError, habitsQuery.isLoading, !!habitsQuery.data,
  )
  const childUnavailableReason = t(childUnavailableReasonKey)

  const appBar = <HabitDetailNavigation parentId={parentId} titleIsHeading={detailQuery.isLoading || allHabitsQuery.isLoading || detailQuery.isError || allHabitsQuery.isError || !habit || !detailQuery.data} onBack={back} />
  if (detailQuery.isLoading || allHabitsQuery.isLoading) return <FlowShell nav={false} header={appBar}><Skeleton variant="habit-row" label={t('habits.detail.loading')} /><Skeleton variant="stat-tile" label={t('habits.detail.loading')} /><Skeleton variant="grid" rows={6} cols={7} cell={32} gap={4} label={t('habits.detail.loading')} /></FlowShell>
  if (detailQuery.isError || allHabitsQuery.isError || !habit || !detailQuery.data) return <FlowShell nav={false} header={appBar}><ErrorState message={t('habits.detail.loadError')} action={<PillButton variant="secondary" onClick={retryFailedQueries}>{t('habits.detail.retry')}</PillButton>} /></FlowShell>

  const children = (normalizeHabitDetailForDrill(detailQuery.data, dateStr)
    .childrenByParent.get(habit.id) ?? [])
    .map((child) => {
      const scopedChild = getAvailableHabitDetailScopedChild(
        habitsQuery.data?.habitsById.get(child.id), habitsQuery.isError, habitsQuery.isLoading,
      )
      return {
        ...buildHabitDetailChildDateModel(child, scopedChild, dateStr, todayStr),
        completionReason: getHabitDetailChildCompletionReason(scopedChild, completionReason, childUnavailableReason),
        completionStatusUnavailable: scopedChild === undefined,
      }
    })
  return (
    <FlowShell nav={false} header={appBar}>
      <View testID="habit-detail-content" style={styles.content}>
      <View>
        <Header habit={habit} summary={headerSummary} completed={completed} logged={logged} tokens={tokens} onPatch={patch} onLog={() => { void writeLog(habitId, logged ? 'unlog' : 'log') }} completionDisabled={completionDisabled} completionReason={completionReason} />
        <LogDateError visible={invalidLogDate?.date === dateStr && invalidLogDate.habitId === habitId} tokens={tokens} />
        <CompletionBoundaryReason disabled={completionDisabled} reason={completionReason} tokens={tokens} />
        {strip ? <View testID="habit-detail-strip-section" onLayout={(event) => setStripWidth(event.nativeEvent.layout.width)} style={styles.stripSection}><Text ref={stripLabelRef} style={[styles.stripLabel, { color: tokens.fg3 }]}>{t('habits.detail.lastThirtyDays')}</Text><DayStrip scope="habit" days={strip.days} labels={strip.labels} label={t('habits.detail.lastThirtyDays')} size={habitStripCellSize(stripWidth)} words={{ done: t('habits.detail.doneWord'), missed: t('habits.detail.missedWord'), notScheduled: t('habits.detail.notScheduledWord') }} /><SlippingLine visible={rescue.open} metrics={metricsQuery.data} createdAtUtc={habit.createdAtUtc} today={today} timeZone={profile.timeZone} tokens={tokens} /></View> : null}
      </View>
      <FocusedRescheduleBlock key={habit.id} habit={habit} rescue={rescue} hasPro={hasPro} locale={language} today={today} tokens={tokens} scheduleEditing={scheduleOpen} returnFocus={focusStrip} />
      <DetailChecklist editing={detailsOpen} items={habit.checklistItems} interactive onToggle={(index) => void toggleItem(index)} onItemsChange={(items) => { void setItems(items) }} onReset={() => { void setItems(habit.checklistItems.map((item) => ({ ...item, isChecked: false }))) }} onClear={() => setConfirm('clear')} />
      <Metrics visible={shouldShowHabitMetrics(habit)} loading={metricsQuery.isLoading} metrics={metricsQuery.data} isBadHabit={habit.isBadHabit} tokens={tokens} />
      <ReminderReadout habit={habit} tokens={tokens} />
      <Surface><View style={styles.sectionHeading}><SectionTitle color={tokens.fg1}>{t('habits.detail.inside')}</SectionTitle></View><DayHabitsStatus reasonKey={childUnavailableReasonKey} onRetry={() => { void habitsQuery.refetch() }} tokens={tokens} /><View testID="detail-children" style={{ backgroundColor: tokens.bgCard, borderRadius: 20, borderColor: tokens.hairlineGhost, borderWidth: 1 }} accessibilityState={{ busy: habitsQuery.isLoading }}>{children.map(({ habit: child, completionReadOnly, completionReason: childCompletionReason, completionStatusUnavailable }) => <View key={child.id}><HabitRow habit={child} selectedDate={selectedDate} today={todayStr} completionReadOnly={completionReadOnly} completionReason={childCompletionReason} completionStatusUnavailable={completionStatusUnavailable} depth={1} actions={{ onLog: () => { void writeLog(child.id, 'log') }, onUnlog: () => { void writeLog(child.id, 'unlog') }, onDetail: () => openChild(child.id), onDelete: () => { setChildToDelete(child.id); setConfirm('delete-child') } }} /><LogDateError visible={invalidLogDate?.date === dateStr && invalidLogDate.habitId === child.id} tokens={tokens} /><UnscheduledChildReason reason={childCompletionReason} notScheduledReason={t('calendar.dayCell.notScheduled')} tokens={tokens} /></View>)}</View><ListRow icon={<Plus size={24} color={tokens.fg1} />} title={t('habits.detail.addSubHabit')} chevron={false} trailing={!hasPro ? <Badge>{t('habits.detail.proGate')}</Badge> : undefined} onClick={() => hasPro ? setCreateOpen(true) : router.push('/upgrade')} /></Surface>
      <History habit={habit} logs={logsQuery.data} today={today} locale={language} weekStartsOn={profile.weekStartDay} tokens={tokens} />
      <AskAstraRow habit={habit} tokens={tokens} />
      <HabitDetailSchedule habit={habit} summary={summary ?? ''} open={scheduleOpen} tokens={tokens} onToggle={() => setScheduleOpen((value) => !value)} onCancel={() => setScheduleOpen(false)} onSave={(patchValue) => { void patch(patchValue).then((saved) => { if (saved) setScheduleOpen(false) }) }} />
      <Surface><Pressable accessibilityRole="button" accessibilityState={{ expanded: detailsOpen }} onPress={() => setDetailsOpen((value) => !value)} style={styles.disclosure}><Text numberOfLines={1} style={[styles.sectionTitle, styles.disclosureTitle, { color: tokens.fg1 }]}>{t('habits.detail.moreDetails')}</Text><Animated.View style={{ transform: [{ rotate: detailChevron.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }}><ChevronDown size={24} color={tokens.fg3} /></Animated.View></Pressable><Animated.View style={{ opacity: detailOpacity, display: detailsOpen ? 'flex' : 'none' }}><HabitDetailFields key={habit.id} open={detailsOpen} habit={habit} hasProAccess={hasPro} relationshipControlsAvailable={relationshipControlsAvailable} tokens={tokens} onItemsChange={(items) => { void setItems(items) }} onPatch={patch} onUpgrade={() => router.push('/upgrade')} /></Animated.View></Surface>
      <DateRow label={t('habits.detail.startedOn')} value={formatLocaleDate(new Date(habit.createdAtUtc), language, { dateStyle: 'medium' })} note={t('habits.form.startDateReason')} />
      <ListRow icon={<Trash2 size={24} color={tokens.statusBad} />} title={t('habits.detail.delete')} danger chevron={false} onClick={() => setConfirm('delete')} />
      <CreateHabitModal open={createOpen} onClose={() => setCreateOpen(false)} initialDate={dateStr} parentHabit={habit} />
      <ConfirmSheet open={confirm === 'clear'} title={t('habits.checklistClearTitle')} message={t('habits.checklistClearMessage')} confirmLabel={t('habits.form.clearChecklist')} destructive onCancel={() => setConfirm(null)} onConfirm={() => { void setItems([]).then((saved) => { if (saved) setConfirm(null) }) }} />
      <ConfirmSheet open={confirm === 'log'} title={t('habits.checklistCompleteTitle')} message={t('habits.checklistCompleteMessage', { name: habit.title })} confirmLabel={t('habits.checklistCompleteConfirm')} onCancel={() => setConfirm(null)} onConfirm={() => { void confirmLog() }} />
      <ConfirmSheet open={pendingDateLog !== null} title={t('habits.detail.logDateConfirmTitle')} message={t(getHabitLogDateConfirmationKeys(pendingDateLog?.intent, pendingDateLog?.permanent).message, { name: pendingDateLog?.name ?? habit.title, date: formatLocaleDate(parseAPIDate(pendingDateLog?.date ?? dateStr), language, { dateStyle: 'long' }) })} confirmLabel={t(getHabitLogDateConfirmationKeys(pendingDateLog?.intent, pendingDateLog?.permanent).action)} onCancel={() => setPendingDateLog(null)} onConfirm={() => {
        const pending = pendingDateLog
        setPendingDateLog(null)
        if (pending?.date === dateStr) void writeLog(pending.habitId, pending.intent, true)
      }} />
      <ConfirmSheet open={confirm === 'delete'} title={t('habits.deleteConfirmTitle')} message={t('habits.deleteConfirmMessage')} confirmLabel={t('habits.deleteHabit')} destructive onCancel={() => setConfirm(null)} onConfirm={() => { void confirmDelete() }} />
      <ConfirmSheet open={confirm === 'delete-child'} title={t('habits.deleteConfirmTitle')} message={t('habits.deleteConfirmMessage')} confirmLabel={t('habits.deleteHabit')} destructive onCancel={() => { setConfirm(null); setChildToDelete(null) }} onConfirm={() => { void confirmChildDelete() }} />
    </View>
    </FlowShell>
  )
}

const styles = StyleSheet.create({
  astraRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 16, marginHorizontal: -16 },
  astraGlyph: { width: 28, alignItems: 'center' },
  astraLabel: { flex: 1, minWidth: 0, fontFamily: 'Geist_400Regular', fontSize: 17 },
  reminders: { gap: 4 },
  reminderHeading: { fontFamily: 'Geist_500Medium', fontSize: 14 },
  reminderRow: { flexDirection: 'row', alignItems: 'center', minHeight: 32, gap: 8 },
  reminderTime: { fontFamily: 'GeistMono_400Regular', fontSize: 14, fontVariant: ['tabular-nums'] },
  stripSection: { gap: 8, paddingTop: 24 },
  stripLabel: { fontFamily: 'Geist_400Regular', fontSize: 12, lineHeight: 16 },
  content: { width: '100%', maxWidth: 620, alignSelf: 'center', gap: 24 },
  summary: { fontFamily: 'GeistMono_400Regular', fontSize: 12, lineHeight: 16, fontVariant: ['tabular-nums'] },
  profileLoading: { gap: 16, padding: 16 },
  surface: { gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerCopy: { flex: 1, minWidth: 0, gap: 4 },
  renameTarget: { minWidth: 44, paddingVertical: 8, marginVertical: -8 },
  hiddenTitle: { position: 'absolute', width: 1, height: 1, overflow: 'hidden' },
  titleInput: { borderBottomWidth: 2, padding: 0 },
  muted: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20 },
  sectionTitle: { fontFamily: 'Geist_500Medium', fontSize: 14, lineHeight: 24 },
  sectionHeader: { gap: 8 },
  sectionHeading: { gap: 4 },
  dayHabitsStatus: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, paddingVertical: 12 },
  childReason: { alignSelf: 'flex-end', paddingRight: 12, paddingBottom: 8 },
  disclosureTitle: { fontSize: 17 },
  historyActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tileGrid: { flexDirection: 'row', gap: 8 },
  metric: { flex: 1, minWidth: 0, alignItems: 'center', gap: 4 },
  metricValue: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 24, lineHeight: 29, fontVariant: ['tabular-nums'] },
  metricLabel: { fontFamily: 'Geist_400Regular', fontSize: 12, lineHeight: 16, width: '100%', textAlign: 'center' },
  headerMetadata: { paddingTop: 12 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  tagText: { fontFamily: 'GeistMono_500Medium', fontSize: 12, letterSpacing: 0.7 },
  disclosure: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rescueCard: { gap: 12, padding: 24, borderRadius: 20, borderWidth: 1 },
  rescueContent: { gap: 12 },
  rescueHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rescueValues: { gap: 4 },
  rescueDate: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 20, lineHeight: 26, fontVariant: ['tabular-nums'] },
  rescueSchedule: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20 },
  rescueBody: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 22 },
  rescueFinePrint: { fontFamily: 'Geist_400Regular', fontSize: 12, lineHeight: 18 },
  rescueActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
})
