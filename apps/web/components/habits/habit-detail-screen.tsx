'use client'

import { PersonalText } from '@/components/ui/personal-text'
import { PersonalTextDetails } from '@/components/ui/personal-text-details'

import { ActionRow } from '@/components/ui/action-row'

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { addMonths, startOfMonth } from 'date-fns'
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
  computeHabitDayProgress,
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
  getTodayBoundary,
  hasAuthoritativeHabitRelationshipState,
  hasHabitScheduleOnDate,
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
import type { ChecklistItem, HabitDetail, HabitMetrics, NormalizedHabit, RescheduleSuggestion } from '@orbit/shared/types/habit'
import { ShellHeader } from '@/components/shell/shell-header'
import { AppBar } from '@/components/ui/app-bar'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { Badge } from '@/components/ui/badge'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { DayCell } from '@/components/dates/day-cell'
import { DayStrip } from '@/components/dates/day-strip'
import { ErrorState } from '@/components/ui/error-state'
import { ListRow } from '@/components/ui/list-row'
import { MonthGrid } from '@/components/dates/month-grid'
import { PillButton, PillLink } from '@/components/ui/pill-button'
import { Proposed } from '@/components/ui/proposed'
import { Skeleton } from '@/components/ui/skeleton'
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from '@/components/ui/icons'
import { DateRow } from '@/components/ui/date-row'
import { CreateHabitModal } from './create-habit-modal'
import { HabitDetailFields, HabitDetailSchedule } from './habit-detail-fields'
import { HabitChecklist } from './habit-checklist'
import { HabitEmojiSelector } from './habit-form-fields/habit-emoji-selector'
import { HabitLogButton } from './habit-log-button'
import { HabitRow } from './habit-row'
import { useHabitDetail, useHabitLogs, useHabitMetrics, useHabits } from '@/hooks/use-habit-queries'
import { useDeleteHabit, useLogHabit, useUpdateChecklist, useUpdateHabit } from '@/hooks/use-habits'
import { useProfile } from '@/hooks/use-profile'
import { useAppToast } from '@/hooks/use-app-toast'
import { useRescheduleSuggestion } from '@/hooks/use-reschedule-suggestion'
import { useIsWideDesktop } from '@/hooks/use-is-desktop'
import { useTimeFormat } from '@/hooks/use-time-format'
import { useAccountGeneration, useAccountScopedState, useResetOnAccountChange } from '@/hooks/use-session-reset'
import { useOffline } from '@/hooks/use-offline'
import { OfflineRefusal } from '@/components/ui/offline-refusal'
import { getAccountGeneration } from '@/lib/session-epoch'
import { useToday } from '@/app/(app)/today-provider'
import { useDocumentTitle } from '@/hooks/use-document-title'

type ConfirmAction = 'clear' | 'delete' | 'log' | 'delete-child' | null

function useSubHabitRefusal(isOnline: boolean) {
  const [visible, setVisible] = useAccountScopedState(false)
  useEffect(() => { if (isOnline) setVisible(false) }, [isOnline, setVisible])
  return { showCreateRefusal: visible && !isOnline, refuseSubHabitCreation: () => setVisible(true) }
}

function requestSubHabitCreation({ hasProAccess, isOnline, onUpgrade, onRefuse, onCreate }: Readonly<{
  hasProAccess: boolean
  isOnline: boolean
  onUpgrade: () => void
  onRefuse: () => void
  onCreate: () => void
}>) {
  if (!hasProAccess) { onUpgrade(); return }
  if (!isOnline) { onRefuse(); return }
  onCreate()
}

interface HabitDetailScreenProps {
  habitId: string
  date?: string | null
  fromToday?: boolean
  parentId?: string | null
}

const HabitHeadingFocusContext = createContext<RefObject<boolean> | null>(null)

function SectionTitle({ children }: Readonly<{ children: string }>) {
  return <h2 className="truncate text-sm font-medium text-[var(--fg-1)]">{children}</h2>
}

function Surface({ children }: Readonly<{ children: React.ReactNode }>) {
  return <section className="flex flex-col gap-2">{children}</section>
}

function CompletionBoundaryReason({ disabled, reason }: Readonly<{ disabled: boolean; reason?: string }>) {
  if (!disabled || !reason) return null
  return <p className="px-4 pb-4 text-sm text-[var(--fg-2)] sm:px-0">{reason}</p>
}

function LogDateError({ visible }: Readonly<{ visible: boolean }>) {
  const t = useTranslations()
  return <div role="status" aria-live="polite">{visible ? <p className="px-4 pb-4 text-sm text-[var(--status-bad-text)] sm:px-0">{t('habits.detail.logDateUnavailable')}</p> : null}</div>
}

function DayHabitsStatus({ reasonKey, onRetry }: Readonly<{ reasonKey: ReturnType<typeof getHabitDetailChildUnavailableReasonKey>; onRetry: () => void }>) {
  const t = useTranslations()
  if (reasonKey === 'calendar.dayCell.notScheduled') return null
  return <div className="flex flex-wrap items-center gap-3 py-3"><p className="text-sm text-[var(--fg-2)]">{t(reasonKey)}</p>{reasonKey === 'habits.detail.dayHabitsLoadError' ? <PillButton variant="ghost" size="sm" onClick={onRetry}>{t('habits.detail.retry')}</PillButton> : null}</div>
}

