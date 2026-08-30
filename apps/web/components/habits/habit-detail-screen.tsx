'use client'

import { useCallback, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
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
  shouldResetHabitChecklist,
  shouldShowHabitMetrics,
} from '@orbit/shared/utils'
import type { ChecklistItem, HabitDetail, NormalizedHabit } from '@orbit/shared/types/habit'
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
import { StatTile } from '@/components/ui/stat-tile'
import { Switch } from '@/components/ui/switch'
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, ListTree, Plus, Trash2 } from '@/components/ui/icons'
import { CreateHabitModal } from './create-habit-modal'
import { EditHabitModal } from './edit-habit-modal'
import { HabitChecklist } from './habit-checklist'
import { HabitEmojiSelector } from './habit-form-fields/habit-emoji-selector'
import { HabitLogButton } from './habit-log-button'
import { HabitRow } from './habit-row'
import { useHabitDetail, useHabitLogs, useHabitMetrics, useHabits } from '@/hooks/use-habit-queries'
import { useDeleteHabit, useLogHabit, useUpdateChecklist, useUpdateHabit } from '@/hooks/use-habits'
import { useProfile } from '@/hooks/use-profile'
import { useAppToast } from '@/hooks/use-app-toast'
import { useRescheduleSuggestion } from '@/hooks/use-reschedule-suggestion'

type ConfirmAction = 'clear' | 'delete' | 'log' | 'delete-child' | null

interface HabitDetailScreenProps {
  habitId: string
  date?: string | null
  fromToday?: boolean
  parentId?: string | null
}

function SectionTitle({ children }: Readonly<{ children: string }>) {
  return <h2 className="text-lg font-medium text-[var(--fg-1)]">{children}</h2>
}

function Surface({ children }: Readonly<{ children: React.ReactNode }>) {
  return <section className="rounded-[var(--r-card)] bg-[var(--bg-card)] p-6 shadow-[inset_0_0_0_1px_var(--hairline)]">{children}</section>
}

function buildNormalizedHabit(detail: NonNullable<ReturnType<typeof useHabitDetail>['data']>, fallback: NormalizedHabit | undefined, today: string): NormalizedHabit {
  const drilled = normalizeHabitDetailForDrill(detail, today).parent
  if (!fallback) return drilled
  return {
    ...fallback,
    ...drilled,
    tags: fallback.tags,
    linkedGoals: fallback.linkedGoals,
    slipAlertEnabled: fallback.slipAlertEnabled,
    flexibleTarget: fallback.flexibleTarget,
    flexibleCompleted: fallback.flexibleCompleted,
    instances: fallback.instances,
  }
}

function HabitHeader({ habit, completed, logged, summary, onRename, onEmoji, onLog }: Readonly<{
  habit: NormalizedHabit
  completed: boolean
  logged: boolean
  summary: string
  onRename: (title: string) => Promise<boolean>
  onEmoji: (emoji: string) => void
  onLog: () => void
}>) {
  const t = useTranslations('habits.detail')
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(habit.title)
  const save = async () => {
    const next = title.trim()
    if (!next || next === habit.title) {
      setTitle(habit.title)
      setEditing(false)
      return
    }
    if (await onRename(next)) setEditing(false)
  }
  return (
    <header className="flex items-start gap-4 px-4 pb-6 pt-2 sm:px-0">
      <HabitEmojiSelector selectedEmoji={habit.emoji ?? ''} onSelect={onEmoji} wellSize={76} />
      <div className="min-w-0 flex-1 pt-1">
        {editing ? (
          <input autoFocus value={title} maxLength={200} aria-label={t('rename')} onChange={(event) => setTitle(event.target.value)} onBlur={() => void save()} onKeyDown={(event) => { if (event.key === 'Enter') void save() }} className="w-full border-0 border-b border-[var(--hairline-strong)] bg-transparent font-[var(--font-display)] text-2xl font-semibold text-[var(--fg-1)] outline-none focus:border-[var(--primary)] focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2" />
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="block max-w-full border-0 bg-transparent p-0 text-left">
            <h1 className="truncate font-[var(--font-display)] text-2xl font-semibold text-[var(--fg-1)]">{habit.title}</h1>
          </button>
        )}
        <p className="mt-1 text-sm text-[var(--fg-3)]">{summary}</p>
        {habit.tags.length > 0 ? <div className="mt-3 flex flex-wrap gap-2">{habit.tags.map((tag) => <Badge key={tag.id} variant="outline">{tag.name}</Badge>)}</div> : null}
      </div>
      <HabitLogButton label={logged ? t('unlog', { title: habit.title }) : t('log', { title: habit.title })} completed={completed} logged={logged} progress={completed ? 1 : 0} onPress={onLog} />
    </header>
  )
}

