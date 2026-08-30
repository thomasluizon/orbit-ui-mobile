import AsyncStorage from '@react-native-async-storage/async-storage'
import { useCallback, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'
import { addMonths, startOfMonth } from 'date-fns'
import {
  buildHabitDetailUpdateRequest,
  buildHabitDetailChildDateModel,
  buildHabitHistoryMonth,
  buildHabitStripModel,
  buildRescheduleUpdateRequest,
  canNavigateHabitHistoryBack,
  canNavigateHabitHistoryForward,
  computeHabitFrequencyLabel,
  formatAPIDate,
  formatLocaleDate,
  isHabitHistoryMonthLoaded,
  isHabitCompletedOnDate,
  isHabitSlipping,
  normalizeHabitDetailForDrill,
  parseAPIDate,
  shouldResetHabitChecklist,
  shouldShowHabitMetrics,
} from '@orbit/shared/utils'
import type { ChecklistItem, HabitDetail, NormalizedHabit } from '@orbit/shared/types/habit'
import { FlowShell } from '@/components/shell/flow-shell'
import { AppBar } from '@/components/ui/app-bar'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { DayCell } from '@/components/dates/day-cell'
import { DayStrip } from '@/components/dates/day-strip'
import { ErrorState } from '@/components/ui/error-state'
import { ListRow } from '@/components/ui/list-row'
import { MonthGrid } from '@/components/dates/month-grid'
import { PillButton } from '@/components/ui/pill-button'
import { Proposed } from '@/components/ui/proposed'
import { Skeleton } from '@/components/ui/skeleton'
import { StatTile } from '@/components/ui/stat-tile'
import { Switch } from '@/components/ui/switch'
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, ListTree, Plus, Trash2 } from '@/components/ui/icons'
import { CreateHabitModal } from './create-habit-modal'
import { EditHabitModal } from './edit-habit-modal'
import { HabitChecklist } from './habit-checklist'
import { HabitEmojiSelector } from './habit-form-fields/habit-emoji-selector'
import { createStyles as createFormStyles } from './habit-form-fields/styles'
import { HabitLogButton } from './habit-log-button'
import { HabitRow } from './habit-row'
import { useHabitDetail, useHabitLogs, useHabitMetrics, useHabits } from '@/hooks/use-habit-queries'
import { useDeleteHabit, useLogHabit, useUpdateChecklist, useUpdateHabit } from '@/hooks/use-habits'
import { useProfile } from '@/hooks/use-profile'
import { useAppToast } from '@/hooks/use-app-toast'
import { useRescheduleSuggestion } from '@/hooks/use-reschedule-suggestion'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type ConfirmAction = 'clear' | 'delete' | 'log' | 'delete-child' | null

interface HabitDetailScreenProps {
  habitId: string
  date?: string | null
  fromToday?: boolean
  parentId?: string | null
}

function normalizeHabit(detail: HabitDetail, fallback: NormalizedHabit | undefined, today: string): NormalizedHabit {
  const drilled = normalizeHabitDetailForDrill(detail, today).parent
  if (!fallback) return drilled
  return { ...fallback, ...drilled, tags: fallback.tags, linkedGoals: fallback.linkedGoals, slipAlertEnabled: fallback.slipAlertEnabled, flexibleTarget: fallback.flexibleTarget, flexibleCompleted: fallback.flexibleCompleted, instances: fallback.instances }
}

function SectionTitle({ children, color }: Readonly<{ children: string; color: string }>) {
  return <Text style={[styles.sectionTitle, { color }]}>{children}</Text>
}

function Surface({ children, backgroundColor, borderColor }: Readonly<{ children: React.ReactNode; backgroundColor: string; borderColor: string }>) {
  return <View style={[styles.surface, { backgroundColor, borderColor }]}>{children}</View>
}