function UnscheduledChildReason({ reason, notScheduledReason }: Readonly<{ reason?: string; notScheduledReason: string }>) {
  if (reason !== notScheduledReason) return null
  return <p className="pb-2 text-right text-sm text-[var(--fg-2)]">{reason}</p>
}

function completionReasonForBoundary(boundary: ReturnType<typeof getTodayBoundary>, t: ReturnType<typeof useTranslations>): string | undefined {
  if (boundary === 'read-only') return t('habits.todayBoundary.readOnly')
  if (boundary === 'future') return t('habits.todayBoundary.future')
  return undefined
}

function HabitHeader({ habit, completed, logged, overdue, progress, summary, onRename, onEmoji, onLog, completionDisabled, completionReason }: Readonly<{
  habit: NormalizedHabit
  completed: boolean
  logged: boolean
  overdue: boolean
  progress?: number
  summary: string
  onRename: (title: string) => Promise<boolean>
  onEmoji: (emoji: string) => void
  onLog: () => void
  completionDisabled: boolean
  completionReason?: string
}>) {
  const t = useTranslations('habits.detail')
  const [editing, setEditing] = useAccountScopedState(false)
  const [descriptionOpen, setDescriptionOpen] = useAccountScopedState(false)
  const [title, setTitle] = useAccountScopedState(habit.title)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const pendingHeadingFocusRef = useContext(HabitHeadingFocusContext)
  useLayoutEffect(() => {
    const focusedHeader = document.activeElement?.matches('[data-shell-header] h1')
    if (focusedHeader || pendingHeadingFocusRef?.current) {
      if (pendingHeadingFocusRef) pendingHeadingFocusRef.current = false
      headingRef.current?.focus({ preventScroll: true })
    }
  }, [habit.id, pendingHeadingFocusRef])
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
    <header className="pt-2">
      <div data-habit-detail-header-row="" className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <HabitEmojiSelector selectedEmoji={habit.emoji ?? ''} onSelect={onEmoji} wellSize={76} />
          <div className="flex-1" />
          <PillButton variant="ghost" size="sm" iconOnly label={t('rename')} onClick={() => setEditing(true)}><Pencil size={20} /></PillButton>
          <HabitLogButton label={logged ? t('unlog', { title: habit.title }) : t('log', { title: habit.title })} completed={completed} logged={logged} status={overdue ? 'overdue' : 'empty'} progress={progress} onPress={onLog} disabled={completionDisabled} disabledReason={completionReason} />
        </div>
        <div className="min-w-0 w-full">
          {editing ? (
            <><h1 ref={headingRef} tabIndex={-1} className="sr-only">{habit.title}</h1><input autoFocus value={title} maxLength={200} aria-label={t('rename')} onChange={(event) => setTitle(event.target.value)} onBlur={() => void save()} onKeyDown={(event) => { if (event.key === 'Enter') void save() }} data-focus-perimeter="" className="w-full border-0 border-b-2 border-[var(--hairline-strong)] bg-transparent font-display text-[22px] font-medium tracking-[-0.02em] sm:text-[28px] text-[var(--fg-1)] outline-none focus-visible:border-[var(--primary)] forced-colors:border-[CanvasText] forced-colors:focus-visible:border-[Highlight]" /></>
          ) : (
            <h1 aria-label={habit.title} ref={headingRef} tabIndex={-1} style={{ outlineOffset: 2 }} className="orbit-focus-inset relative flow-root min-h-[32px] max-w-full font-display text-[22px] font-medium leading-[1.4] tracking-[-0.02em] sm:text-[28px] text-[var(--fg-1)]">
              <button type="button" aria-label={habit.title} onClick={() => setEditing(true)} className="orbit-habit-rename relative block min-h-[32px] min-w-[var(--touch-min)] w-full rounded-[12px] border-0 bg-transparent text-left">
                <PersonalText unclamped style={{ position: 'relative', pointerEvents: 'none' }}>{habit.title}</PersonalText>
              </button>
            </h1>
          )}
          {summary ? <p className="mt-1 truncate font-mono text-xs tabular-nums text-[var(--fg-3)]">{summary}</p> : null}
        </div>
      </div>
      {habit.tags.length > 0 ? <div data-habit-detail-tags="" className="pt-3"><div className="flex flex-wrap gap-2">{habit.tags.map((tag) => <div key={tag.id} className="min-w-0 max-w-full rounded-[8px] border border-[var(--hairline-strong)]"><PersonalTextDetails lines={1} textStyle={{ color: 'var(--fg-2)', fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500 }}>{tag.name}</PersonalTextDetails></div>)}</div></div> : null}
      {habit.description ? <div data-habit-detail-description="" className="pt-3"><button type="button" title={t('viewDescription')} aria-expanded={descriptionOpen} aria-controls="habit-description" onClick={() => setDescriptionOpen((open) => !open)} className="touch-target block w-full border-0 bg-transparent text-start text-sm text-[var(--fg-3)] transition-colors duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:text-[var(--fg-2)]"><span id="habit-description" className={`block ${descriptionOpen ? 'whitespace-pre-wrap break-words' : 'truncate'}`}>{habit.description}</span></button></div> : null}
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
  const { displayClock } = useTimeFormat()
  const monthLoaded = isHabitHistoryMonthLoaded(month, today)
  const days = buildHabitHistoryMonth(habit, monthLoaded ? logs ?? [] : [], month, today, weekStartsOn)
  const monthLabel = formatLocaleDate(month, locale, { month: 'long', year: 'numeric' })
  const weekdayLabels = formatWeekdayLabels(locale, weekStartsOn)
  const words = { none: t('missedWord'), partial: t('missedWord'), full: t('doneWord'), notScheduled: t('notScheduledWord'), of: t('ofWord'), today: t('todayWord'), readOnly: t('readOnlyWord') }
  const changeMonth = (offset: number) => {
    setMonth((value) => addMonths(value, offset))
  }
  return (
    <Surface>
      <div className="flex flex-col gap-2">
        <SectionTitle>{t('history')}</SectionTitle>
        <div className="flex items-center gap-2"><ActionRow>
          <PillButton variant="ghost" size="sm" iconOnly label={t('previousMonth')} disabled={!canNavigateHabitHistoryBack(month, habit.createdAtUtc)} onClick={() => changeMonth(-1)}><ChevronLeft size={20} /></PillButton>
          <p className="min-w-0 flex-1 text-center font-mono text-xs tabular-nums text-[var(--fg-3)]">{capitalizeFirstLetter(monthLabel)}</p>
          <PillButton variant="ghost" size="sm" iconOnly label={t('nextMonth')} disabled={!canNavigateHabitHistoryForward(month, today)} onClick={() => changeMonth(1)}><ChevronRight size={20} /></PillButton>
        </ActionRow></div>
      </div>
      <div><MonthGrid weekdayLabels={weekdayLabels} label={t('calendarLabel', { month: monthLabel })} gap={4}>
        {days.map((day) => {
          const dateLabel = formatLocaleDate(day.date, locale, { dateStyle: 'full' })
          const label = day.loggedAt
            ? t('loggedAt', {
                date: dateLabel,
                time: displayClock(day.loggedAt),
              })
            : dateLabel
          if (day.outcome === 'future' || day.outcome === 'unavailable') {
            const outcomeWord = day.outcome === 'future' ? t('futureWord') : t('unavailableWord')
            return (
              <span
                key={day.dateStr}
                role="img"
                aria-hidden={day.outsideMonth || undefined}
                aria-label={day.outsideMonth ? undefined : `${label}, ${outcomeWord}, ${t('readOnlyWord')}`}
                className="inline-flex min-h-[var(--month-grid-touch-min)] w-full items-center justify-center font-[var(--font-mono)] text-sm tabular-nums text-[var(--fg-3)]"
                style={{ opacity: day.outsideMonth ? 0 : 1 }}
              >
                {day.day}
              </span>
            )
          }
          return <DayCell key={day.dateStr} day={day.day} done={day.outcome === 'full' ? 1 : 0} scheduled={day.outcome === 'not-scheduled' ? 0 : 1} outsideMonth={day.outsideMonth} today={day.today} label={label} words={words} habitHistory />
        })}
      </MonthGrid></div>
    </Surface>
  )
}