function HistorySection({ habit, logs, today, locale, weekStartsOn }: Readonly<{
  habit: NormalizedHabit
  logs: ReturnType<typeof useHabitLogs>['data']
  today: Date
  locale: string
  weekStartsOn: 0 | 1
}>) {
  const t = useTranslations('habits.detail')
  const [month, setMonth] = useState(startOfMonth(today))
  const monthLoaded = isHabitHistoryMonthLoaded(month, today)
  const days = buildHabitHistoryMonth(habit, monthLoaded ? logs ?? [] : [], month, today, weekStartsOn)
  const monthLabel = formatLocaleDate(month, locale, { month: 'long', year: 'numeric' })
  const weekdayLabels = Array.from({ length: 7 }, (_, offset) => {
    const sundayIndex = (weekStartsOn + offset) % 7
    const base = new Date(2025, 0, 5 + sundayIndex)
    return base.toLocaleDateString(locale, { weekday: 'narrow' })
  })
  const words = { none: t('missedWord'), partial: t('missedWord'), full: t('doneWord'), notScheduled: t('notScheduledWord'), unavailable: t('unavailableWord'), future: t('futureWord'), of: t('ofWord'), today: t('todayWord'), selected: t('selectedWord'), readOnly: t('readOnlyWord') }
  return (
    <Surface>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div><SectionTitle>{t('history')}</SectionTitle><p className="mt-1 text-sm capitalize text-[var(--fg-3)]">{monthLabel}</p></div>
        <div className="flex items-center gap-2">
          <PillButton variant="ghost" size="sm" iconOnly label={t('previousMonth')} disabled={!canNavigateHabitHistoryBack(month, habit.createdAtUtc)} onClick={() => setMonth((value) => addMonths(value, -1))}><ChevronLeft size={20} /></PillButton>
          <PillButton variant="ghost" size="sm" iconOnly label={t('nextMonth')} disabled={!canNavigateHabitHistoryForward(month, today)} onClick={() => setMonth((value) => addMonths(value, 1))}><ChevronRight size={20} /></PillButton>
        </div>
      </div>
      <MonthGrid weekdayLabels={weekdayLabels} label={t('calendarLabel', { month: monthLabel })} gap={4}>
        {days.map((day) => <DayCell key={day.dateStr} day={day.day} outsideMonth={day.outsideMonth} today={day.today} outcome={day.outcome} label={day.loggedAt ? t('loggedAt', { time: new Date(day.loggedAt).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' }) }) : undefined} words={words} />)}
      </MonthGrid>
      {!monthLoaded ? <p className="mt-4 text-sm text-[var(--fg-3)]">{t('olderHistoryUnavailable')}</p> : null}
    </Surface>
  )
}

function MetricsSection({ visible, loading, metrics }: Readonly<{ visible: boolean; loading: boolean; metrics: ReturnType<typeof useHabitMetrics>['data'] }>) {
  const t = useTranslations('habits.detail')
  if (!visible) return <p className="text-sm text-[var(--fg-3)]">{t('noDataYet')}</p>
  if (loading) return <div className="grid grid-cols-2 gap-4"><Skeleton variant="stat-tile" label={t('loading')} /><Skeleton variant="stat-tile" label={t('loading')} /><Skeleton variant="stat-tile" label={t('loading')} /><Skeleton variant="stat-tile" label={t('loading')} /></div>
  if (!metrics || metrics.totalCompletions === 0) return <p className="text-sm text-[var(--fg-3)]">{t('noDataYet')}</p>
  return <div className="grid grid-cols-2 gap-4"><StatTile label={t('currentStreak')} value={String(metrics.currentStreak)} /><StatTile label={t('longestStreak')} value={String(metrics.longestStreak)} /><StatTile label={t('monthlyRate')} value={`${Math.round(metrics.monthlyCompletionRate)}%`} /><StatTile label={t('totalCompletions')} value={String(metrics.totalCompletions)} /></div>
}

function RescheduleBlock({ habit, slipping, hasProAccess, locale }: Readonly<{ habit: NormalizedHabit; slipping: boolean; hasProAccess: boolean; locale: string }>) {
  const t = useTranslations('habits.detail')
  const router = useRouter()
  const { showError } = useAppToast()
  const updateHabit = useUpdateHabit()
  const query = useRescheduleSuggestion({ habitId: habit.id, locale, enabled: slipping && hasProAccess })
  if (!slipping) return null
  if (!hasProAccess) return <ListRow title={t('slipping')} description={t('rescheduleFree')} value={t('proGate')} onClick={() => router.push('/upgrade')} />
  const accept = async () => {
    if (!query.suggestion) return
    try {
      await updateHabit.mutateAsync({ habitId: habit.id, data: buildRescheduleUpdateRequest(habit, query.suggestion) })
    } catch {
      showError(t('rescheduleWriteError'))
    }
  }
  return (
    <Proposed proposed scope="block" label={t('proposed')}>
      <div className="flex flex-col gap-4 p-4">
        <div><p className="font-medium text-[var(--fg-1)]">{t('slipping')}</p><p className="mt-1 text-sm text-[var(--fg-3)]">{query.suggestion?.rationale ?? (query.error ? t('rescheduleError') : t('rescheduleLoading'))}</p></div>
        <PillButton variant="secondary" size="sm" disabled={!query.suggestion} loading={updateHabit.isPending} onClick={() => void accept()}>{t('rescheduleAccept')}</PillButton>
      </div>
    </Proposed>
  )
}

// eslint-disable-next-line sonarjs/cognitive-complexity -- this route coordinator keeps mutually dependent query, mutation, confirmation, and navigation state together; each visual section is already extracted above (#352)
export function HabitDetailScreen({ habitId, date, fromToday = false, parentId }: Readonly<HabitDetailScreenProps>) {
  const t = useTranslations()
  const locale = useLocale()
  const router = useRouter()
  const today = useMemo(() => new Date(), [])
  const todayStr = formatAPIDate(today)
  const dateStr = date ?? formatAPIDate(today)
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

  const habit = useMemo(() => detailQuery.data ? buildNormalizedHabit(detailQuery.data, habitsQuery.data?.habitsById.get(habitId), dateStr) : null, [detailQuery.data, habitsQuery.data, habitId, dateStr])
  const logs = logsQuery.data ?? []
  const logged = logs.some((entry) => entry.date === dateStr && entry.value > 0)
  const completed = habit ? isHabitCompletedOnDate(habit, logs, dateStr) : false
  const summary = habit ? computeHabitFrequencyLabel(habit, t) : ''
  const strip = habit ? buildHabitStripModel(habit, logs, today, locale, profile?.weekStartDay ?? 0) : null
  const slipping = habit ? isHabitSlipping(habit, metricsQuery.data ?? null, logs, today) : false
  const hasProAccess = profile?.hasProAccess ?? false
  const atAstraLimit = !!profile && profile.aiMessagesUsed >= profile.aiMessagesLimit

  const goBack = useCallback(() => {
    if (parentId) router.push(`/habits/${parentId}?date=${dateStr}${fromToday ? '&from=today' : ''}`)
    else if (fromToday) router.back()
    else router.push(`/?date=${dateStr}`)
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
  const patchHabit = (patch: Parameters<typeof buildHabitDetailUpdateRequest>[1]) => habit
    ? runWrite(
        () => updateHabit.mutateAsync({ habitId: habit.id, data: buildHabitDetailUpdateRequest(habit, patch) }),
        t('habits.detail.updateError'),
      )
    : Promise.resolve(false)
  const writeLog = (targetHabitId: string) => runWrite(
    () => logHabit.mutateAsync({ habitId: targetHabitId, date: dateStr }),
    t('habits.detail.logError'),
  )
  const updateItems = (items: ChecklistItem[]) => runWrite(
    () => updateChecklist.mutateAsync({ habitId, items }),
    t('habits.detail.checklistError'),
  )
  const toggleChecklist = async (index: number) => {
    if (!habit) return
    const items = habit.checklistItems.map((item, itemIndex) => itemIndex === index ? { ...item, isChecked: !item.isChecked } : item)
    if (await updateItems(items) && items.length > 0 && items.every((item) => item.isChecked) && !logged) setConfirm('log')
  }
  const confirmLog = async () => {
    if (await writeLog(habitId)) setConfirm(null)
  }
  const confirmDelete = async () => {
    if (!await runWrite(() => deleteHabit.mutateAsync(habitId), t('habits.detail.deleteError'))) return
    setConfirm(null)
    router.push(`/?date=${dateStr}`)
  }
  const confirmChildDelete = async () => {
    if (!childToDelete) return
    if (!await runWrite(() => deleteHabit.mutateAsync(childToDelete), t('habits.detail.deleteError'))) return
    setConfirm(null)
    setChildToDelete(null)
  }
  const askAstra = () => {
    const seedKey = habit?.checklistItems.length ? 'habits.detail.askAstraSeedSubHabits' : 'habits.detail.askAstraSeedDefault'
    localStorage.setItem('orbit-chat-draft', t(seedKey, { title: habit?.title ?? '' }))
    router.push('/chat')
  }
  const openChild = (childId: string) => router.push(`/habits/${childId}?date=${dateStr}&parent=${habitId}${fromToday ? '&from=today' : ''}`)

  if (detailQuery.isLoading) return <FlowShell nav={false} mode="detail" header={<AppBar back title={t('habits.detail.screenTitle')} onBack={goBack} />}><div className="flex flex-col gap-4 p-4"><Skeleton variant="habit-row" label={t('habits.detail.loading')} /><Skeleton variant="stat-tile" label={t('habits.detail.loading')} /><Skeleton variant="grid" rows={6} cols={7} cell={32} gap={4} label={t('habits.detail.loading')} /></div></FlowShell>
  if (detailQuery.isError || !habit) return <FlowShell nav={false} mode="detail" header={<AppBar back title={t('habits.detail.screenTitle')} onBack={goBack} />}><ErrorState message={t('habits.detail.loadError')} action={<PillButton variant="secondary" onClick={() => void detailQuery.refetch()}>{t('habits.detail.retry')}</PillButton>} /></FlowShell>

  const children = (normalizeHabitDetailForDrill(detailQuery.data as HabitDetail, dateStr)
    .childrenByParent.get(habit.id) ?? [])
    .map((child) => buildHabitDetailChildDateModel(
      child,
      habitsQuery.data?.habitsById.get(child.id),
      dateStr,
      todayStr,
    ))

  return (
    <FlowShell nav={false} mode="detail" header={<AppBar back title={t('habits.detail.screenTitle')} onBack={goBack} />}>
      <HabitHeader habit={habit} completed={completed} logged={logged} summary={summary} onRename={(title) => patchHabit({ title })} onEmoji={(emoji) => { void patchHabit({ emoji }) }} onLog={() => { void writeLog(habitId) }} />
      <div className="grid gap-6 min-[900px]:grid-cols-2">
        <div className="flex flex-col gap-6">
          {strip ? <Surface><div className="mb-4 flex items-center justify-between"><SectionTitle>{t('habits.detail.lastThirtyDays')}</SectionTitle><span className="text-sm text-[var(--fg-3)]">{strip.days.filter((value) => value === 'done').length}/30</span></div><div className="overflow-x-auto pb-1"><DayStrip scope="habit" days={strip.days} labels={strip.labels} label={t('habits.detail.lastThirtyDays')} size={16} words={{ done: t('habits.detail.doneWord'), missed: t('habits.detail.missedWord'), notScheduled: t('habits.detail.notScheduledWord') }} /></div></Surface> : null}
          <RescheduleBlock habit={habit} slipping={slipping} hasProAccess={hasProAccess} locale={profile?.language ?? locale} />
          <Surface><div className="mb-4"><SectionTitle>{t('habits.detail.metrics')}</SectionTitle></div><MetricsSection visible={shouldShowHabitMetrics(habit)} loading={metricsQuery.isLoading} metrics={metricsQuery.data} /></Surface>
          <HistorySection habit={habit} logs={logsQuery.data} today={today} locale={profile?.language ?? locale} weekStartsOn={profile?.weekStartDay ?? 0} />
        </div>
        <div className="flex flex-col gap-6">
          <Surface><div className="mb-4 flex items-center justify-between"><div><SectionTitle>{t('habits.detail.checklist')}</SectionTitle>{shouldResetHabitChecklist(habit) ? <p className="mt-1 text-sm text-[var(--fg-3)]">{t('habits.detail.resetRule')}</p> : null}</div></div><HabitChecklist items={habit.checklistItems} interactive={!detailsOpen} editable={detailsOpen} onToggle={(index) => void toggleChecklist(index)} onItemsChange={(items) => { void updateItems(items) }} onReset={() => { void updateItems(habit.checklistItems.map((item) => ({ ...item, isChecked: false }))) }} onClear={() => setConfirm('clear')} /></Surface>
          <Surface><div className="mb-3"><SectionTitle>{t('habits.detail.inside')}</SectionTitle></div><div className="flex flex-col gap-2">{children.map(({ habit: child, completed, canLog, readOnly }) => <HabitRow key={child.id} habit={child} child depth={1} state={completed ? 'done' : 'empty'} canLog={canLog} readOnly={readOnly} actions={{ onLog: () => { void writeLog(child.id) }, onUnlog: () => { void writeLog(child.id) }, onDetail: () => openChild(child.id), onDelete: () => { setChildToDelete(child.id); setConfirm('delete-child') } }} />)}<ListRow icon={<Plus size={24} />} title={t('habits.detail.addSubHabit')} description={hasProAccess ? undefined : t('habits.detail.addSubHabitFree')} value={hasProAccess ? undefined : t('habits.detail.proGate')} onClick={() => hasProAccess ? setCreateOpen(true) : router.push('/upgrade')} /></div></Surface>
          <Surface><div className="mb-3"><SectionTitle>{t('habits.detail.linkedGoals')}</SectionTitle></div>{habit.linkedGoals?.length ? habit.linkedGoals.map((goal) => <ListRow key={goal.id} icon={<Calendar size={24} />} title={goal.title} onClick={() => router.push(`/goals/${goal.id}`)} />) : <p className="text-sm text-[var(--fg-3)]">{t('habits.detail.noLinkedGoals')}</p>}</Surface>
          <Surface><ListRow icon={<AstraGlyph size={24} />} title={t('habits.detail.askAstra')} description={atAstraLimit ? t('habits.detail.askAstraLimit') : t(habit.checklistItems.length ? 'habits.detail.askAstraSubHabits' : 'habits.detail.askAstraDefault')} onClick={askAstra} /></Surface>
        </div>
      </div>
      <div className="mt-6 flex flex-col gap-4">
        <Surface><button type="button" onClick={() => setDetailsOpen((value) => !value)} className="flex min-h-11 w-full items-center justify-between border-0 bg-transparent text-left"><span className="flex items-center gap-3 text-lg font-medium text-[var(--fg-1)]"><ListTree size={24} />{t('habits.detail.moreDetails')}</span><ChevronDown size={24} className={detailsOpen ? 'rotate-180' : ''} /></button>{detailsOpen ? <div className="mt-4 flex flex-col gap-1"><ListRow title={t('habits.detail.schedule')} value={summary} onClick={() => setEditOpen(true)} /><ListRow title={t('habits.detail.time')} value={habit.dueTime ?? t('habits.detail.noValue')} onClick={() => setEditOpen(true)} /><ListRow title={t('habits.detail.description')} description={habit.description ?? t('habits.detail.noValue')} onClick={() => setEditOpen(true)} /><ListRow title={t('habits.detail.reminders')} value={habit.reminderEnabled ? String(habit.reminderTimes.length + habit.scheduledReminders.length) : t('habits.detail.noValue')} onClick={() => setEditOpen(true)} /><ListRow title={t('habits.detail.endDate')} value={habit.endDate ?? t('habits.detail.noValue')} onClick={() => setEditOpen(true)} /><ListRow title={t('habits.detail.slipAlert')} description={!hasProAccess ? t('habits.detail.slipAlertFree') : undefined} value={!hasProAccess ? t('habits.detail.proGate') : undefined} trailing={hasProAccess ? <Switch label={t('habits.detail.slipAlert')} checked={habit.slipAlertEnabled} onChange={(slipAlertEnabled) => { void patchHabit({ slipAlertEnabled }) }} /> : undefined} onClick={!hasProAccess ? () => router.push('/upgrade') : undefined} /></div> : null}</Surface>
        <ListRow icon={<Calendar size={24} />} title={t('habits.detail.startedOn')} description={t('habits.detail.startDateNote')} value={formatLocaleDate(new Date(habit.createdAtUtc), profile?.language ?? locale, { dateStyle: 'medium' })} readOnly />
        <ListRow icon={<Trash2 size={24} />} title={t('habits.detail.delete')} danger onClick={() => setConfirm('delete')} />
      </div>
      <EditHabitModal open={editOpen} onOpenChange={setEditOpen} habit={habit} />
      <CreateHabitModal open={createOpen} onOpenChange={setCreateOpen} initialDate={dateStr} parentHabit={habit} />
      <ConfirmSheet open={confirm === 'clear'} title={t('habits.checklistClearTitle')} message={t('habits.checklistClearMessage')} confirmLabel={t('habits.form.clearChecklist')} destructive onCancel={() => setConfirm(null)} onConfirm={() => { void updateItems([]).then((saved) => { if (saved) setConfirm(null) }) }} />
      <ConfirmSheet open={confirm === 'log'} title={t('habits.checklistCompleteTitle')} message={t('habits.checklistCompleteMessage', { name: habit.title })} confirmLabel={t('habits.checklistCompleteConfirm')} onCancel={() => setConfirm(null)} onConfirm={() => { void confirmLog() }} />
      <ConfirmSheet open={confirm === 'delete'} title={t('habits.deleteConfirmTitle')} message={t('habits.deleteConfirmMessage')} confirmLabel={t('habits.deleteHabit')} destructive onCancel={() => setConfirm(null)} onConfirm={() => { void confirmDelete() }} />
      <ConfirmSheet open={confirm === 'delete-child'} title={t('habits.deleteConfirmTitle')} message={t('habits.deleteConfirmMessage')} confirmLabel={t('habits.deleteHabit')} destructive onCancel={() => { setConfirm(null); setChildToDelete(null) }} onConfirm={() => { void confirmChildDelete() }} />
    </FlowShell>
  )
}