function Metrics({ visible, loading, metrics, tokens }: Readonly<{ visible: boolean; loading: boolean; metrics: ReturnType<typeof useHabitMetrics>['data']; tokens: ReturnType<typeof createTokensV2> }>) {
  const { t } = useTranslation()
  if (!visible) return <Text style={[styles.muted, { color: tokens.fg3 }]}>{t('habits.detail.noDataYet')}</Text>
  if (loading) return <View style={styles.tileGrid}><Skeleton variant="stat-tile" label={t('habits.detail.loading')} /><Skeleton variant="stat-tile" label={t('habits.detail.loading')} /><Skeleton variant="stat-tile" label={t('habits.detail.loading')} /><Skeleton variant="stat-tile" label={t('habits.detail.loading')} /></View>
  if (!metrics || metrics.totalCompletions === 0) return <Text style={[styles.muted, { color: tokens.fg3 }]}>{t('habits.detail.noDataYet')}</Text>
  return <View style={styles.tileGrid}><StatTile label={t('habits.detail.currentStreak')} value={String(metrics.currentStreak)} /><StatTile label={t('habits.detail.longestStreak')} value={String(metrics.longestStreak)} /><StatTile label={t('habits.detail.monthlyRate')} value={`${Math.round(metrics.monthlyCompletionRate)}%`} /><StatTile label={t('habits.detail.totalCompletions')} value={String(metrics.totalCompletions)} /></View>
}

function Header({ habit, summary, completed, logged, tokens, onPatch, onLog }: Readonly<{ habit: NormalizedHabit; summary: string; completed: boolean; logged: boolean; tokens: ReturnType<typeof createTokensV2>; onPatch: (patch: Parameters<typeof buildHabitDetailUpdateRequest>[1]) => Promise<boolean>; onLog: () => void }>) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
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
    <View style={styles.header}>
      <HabitEmojiSelector selectedEmoji={habit.emoji ?? ''} onSelect={(emoji) => { void onPatch({ emoji }) }} wellSize={76} tokens={tokens} styles={formStyles} />
      <View style={styles.headerCopy}>
        {editing ? <TextInput autoFocus value={title} maxLength={200} accessibilityLabel={t('habits.detail.rename')} onChangeText={setTitle} onBlur={() => void save()} onSubmitEditing={() => void save()} style={[styles.titleInput, { color: tokens.fg1, borderBottomColor: tokens.primary }]} /> : <Pressable accessibilityRole="button" accessibilityLabel={t('habits.detail.rename')} onPress={() => setEditing(true)}><Text numberOfLines={2} style={[styles.title, { color: tokens.fg1 }]}>{habit.title}</Text></Pressable>}
        <Text style={[styles.muted, { color: tokens.fg3 }]}>{summary}</Text>
        {habit.tags.length > 0 ? <View style={styles.tags}>{habit.tags.map((tag) => <View key={tag.id} style={[styles.tag, { borderColor: tokens.hairlineStrong }]}><Text style={[styles.tagText, { color: tokens.fg2 }]}>{tag.name.toUpperCase()}</Text></View>)}</View> : null}
      </View>
      <HabitLogButton label={t(logged ? 'habits.detail.unlog' : 'habits.detail.log', { title: habit.title })} completed={completed} logged={logged} progress={completed ? 1 : 0} onPress={onLog} />
    </View>
  )
}