function ReminderReadout({ habit }: Readonly<{ habit: NormalizedHabit }>) {
  const t = useTranslations()
  const { displayTime } = useTimeFormat()
  const rows = buildHabitDetailReminderRows(habit, t)
  if (!rows.length) return null
  return <section data-habit-detail-reminders="" className="flex flex-col gap-1"><p className="text-sm font-medium text-[var(--fg-2)]">{t('habits.detail.reminders')}</p>{rows.map((row) => <div key={row.key} className="flex min-h-8 items-center gap-2"><p className="font-mono text-sm tabular-nums text-[var(--fg-1)]">{displayTime(row.time)}</p><p className="text-sm text-[var(--fg-3)]">{row.label}</p></div>)}</section>
}

function AskAstraRow({ habit }: Readonly<{ habit: NormalizedHabit }>) {
  const t = useTranslations()
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
    <ListRow placement="column" icon={<AstraGlyph size={24} color="var(--fg-1)" />} title={t('habits.detail.askAstra')} titleTranslate="no" onClick={openConversation} />
  )
}

function MetricsSection({ visible, loading, error, metrics, isBadHabit }: Readonly<{ visible: boolean; loading: boolean; error: boolean; metrics: ReturnType<typeof useHabitMetrics>['data']; isBadHabit: boolean }>) {
  const t = useTranslations('habits.detail')
  const common = useTranslations('common')
  if (!visible) return null
  if (!loading && (error || !metrics || metrics.totalCompletions === 0)) return <p role="status" className="py-4 text-center text-sm text-[var(--fg-3)]">{t('noDataYet')}</p>
  const values = [
    { label: t(isBadHabit ? 'daysFree' : 'currentStreak'), value: String(metrics?.currentStreak ?? '') },
    { label: t('longestStreak'), value: String(metrics?.longestStreak ?? '') },
    { label: t('monthlyRate'), value: metrics ? `${Math.round(metrics.monthlyCompletionRate)}%` : '' },
  ]
  return (
    <div data-habit-detail-stat-card="" role={loading ? 'status' : undefined} aria-busy={loading || undefined} className="rounded-[var(--r-card)] bg-[var(--bg-card)] p-6" style={{ boxShadow: 'inset 0 0 0 1px var(--hairline-ghost)' }}>
      {values.map((item) => (
        <div key={item.label} data-habit-detail-stat-row="" className="flex min-h-12 flex-wrap items-baseline gap-2 py-2">
          <span data-habit-detail-stat-label="" className="min-w-min flex-auto whitespace-normal text-sm leading-5 text-[var(--fg-2)]">{item.label}</span>
          <span className="ms-auto grid max-w-full shrink-0 text-end font-[family-name:var(--font-display)] text-[22px] font-semibold leading-[1.3] text-[var(--fg-1)] tabular-nums">
            <span className="col-start-1 row-start-1 inline-flex items-baseline justify-end">
              <span aria-hidden="true" className="invisible w-0">0</span>
              <span data-habit-detail-stat-value="">{loading ? <span className="text-sm leading-[1.3]">{common('loading')}</span> : item.value}</span>
            </span>
            <span aria-hidden="true" className="invisible col-start-1 row-start-1 text-sm leading-[1.3]">{common('loading')}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

function useHabitRescue({ habitId, isBadHabit, slipping, overdue, hasProAccess, locale }: Readonly<{ habitId: string; isBadHabit: boolean; slipping: boolean; overdue: boolean; hasProAccess: boolean; locale: string }>) {
  const eligible = !isBadHabit && slipping && overdue
  const query = useRescheduleSuggestion({ habitId, locale, enabled: eligible && hasProAccess })
  return { query, open: eligible && extractBackendErrorCode(query.error) !== 'HABIT_NOT_OVERDUE' }
}

function SlippingLine({ visible, metrics, createdAtUtc, today, timeZone }: Readonly<{ visible: boolean; metrics: HabitMetrics | undefined; createdAtUtc: string; today: Date; timeZone: string | null | undefined }>) {
  const t = useTranslations()
  if (!visible || !metrics) return null
  return <p className="text-pretty text-sm leading-[1.55] text-[var(--fg-2)]">{t('habits.detail.slippingLine', { days: getHabitDaysWithoutLog(metrics, createdAtUtc, today, timeZone), streak: metrics.currentStreak, limit: HABIT_SLIPPING_RATE_LIMIT })}</p>
}

const rescueCardClass = 'flex flex-col gap-3 rounded-[var(--r-card)] bg-[var(--bg-card)] p-6 shadow-[inset_0_0_0_1px_var(--hairline-ghost)]'

function renderRescueProposalValues(suggestion: RescheduleSuggestion, labels: ReturnType<typeof buildRescheduleProposalLabels>, finePrint: string) {
  return <>
          <div className="flex flex-col gap-1">
            <p data-testid="rescue-proposed-schedule" className="font-[var(--font-display)] text-[20px] font-medium tabular-nums">{labels.dateLabel}{labels.timeLabel ? ` · ${labels.timeLabel}` : ''}</p>
            {labels.scheduleLabel ? <p className="text-sm text-[var(--fg-2)]">{labels.scheduleLabel}</p> : null}
          </div>
          <p className="text-sm leading-[1.55] text-[var(--fg-2)]">{suggestion.rationale}</p>
          <p className="text-xs text-[var(--fg-3)]">{finePrint}</p>
  </>
}

function RescheduleBlock({ habit, rescue: { query, open }, hasProAccess, locale, today, scheduleEditing, returnFocus }: Readonly<{ habit: NormalizedHabit; rescue: ReturnType<typeof useHabitRescue>; hasProAccess: boolean; locale: string; today: Date; scheduleEditing: boolean; returnFocus: () => void }>) {
  const t = useTranslations()
  const { showError } = useAppToast()
  const { displayTime } = useTimeFormat()
  const updateHabit = useUpdateHabit()
  const wideDesktop = useIsWideDesktop()
  const actionVariant = scheduleEditing ? 'ghost' : wideDesktop ? 'secondary' : 'primary'
  const [dismissed, setDismissed] = useAccountScopedState(false)
  const cardRef = useRef<HTMLDivElement>(null)
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
    const focusInCard = cardRef.current?.contains(document.activeElement) ?? false
    setDismissed(true)
    if (focusInCard) returnFocus()
  }
  const notNow = <PillButton variant="ghost" size="sm" disabled={updateHabit.isPending} onClick={close}>{t('habits.reschedule.dismiss')}</PillButton>
  if (!hasProAccess) {
    return (
      <div ref={cardRef} className={rescueCardClass}>
        <div className="flex items-center gap-2"><AstraGlyph size={20} color="var(--fg-1)" /><Badge>{t('habits.detail.proGate')}</Badge></div>
        <p className="text-sm leading-[1.55] text-[var(--fg-2)]">{t('habits.reschedule.freePrompt')}</p>
        <div className="flex flex-wrap gap-2"><ActionRow>
          {notNow}
          <PillLink variant={actionVariant} size="sm" href="/upgrade">{t('habits.reschedule.upgrade')}</PillLink>
        </ActionRow></div>
      </div>
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
      <div ref={cardRef} className={rescueCardClass}>
        <div role="status" className="flex flex-col gap-3">{suggestion ? renderRescueProposalValues(suggestion, buildRescheduleProposalLabels(suggestion, { locale, today, translate: t, formatTime: displayTime }), t('habits.detail.rescheduleFinePrint')) : <>
          <p className="text-sm text-[var(--fg-3)]">{query.error ? t('habits.detail.rescheduleError') : t('habits.detail.rescheduleLoading')}</p>
        </>}</div>
        <div className="flex flex-wrap gap-2"><ActionRow>
          {notNow}
          {suggestion ? <PillButton variant={actionVariant} size="sm" loading={updateHabit.isPending} onClick={() => void accept(suggestion)}>{t('habits.detail.rescheduleAccept')}</PillButton> : query.error ? <PillButton variant="ghost" size="sm" onClick={() => void query.refetch()}>{t('habits.detail.retry')}</PillButton> : null}
        </ActionRow></div>
      </div>
    </Proposed>
  )
}

function HabitDetailNavigation({ parentId, onBack, titleIsHeading = false }: Readonly<{ parentId?: string | null; onBack: () => void; titleIsHeading?: boolean }>) {
  const t = useTranslations()
  const pendingHeadingFocusRef = useContext(HabitHeadingFocusContext)
  const titleRef = useCallback((heading: HTMLHeadingElement | null) => {
    if (!heading) return
    if (pendingHeadingFocusRef?.current) {
      pendingHeadingFocusRef.current = false
      heading.focus({ preventScroll: true })
    }
    return () => {
      if (pendingHeadingFocusRef && document.activeElement === heading) pendingHeadingFocusRef.current = true
    }
  }, [pendingHeadingFocusRef])
  return <AppBar title={t('habits.detail.screenTitle')} titleRef={titleRef} titleIsHeading={titleIsHeading} onBack={onBack}
    backLabel={t(parentId ? 'common.backToParentHabit' : 'common.backToToday')} />
}

function HabitDetailFrame({ header, children }: Readonly<{ header: React.ReactNode; children: React.ReactNode }>) {
  return <>
    <ShellHeader>{header}</ShellHeader>
    <div data-habit-detail-content="" className="flex min-h-full w-full max-w-[652px] flex-col gap-6 px-4 pt-6">{children}</div>
  </>
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

export function HabitDetailScreen(props: Readonly<HabitDetailScreenProps>) {
  const pendingHeadingFocusRef = useRef(false)
  return <HabitHeadingFocusContext value={pendingHeadingFocusRef}><HabitDetailProfile {...props} /></HabitHeadingFocusContext>
}

function HabitDetailProfile({ habitId, date, fromToday = false, parentId }: Readonly<HabitDetailScreenProps>) {
  const t = useTranslations()
  const router = useRouter()
  const { profile, isError, refetch } = useProfile()
  useDocumentTitle(profile ? null : t('habits.detail.screenTitle'), habitId)
  if (!profile) {
    return <HabitDetailFrame header={<HabitDetailNavigation parentId={parentId} titleIsHeading onBack={() => {
      if (parentId || fromToday) router.back()
      else router.push(date ? `/?date=${date}` : '/')
    }} />}>
      {isError
        ? <ErrorState message={t('common.error')} action={<PillButton variant="secondary" onClick={() => void refetch()}>{t('habits.detail.retry')}</PillButton>} />
        : <div role="status" aria-busy="true" aria-label={t('profile.loading')} className="flex flex-col gap-4 p-4">
            <Skeleton variant="habit-row" grouped />
            <Skeleton variant="stat-tile" grouped />
            <Skeleton variant="grid" rows={6} cols={7} cell={32} gap={4} grouped />
          </div>}
    </HabitDetailFrame>
  }
  return <HabitDetailContent habitId={habitId} date={date} fromToday={fromToday} parentId={parentId} profile={profile} />
}

function HabitDetailContent({ habitId, date, fromToday = false, parentId, profile }: Readonly<HabitDetailScreenProps & { profile: NonNullable<ReturnType<typeof useProfile>['profile']> }>) {
  const t = useTranslations()
  const { isOnline } = useOffline()
  const locale = useLocale()
  const { displayTime } = useTimeFormat()
  const router = useRouter()
  const todayStr = useToday(profile.timeZone)
  const today = useMemo(() => parseAPIDate(todayStr), [todayStr])
  const dateStr = date ?? todayStr
  const detailQuery = useHabitDetail(habitId)
  const logsQuery = useHabitLogs(habitId)
  const metricsQuery = useHabitMetrics(habitId)
  const habitsQuery = useHabits({
    dateFrom: dateStr,
    dateTo: dateStr,
    includeOverdue: dateStr === todayStr,
    includeGeneral: true,
  }, undefined, { completeDay: true })
  const todayHabitsQuery = useHabits({
    dateFrom: todayStr,
    dateTo: todayStr,
    includeOverdue: true,
    includeGeneral: true,
  }, undefined, { completeDay: true })
  const allHabitsQuery = useHabits({})
  const logHabit = useLogHabit()
  const updateHabit = useUpdateHabit()
  const detailAccountGeneration = useAccountGeneration()
  const detailWrites = useDetailWrites(habitId, detailAccountGeneration)
  const updateChecklist = useUpdateChecklist()
  const deleteHabit = useDeleteHabit()
  const { showError } = useAppToast()
  const [scheduleOpen, setScheduleOpen] = useAccountScopedState(false)
  const [detailsOpen, setDetailsOpen] = useAccountScopedState(false)
  const [createOpen, setCreateOpen] = useAccountScopedState(false)
  const { showCreateRefusal, refuseSubHabitCreation } = useSubHabitRefusal(isOnline)
  const [confirm, setConfirm] = useAccountScopedState<ConfirmAction>(null)
  const [pendingDateLog, setPendingDateLog] = useAccountScopedState<{ habitId: string; intent: 'log' | 'unlog'; date: string; name: string; permanent: boolean } | null>(null)
  const [invalidLogDate, setInvalidLogDate] = useAccountScopedState<{ date: string; habitId: string } | null>(null)
  const [childToDelete, setChildToDelete] = useAccountScopedState<string | null>(null)
  const pendingToggleKeysRef = useRef(new Set<string>())
  const stripRef = useRef<HTMLElement>(null)
  useResetOnAccountChange(() => pendingToggleKeysRef.current.clear())

  const habit = useMemo(() => {
    if (!detailQuery.data) return null
    const merged = mergeHabitDetailWithScopedHabit(detailQuery.data, allHabitsQuery.data?.habitsById.get(habitId), dateStr, habitsQuery.data?.habitsById.get(habitId))
    return parentId ? { ...merged, parentId } : merged
  }, [allHabitsQuery.data, detailQuery.data, habitId, dateStr, habitsQuery.data, parentId])
  useDocumentTitle(detailQuery.isLoading || allHabitsQuery.isLoading ? t('habits.detail.screenTitle') : habit?.title ?? t('habits.detail.screenTitle'), habitId)
  const relationshipControlsAvailable = detailQuery.data ? hasAuthoritativeHabitRelationshipState(detailQuery.data, allHabitsQuery.data?.habitsById.get(habitId), habitsQuery.data?.habitsById.get(habitId)) : false
  const logs = logsQuery.data ?? []
  const logged = logs.some((entry) => entry.date === dateStr && entry.value > 0)
  const completed = habit ? isHabitCompletedOnDate(habit, logs, dateStr) : false
  const summary = habit ? computeHabitFrequencyLabel(habit, t) : null
  const strip = habit ? buildHabitStripModel(habit, logs, today, locale, profile.weekStartDay) : null
  const slipping = habit ? isHabitSlipping(habit, metricsQuery.data ?? null, logs, today, profile.timeZone) : false
  const overdue = todayHabitsQuery.data?.habitsById.get(habitId)?.isOverdue === true
  const hasProAccess = profile.hasProAccess
  const language = profile.language ?? locale
  const rescue = useHabitRescue({ habitId, isBadHabit: habit?.isBadHabit === true, slipping, overdue, hasProAccess, locale: language })
  const dueTime = displayTime(habit?.dueTime)
  const headerSummary = buildHabitDetailHeaderSummary(summary, habit?.dueTime ?? null, dueTime)
  const boundary = getTodayBoundary(dateStr, todayStr)
  const completionDisabled = isHabitDetailCompletionDisabled(habit, dateStr, todayStr)
  const completionReason = completionReasonForBoundary(boundary, t)

  const goBack = useCallback(() => {
    if (parentId) router.back()
    else if (fromToday) router.back()
    else router.push(`/?date=${dateStr}`)
  }, [dateStr, fromToday, parentId, router])
  const runWrite = useCallback(async (write: () => Promise<unknown>, errorMessage: string, reportError = true): Promise<boolean> => {
    const accountGeneration = getAccountGeneration()
    try {
      await write()
      return getAccountGeneration() === accountGeneration
    } catch {
      if (reportError && getAccountGeneration() === accountGeneration) showError(errorMessage)
      return false
    }
  }, [showError])
  const patchHabit = (patch: Parameters<typeof buildHabitDetailUpdateRequest>[1]) => {
    if (!habit) return Promise.resolve(false)
    return detailWrites.save(habit, patch, (request) => runWrite(() => updateHabit.mutateAsync({ habitId: habit.id, data: request }), t('habits.detail.updateError')))
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
    const toggleKey = `${targetHabitId}:${dateStr}`
    const pendingToggleKeys = pendingToggleKeysRef.current
    if (pendingToggleKeys.has(toggleKey)) return false

    pendingToggleKeys.add(toggleKey)
    try {
      return await runWrite(
        () => logHabit.mutateAsync({ habitId: targetHabitId, date: dateStr, intent }),
        t('habits.detail.logError'),
        false,
      )
    } finally {
      pendingToggleKeys.delete(toggleKey)
    }
  }
  const updateItems = (items: ChecklistItem[]) => runWrite(
    () => updateChecklist.mutateAsync({ habitId, items }),
    t('habits.detail.checklistError'),
  )
  const toggleChecklist = async (index: number) => {
    if (!habit) return
    const items = habit.checklistItems.map((item, itemIndex) => itemIndex === index ? { ...item, isChecked: !item.isChecked } : item)
    if (await updateItems(items) && items.length > 0 && items.every((item) => item.isChecked) && !logged && !completionDisabled) setConfirm('log')
  }
  const confirmLog = async () => {
    if (completionDisabled) { setConfirm(null); return }
    if (await writeLog(habitId, 'log')) setConfirm(null)
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
  const openChild = (childId: string) => router.push(`/habits/${childId}?date=${dateStr}&parent=${habitId}${fromToday ? '&from=today' : ''}`)
  const retryFailedQueries = () => {
    if (detailQuery.isError || !detailQuery.data) void detailQuery.refetch()
    if (allHabitsQuery.isError) void allHabitsQuery.refetch()
  }
  const childUnavailableReasonKey = getHabitDetailChildUnavailableReasonKey(
    habitsQuery.isError, habitsQuery.isLoading, !!habitsQuery.data,
  )
  const childUnavailableReason = t(childUnavailableReasonKey)

  function openSubHabitCreation() {
    requestSubHabitCreation({
      hasProAccess,
      isOnline,
      onUpgrade: () => router.push('/upgrade'),
      onRefuse: refuseSubHabitCreation,
      onCreate: () => setCreateOpen(true),
    })
  }

  if (detailQuery.isLoading || allHabitsQuery.isLoading) return <HabitDetailFrame header={<HabitDetailNavigation parentId={parentId} titleIsHeading onBack={goBack} />}><div className="flex flex-col gap-4 p-4"><Skeleton variant="habit-row" label={t('habits.detail.loading')} /><Skeleton variant="stat-tile" label={t('habits.detail.loading')} /><Skeleton variant="grid" rows={6} cols={7} cell={32} gap={4} label={t('habits.detail.loading')} /></div></HabitDetailFrame>
  if (detailQuery.isError || allHabitsQuery.isError || !habit) return <HabitDetailFrame header={<HabitDetailNavigation parentId={parentId} titleIsHeading onBack={goBack} />}><ErrorState message={t('habits.detail.loadError')} action={<PillButton variant="secondary" onClick={retryFailedQueries}>{t('habits.detail.retry')}</PillButton>} /></HabitDetailFrame>

  const children = (normalizeHabitDetailForDrill(detailQuery.data as HabitDetail, dateStr)
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
  const childProgress = computeHabitDayProgress(
    children.filter((child) => !child.completionStatusUnavailable).map((child) => child.habit),
    (child) => hasHabitScheduleOnDate(child, dateStr),
  )
  const headerProgress = childProgress.total > 0
    ? childProgress.done / childProgress.total * 100
    : undefined

  const subHabitCreation = <div className={showCreateRefusal ? 'flex flex-col gap-3' : undefined}><ListRow placement="column" icon={<Plus size={24} />} title={t('habits.detail.addSubHabit')} chevron={false} trailing={hasProAccess ? undefined : <Badge>{t('habits.detail.proGate')}</Badge>} onClick={openSubHabitCreation} /><div aria-live="polite" aria-atomic="true">{showCreateRefusal ? <OfflineRefusal icon="create" embedded title={t('offline.create.title')} reason={t('offline.create.reason')} /> : null}</div></div>

  return (
    <HabitDetailFrame header={<HabitDetailNavigation parentId={parentId} onBack={goBack} />}>
      <div>
        <HabitHeader habit={habit} completed={completed} logged={logged} overdue={habitsQuery.data?.habitsById.get(habitId)?.isOverdue ?? habit.isOverdue} progress={headerProgress} summary={headerSummary} onRename={(title) => patchHabit({ title })} onEmoji={(emoji) => { void patchHabit({ emoji }) }} onLog={() => { void writeLog(habitId, logged ? 'unlog' : 'log') }} completionDisabled={completionDisabled} completionReason={completionReason} />
        <LogDateError visible={invalidLogDate?.date === dateStr && invalidLogDate.habitId === habitId} />
        <CompletionBoundaryReason disabled={completionDisabled} reason={completionReason} />
      </div>
      {strip ? <section ref={stripRef} tabIndex={-1} className="habit-detail-strip flex flex-col gap-2" style={{ containerType: 'inline-size' }}><p className="text-xs text-[var(--fg-3)]">{t('habits.detail.lastThirtyDays')}</p><DayStrip scope="habit" days={strip.days} labels={strip.labels} label={t('habits.detail.lastThirtyDays')} size={16} words={{ done: t('habits.detail.doneWord'), missed: t('habits.detail.missedWord'), notScheduled: t('habits.detail.notScheduledWord') }} /><SlippingLine visible={rescue.open} metrics={metricsQuery.data} createdAtUtc={habit.createdAtUtc} today={today} timeZone={profile.timeZone} /></section> : null}
      <RescheduleBlock key={habit.id} habit={habit} rescue={rescue} hasProAccess={hasProAccess} locale={language} today={today} scheduleEditing={scheduleOpen} returnFocus={() => stripRef.current?.focus()} />
      <DetailChecklist editing={detailsOpen} items={habit.checklistItems} interactive onToggle={(index) => void toggleChecklist(index)} onItemsChange={(items) => { void updateItems(items) }} onReset={() => { void updateItems(habit.checklistItems.map((item) => ({ ...item, isChecked: false }))) }} onClear={() => setConfirm('clear')} />
      <MetricsSection visible={shouldShowHabitMetrics(habit)} loading={metricsQuery.isLoading} error={metricsQuery.isError} metrics={metricsQuery.data} isBadHabit={habit.isBadHabit} />
      <ReminderReadout habit={habit} />
      {children.length > 0 ? <Surface>
        <SectionTitle>{t('habits.detail.inside')}</SectionTitle>
        <DayHabitsStatus reasonKey={childUnavailableReasonKey} onRetry={() => { void habitsQuery.refetch() }} />
        <div data-testid="detail-children" aria-busy={habitsQuery.isLoading} className="flex flex-col overflow-hidden rounded-[var(--r-card)] bg-[var(--bg-card)] shadow-[inset_0_0_0_1px_var(--hairline-ghost)]">{children.map(({ habit: child, completed: childCompleted, canLog, completionReadOnly, completionReason: childCompletionReason, completionStatusUnavailable }) => <div key={child.id}><HabitRow habit={child} child depth={1} state={childCompleted ? 'done' : 'empty'} canLog={canLog} completionReadOnly={completionReadOnly} completionReason={childCompletionReason} completionStatusUnavailable={completionStatusUnavailable} actions={{ onLog: () => { void writeLog(child.id, 'log') }, onUnlog: () => { void writeLog(child.id, 'unlog') }, onDetail: () => openChild(child.id), onDelete: () => { setChildToDelete(child.id); setConfirm('delete-child') } }} /><LogDateError visible={invalidLogDate?.date === dateStr && invalidLogDate.habitId === child.id} /><UnscheduledChildReason reason={childCompletionReason} notScheduledReason={t('calendar.dayCell.notScheduled')} /></div>)}</div>
        {subHabitCreation}
      </Surface> : subHabitCreation}
      <HistorySection habit={habit} logs={logsQuery.data} today={today} locale={language} weekStartsOn={profile.weekStartDay} />
      <AskAstraRow habit={habit} />
      <HabitDetailSchedule habit={habit} summary={summary ?? ''} open={scheduleOpen} onToggle={() => setScheduleOpen((value) => !value)} onCancel={() => setScheduleOpen(false)} onSave={(patch) => { void patchHabit(patch).then((saved) => { if (saved) setScheduleOpen(false) }) }} />
      <section className="flex flex-col" style={{ gap: 12 }}><ListRow placement="column" icon={detailsOpen ? 'chevron-down' : 'chevron-right'} title={t('habits.detail.moreDetails')} expanded={detailsOpen} controls="habit-detail-fields" chevron={false} onClick={() => setDetailsOpen((value) => !value)} /><div hidden={!detailsOpen} id="habit-detail-fields" style={{ animation: 'habit-detail-fade 160ms var(--ease-standard)' }}><HabitDetailFields key={habit.id} open={detailsOpen} habit={habit} hasProAccess={hasProAccess} relationshipControlsAvailable={relationshipControlsAvailable} onItemsChange={(items) => { void updateItems(items) }} onPatch={patchHabit} onUpgrade={() => router.push('/upgrade')} /></div></section>
      <DateRow label={t('habits.detail.startedOn')} value={formatLocaleDate(new Date(habit.createdAtUtc), language, { dateStyle: 'medium' })} note={t('habits.form.startDateReason')} />
      <ListRow placement="column" icon={<Trash2 size={24} />} title={t('habits.detail.delete')} danger chevron={false} onClick={() => setConfirm('delete')} />
      <CreateHabitModal open={createOpen} onOpenChange={setCreateOpen} initialDate={dateStr} parentHabit={habit} />
      <ConfirmSheet open={confirm === 'clear'} title={t('habits.checklistClearTitle')} message={t('habits.checklistClearMessage')} confirmLabel={t('habits.form.clearChecklist')} destructive onCancel={() => setConfirm(null)} onConfirm={() => { void updateItems([]).then((saved) => { if (saved) setConfirm(null) }) }} />
      <ConfirmSheet open={confirm === 'log'} title={t('habits.checklistCompleteTitle')} message={t('habits.checklistCompleteMessage', { name: habit.title })} confirmLabel={t('habits.checklistCompleteConfirm')} onCancel={() => setConfirm(null)} onConfirm={() => { void confirmLog() }} />
      <ConfirmSheet open={pendingDateLog !== null} title={t('habits.detail.logDateConfirmTitle')} message={t(getHabitLogDateConfirmationKeys(pendingDateLog?.intent, pendingDateLog?.permanent).message, { name: pendingDateLog?.name ?? habit.title, date: formatLocaleDate(parseAPIDate(pendingDateLog?.date ?? dateStr), language, { dateStyle: 'long' }) })} confirmLabel={t(getHabitLogDateConfirmationKeys(pendingDateLog?.intent, pendingDateLog?.permanent).action)} onCancel={() => setPendingDateLog(null)} onConfirm={() => {
        const pending = pendingDateLog
        setPendingDateLog(null)
        if (pending?.date === dateStr) void writeLog(pending.habitId, pending.intent, true)
      }} />
      <ConfirmSheet open={confirm === 'delete'} title={t('habits.deleteConfirmTitle')} message={t('habits.deleteConfirmMessage')} confirmLabel={t('habits.deleteHabit')} destructive onCancel={() => setConfirm(null)} onConfirm={() => { void confirmDelete() }} />
      <ConfirmSheet open={confirm === 'delete-child'} title={t('habits.deleteConfirmTitle')} message={t('habits.deleteConfirmMessage')} confirmLabel={t('habits.deleteHabit')} destructive onCancel={() => { setConfirm(null); setChildToDelete(null) }} onConfirm={() => { void confirmChildDelete() }} />
    </HabitDetailFrame>
  )
}