function History({ habit, logs, today, locale, weekStartsOn, tokens }: Readonly<{ habit: NormalizedHabit; logs: ReturnType<typeof useHabitLogs>['data']; today: Date; locale: string; weekStartsOn: 0 | 1; tokens: ReturnType<typeof createTokensV2> }>) {
  const { t } = useTranslation()
  const [month, setMonth] = useState(startOfMonth(today))
  const loaded = isHabitHistoryMonthLoaded(month, today)
  const days = buildHabitHistoryMonth(habit, loaded ? logs ?? [] : [], month, today, weekStartsOn)
  const label = formatLocaleDate(month, locale, { month: 'long', year: 'numeric' })
  const weekdayLabels = Array.from({ length: 7 }, (_, offset) => new Date(2025, 0, 5 + ((weekStartsOn + offset) % 7)).toLocaleDateString(locale, { weekday: 'narrow' }))
  const words = { none: t('habits.detail.missedWord'), partial: t('habits.detail.missedWord'), full: t('habits.detail.doneWord'), notScheduled: t('habits.detail.notScheduledWord'), unavailable: t('habits.detail.unavailableWord'), future: t('habits.detail.futureWord'), of: t('habits.detail.ofWord'), today: t('habits.detail.todayWord'), selected: t('habits.detail.selectedWord'), readOnly: t('habits.detail.readOnlyWord') }
  return (
    <Surface backgroundColor={tokens.bgCard} borderColor={tokens.hairline}>
      <View style={styles.sectionHeader}><View><SectionTitle color={tokens.fg1}>{t('habits.detail.history')}</SectionTitle><Text style={[styles.muted, { color: tokens.fg3 }]}>{label}</Text></View><View style={styles.historyActions}><PillButton variant="ghost" size="sm" iconOnly label={t('habits.detail.previousMonth')} disabled={!canNavigateHabitHistoryBack(month, habit.createdAtUtc)} onClick={() => setMonth((value) => addMonths(value, -1))}><ChevronLeft size={20} color={tokens.fg1} /></PillButton><PillButton variant="ghost" size="sm" iconOnly label={t('habits.detail.nextMonth')} disabled={!canNavigateHabitHistoryForward(month, today)} onClick={() => setMonth((value) => addMonths(value, 1))}><ChevronRight size={20} color={tokens.fg1} /></PillButton></View></View>
      <MonthGrid weekdayLabels={weekdayLabels} gap={4} label={t('habits.detail.calendarLabel', { month: label })}>{days.map((day) => <DayCell key={day.dateStr} day={day.day} outsideMonth={day.outsideMonth} today={day.today} outcome={day.outcome} label={day.loggedAt ? t('habits.detail.loggedAt', { time: new Date(day.loggedAt).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' }) }) : undefined} words={words} />)}</MonthGrid>
      {!loaded ? <Text style={[styles.muted, { color: tokens.fg3 }]}>{t('habits.detail.olderHistoryUnavailable')}</Text> : null}
    </Surface>
  )
}

function RescheduleBlock({ habit, slipping, hasPro, locale, tokens }: Readonly<{ habit: NormalizedHabit; slipping: boolean; hasPro: boolean; locale: string; tokens: ReturnType<typeof createTokensV2> }>) {
  const { t } = useTranslation()
  const router = useRouter()
  const updateHabit = useUpdateHabit()
  const { showError } = useAppToast()
  const query = useRescheduleSuggestion({ habitId: habit.id, locale, enabled: slipping && hasPro })
  if (!slipping) return null
  if (!hasPro) {
    return <Surface backgroundColor={tokens.bgCard} borderColor={tokens.hairline}><ListRow title={t('habits.detail.slipping')} description={t('habits.detail.rescheduleFree')} value={t('habits.detail.proGate')} onClick={() => router.push('/upgrade')} /></Surface>
  }
  const accept = async () => {
    if (!query.suggestion) return
    try {
      await updateHabit.mutateAsync({ habitId: habit.id, data: buildRescheduleUpdateRequest(habit, query.suggestion) })
    } catch {
      showError(t('habits.detail.rescheduleWriteError'))
    }
  }
  return (
    <Proposed proposed scope="block" label={t('habits.detail.proposed')}>
      <View style={styles.proposedBlock}>
        <View style={styles.sectionHeading}>
          <Text style={[styles.proposedTitle, { color: tokens.fg1 }]}>{t('habits.detail.slipping')}</Text>
          <Text style={[styles.muted, { color: tokens.fg3 }]}>{query.suggestion?.rationale ?? (query.error ? t('habits.detail.rescheduleError') : t('habits.detail.rescheduleLoading'))}</Text>
        </View>
        <View style={styles.proposedAction}><PillButton variant="secondary" size="sm" disabled={!query.suggestion} loading={updateHabit.isPending} onClick={() => void accept()}>{t('habits.detail.rescheduleAccept')}</PillButton></View>
      </View>
    </Proposed>
  )
}

// eslint-disable-next-line sonarjs/cognitive-complexity -- this route coordinator keeps mutually dependent query, mutation, confirmation, and navigation state together; each visual section is already extracted above (#352)
export function HabitDetailScreen({ habitId, date, fromToday = false, parentId }: Readonly<HabitDetailScreenProps>) {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const wide = useWindowDimensions().width >= 768
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
  const today = useMemo(() => new Date(), [])
  const todayStr = formatAPIDate(today)
  const dateStr = date ?? formatAPIDate(today)
  const selectedDate = useMemo(() => parseAPIDate(dateStr), [dateStr])
  const detailQuery = useHabitDetail(habitId)
  const logsQuery = useHabitLogs(habitId)
  const metricsQuery = useHabitMetrics(habitId)
  const habitsQuery = useHabits({
    dateFrom: dateStr,
    dateTo: dateStr,
    includeOverdue: dateStr === todayStr,
    includeGeneral: true,
  })
  const { profile } = useProfile()
  const logHabit = useLogHabit()
  const updateHabit = useUpdateHabit()
  const updateChecklist = useUpdateChecklist()
  const deleteHabit = useDeleteHabit()
  const { showError } = useAppToast()
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmAction>(null)
  const [childToDelete, setChildToDelete] = useState<string | null>(null)
  const habit = useMemo(() => detailQuery.data ? normalizeHabit(detailQuery.data, habitsQuery.data?.habitsById.get(habitId), dateStr) : null, [dateStr, detailQuery.data, habitId, habitsQuery.data])
  const relationshipFieldsLoaded = habitsQuery.data?.topLevelHabits.some((item) => item.id === habitId) ?? false
  const logs = logsQuery.data ?? []
  const logged = logs.some((entry) => entry.date === dateStr && entry.value > 0)
  const completed = habit ? isHabitCompletedOnDate(habit, logs, dateStr) : false
  const summary = habit ? computeHabitFrequencyLabel(habit, t) : ''
  const strip = habit ? buildHabitStripModel(habit, logs, today, profile?.language ?? i18n.language, profile?.weekStartDay ?? 0) : null
  const slipping = habit ? isHabitSlipping(habit, metricsQuery.data ?? null, logs, today) : false
  const hasPro = profile?.hasProAccess ?? false
  const atLimit = !!profile && profile.aiMessagesUsed >= profile.aiMessagesLimit
  const back = useCallback(() => {
    if (parentId) router.push({ pathname: '/habits/[id]', params: { id: parentId, date: dateStr, ...(fromToday ? { from: 'today' } : {}) } })
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
  const patch = (next: Parameters<typeof buildHabitDetailUpdateRequest>[1]) => habit
    ? runWrite(
        () => updateHabit.mutateAsync({ habitId, data: buildHabitDetailUpdateRequest(habit, next) }),
        t('habits.detail.updateError'),
      )
    : Promise.resolve(false)
  const writeLog = (targetHabitId: string, intent: 'log' | 'unlog') => runWrite(
    () => logHabit.mutateAsync({ habitId: targetHabitId, date: dateStr, intent }),
    t('habits.detail.logError'),
  )
  const setItems = (items: ChecklistItem[]) => runWrite(
    () => updateChecklist.mutateAsync({ habitId, items }),
    t('habits.detail.checklistError'),
  )
  const toggleItem = async (index: number) => {
    if (!habit) return
    const items = habit.checklistItems.map((item, itemIndex) => itemIndex === index ? { ...item, isChecked: !item.isChecked } : item)
    if (await setItems(items) && items.length > 0 && items.every((item) => item.isChecked) && !logged) setConfirm('log')
  }
  const confirmLog = async () => {
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
  const askAstra = async () => {
    const key = habit?.checklistItems.length ? 'habits.detail.askAstraSeedSubHabits' : 'habits.detail.askAstraSeedDefault'
    await AsyncStorage.setItem('orbit-chat-draft', t(key, { title: habit?.title ?? '' }))
    router.push('/chat')
  }

  const appBar = <AppBar back title={t('habits.detail.screenTitle')} onBack={back} />
  if (detailQuery.isLoading) return <FlowShell nav={false} header={appBar}><Skeleton variant="habit-row" label={t('habits.detail.loading')} /><Skeleton variant="stat-tile" label={t('habits.detail.loading')} /><Skeleton variant="grid" rows={6} cols={7} cell={32} gap={4} label={t('habits.detail.loading')} /></FlowShell>
  if (detailQuery.isError || !habit || !detailQuery.data) return <FlowShell nav={false} header={appBar}><ErrorState message={t('habits.detail.loadError')} action={<PillButton variant="secondary" onClick={() => void detailQuery.refetch()}>{t('habits.detail.retry')}</PillButton>} /></FlowShell>

  const children = (normalizeHabitDetailForDrill(detailQuery.data, dateStr)
    .childrenByParent.get(habit.id) ?? [])
    .map((child) => buildHabitDetailChildDateModel(
      child,
      habitsQuery.data?.habitsById.get(child.id),
      dateStr,
      todayStr,
    ))
  return (
    <FlowShell nav={false} header={appBar}>
      <Header habit={habit} summary={summary} completed={completed} logged={logged} tokens={tokens} onPatch={patch} onLog={() => { void writeLog(habitId, logged ? 'unlog' : 'log') }} />
      <View style={wide ? styles.columns : styles.stack}>
      <View style={styles.column}>
      {strip ? <Surface backgroundColor={tokens.bgCard} borderColor={tokens.hairline}><View style={styles.sectionHeader}><SectionTitle color={tokens.fg1}>{t('habits.detail.lastThirtyDays')}</SectionTitle><Text style={[styles.muted, { color: tokens.fg3 }]}>{strip.days.filter((value) => value === 'done').length}/30</Text></View><ScrollView horizontal showsHorizontalScrollIndicator={false}><DayStrip scope="habit" days={strip.days} labels={strip.labels} label={t('habits.detail.lastThirtyDays')} size={16} words={{ done: t('habits.detail.doneWord'), missed: t('habits.detail.missedWord'), notScheduled: t('habits.detail.notScheduledWord') }} /></ScrollView></Surface> : null}
      <RescheduleBlock habit={habit} slipping={slipping} hasPro={hasPro} locale={profile?.language ?? i18n.language} tokens={tokens} />
      <Surface backgroundColor={tokens.bgCard} borderColor={tokens.hairline}><View style={styles.sectionHeading}><SectionTitle color={tokens.fg1}>{t('habits.detail.metrics')}</SectionTitle></View><Metrics visible={shouldShowHabitMetrics(habit)} loading={metricsQuery.isLoading} metrics={metricsQuery.data} tokens={tokens} /></Surface>
      <History habit={habit} logs={logsQuery.data} today={today} locale={profile?.language ?? i18n.language} weekStartsOn={profile?.weekStartDay ?? 0} tokens={tokens} />
      </View>
      <View style={styles.column}>
      <Surface backgroundColor={tokens.bgCard} borderColor={tokens.hairline}><View style={styles.sectionHeading}><SectionTitle color={tokens.fg1}>{t('habits.detail.checklist')}</SectionTitle>{shouldResetHabitChecklist(habit) ? <Text style={[styles.muted, { color: tokens.fg3 }]}>{t('habits.detail.resetRule')}</Text> : null}</View><HabitChecklist items={habit.checklistItems} interactive={!detailsOpen} editable={detailsOpen} onToggle={(index) => void toggleItem(index)} onItemsChange={(items) => { void setItems(items) }} onReset={() => { void setItems(habit.checklistItems.map((item) => ({ ...item, isChecked: false }))) }} onClear={() => setConfirm('clear')} /></Surface>
      <Surface backgroundColor={tokens.bgCard} borderColor={tokens.hairline}><View style={styles.sectionHeading}><SectionTitle color={tokens.fg1}>{t('habits.detail.inside')}</SectionTitle></View>{children.map(({ habit: child, readOnly }) => <HabitRow key={child.id} habit={child} selectedDate={selectedDate} readOnly={readOnly} depth={1} actions={{ onLog: () => { void writeLog(child.id, 'log') }, onUnlog: () => { void writeLog(child.id, 'unlog') }, onDetail: () => openChild(child.id), onDelete: () => { setChildToDelete(child.id); setConfirm('delete-child') } }} />)}<ListRow icon={<Plus size={24} color={tokens.fg1} />} title={t('habits.detail.addSubHabit')} description={!hasPro ? t('habits.detail.addSubHabitFree') : undefined} value={!hasPro ? t('habits.detail.proGate') : undefined} onClick={() => hasPro ? setCreateOpen(true) : router.push('/upgrade')} /></Surface>
      <Surface backgroundColor={tokens.bgCard} borderColor={tokens.hairline}><View style={styles.sectionHeading}><SectionTitle color={tokens.fg1}>{t('habits.detail.linkedGoals')}</SectionTitle></View>{habit.linkedGoals?.length ? habit.linkedGoals.map((goal) => <ListRow key={goal.id} icon={<Calendar size={24} color={tokens.fg1} />} title={goal.title} onClick={() => router.push(`/goals/${goal.id}`)} />) : <Text style={[styles.muted, { color: tokens.fg3 }]}>{t('habits.detail.noLinkedGoals')}</Text>}</Surface>
      <Surface backgroundColor={tokens.bgCard} borderColor={tokens.hairline}><ListRow icon={<AstraGlyph size={24} />} title={t('habits.detail.askAstra')} description={atLimit ? t('habits.detail.askAstraLimit') : t(habit.checklistItems.length ? 'habits.detail.askAstraSubHabits' : 'habits.detail.askAstraDefault')} onClick={() => void askAstra()} /></Surface>
      </View>
      </View>
      <Surface backgroundColor={tokens.bgCard} borderColor={tokens.hairline}><Pressable accessibilityRole="button" accessibilityState={{ expanded: detailsOpen }} onPress={() => setDetailsOpen((value) => !value)} style={styles.disclosure}><View style={styles.disclosureTitle}><ListTree size={24} color={tokens.fg1} /><SectionTitle color={tokens.fg1}>{t('habits.detail.moreDetails')}</SectionTitle></View><ChevronDown size={24} color={tokens.fg3} style={{ transform: [{ rotate: detailsOpen ? '180deg' : '0deg' }] }} /></Pressable>{detailsOpen ? <View><ListRow title={t('habits.detail.schedule')} value={summary} onClick={() => setEditOpen(true)} /><ListRow title={t('habits.detail.time')} value={habit.dueTime ?? t('habits.detail.noValue')} onClick={() => setEditOpen(true)} /><ListRow title={t('habits.detail.description')} description={habit.description ?? t('habits.detail.noValue')} onClick={() => setEditOpen(true)} /><ListRow title={t('habits.detail.endDate')} value={habit.endDate ?? t('habits.detail.noValue')} onClick={() => setEditOpen(true)} /><ListRow title={t('habits.detail.slipAlert')} description={!hasPro ? t('habits.detail.slipAlertFree') : undefined} value={!hasPro ? t('habits.detail.proGate') : undefined} trailing={hasPro ? <Switch label={t('habits.detail.slipAlert')} checked={habit.slipAlertEnabled} onChange={(slipAlertEnabled) => { void patch({ slipAlertEnabled }) }} /> : undefined} onClick={!hasPro ? () => router.push('/upgrade') : undefined} /></View> : null}</Surface>
      <ListRow icon={<Calendar size={24} color={tokens.fg1} />} title={t('habits.detail.startedOn')} description={t('habits.detail.startDateNote')} value={formatLocaleDate(new Date(habit.createdAtUtc), profile?.language ?? i18n.language, { dateStyle: 'medium' })} readOnly />
      <ListRow icon={<Trash2 size={24} color={tokens.statusBad} />} title={t('habits.detail.delete')} danger onClick={() => setConfirm('delete')} />
      <EditHabitModal open={editOpen} onClose={() => setEditOpen(false)} habit={habit} relationshipFieldsLoaded={relationshipFieldsLoaded} />
      <CreateHabitModal open={createOpen} onClose={() => setCreateOpen(false)} initialDate={dateStr} parentHabit={habit} />
      <ConfirmSheet open={confirm === 'clear'} title={t('habits.checklistClearTitle')} message={t('habits.checklistClearMessage')} confirmLabel={t('habits.form.clearChecklist')} destructive onCancel={() => setConfirm(null)} onConfirm={() => { void setItems([]).then((saved) => { if (saved) setConfirm(null) }) }} />
      <ConfirmSheet open={confirm === 'log'} title={t('habits.checklistCompleteTitle')} message={t('habits.checklistCompleteMessage', { name: habit.title })} confirmLabel={t('habits.checklistCompleteConfirm')} onCancel={() => setConfirm(null)} onConfirm={() => { void confirmLog() }} />
      <ConfirmSheet open={confirm === 'delete'} title={t('habits.deleteConfirmTitle')} message={t('habits.deleteConfirmMessage')} confirmLabel={t('habits.deleteHabit')} destructive onCancel={() => setConfirm(null)} onConfirm={() => { void confirmDelete() }} />
      <ConfirmSheet open={confirm === 'delete-child'} title={t('habits.deleteConfirmTitle')} message={t('habits.deleteConfirmMessage')} confirmLabel={t('habits.deleteHabit')} destructive onCancel={() => { setConfirm(null); setChildToDelete(null) }} onConfirm={() => { void confirmChildDelete() }} />
    </FlowShell>
  )
}

const styles = StyleSheet.create({
  surface: { borderRadius: 20, borderWidth: 1, padding: 24, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  headerCopy: { flex: 1, minWidth: 0, gap: 4, paddingTop: 4 },
  title: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 24, lineHeight: 29 },
  titleInput: { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 24, lineHeight: 29, borderBottomWidth: 1, padding: 0 },
  muted: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20 },
  sectionTitle: { fontFamily: 'Geist_500Medium', fontSize: 18, lineHeight: 24 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  sectionHeading: { gap: 4 },
  historyActions: { flexDirection: 'row', gap: 8 },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 4 },
  tag: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  tagText: { fontFamily: 'RobotoMono_500Medium', fontSize: 12, letterSpacing: 0.7 },
  disclosure: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  disclosureTitle: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  proposedBlock: { gap: 16, padding: 16 },
  proposedTitle: { fontFamily: 'Geist_500Medium', fontSize: 16, lineHeight: 20 },
  proposedAction: { alignItems: 'flex-start' },
  stack: { gap: 24 },
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: 24 },
  column: { flex: 1, minWidth: 0, gap: 24 },
})
