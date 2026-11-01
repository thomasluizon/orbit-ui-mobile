vi.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => ({ currentTheme: 'dark', toggleTheme: vi.fn() }) }))
import { measureClampedPersonalText } from '@/__tests__/support/personal-text'
import { loadAppFonts } from '@/__tests__/support/app-fonts'
import { readControlPaint } from '@/e2e/layout/control-paint'
import { personalText } from '@/__tests__/support/personal-text'
import React from 'react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from '@tailwindcss/postcss'
import { closeChrome, registerChromeLaunchHook, type Browser, type BrowserLaunch } from '@/__tests__/support/chromium'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { Time24 } from '@orbit/shared/contracts/forms'
import en from '@orbit/shared/i18n/en.json'
import ptBR from '@orbit/shared/i18n/pt-BR.json'
import { createApiClientError, formatAPIDate, formatLocaleDate, formatLocaleDateTime, isHabitSlipping, normalizeHabitQueryData } from '@orbit/shared/utils'
import {
  makeHabitDetail as makeDetail,
  makeEnrichedHabitDetail,
  makeHabitScheduleItem,
  makeMonthlyChildDaySchedule,
  makeTaggedNestedHabitScheduleItem,
  makeHabitDetailScopedChild as makeScopedChild,
  makeHabitDetailScopedParent as makeScopedParent,
  makeLoggedGeneralHabitDetailChild as makeLoggedGeneralChild,
} from '@orbit/shared/test-support/habit-detail-fixtures'
import type { HabitLog } from '@orbit/shared/types/calendar'
import type { HabitDetail, HabitMetrics, NormalizedHabit, RescheduleSuggestion } from '@orbit/shared/types/habit'
import { habitDetailSchema, updateHabitRequestSchema } from '@orbit/shared/types/habit'
import { HabitDetailScreen } from '@/components/habits/habit-detail-screen'
import { Sheet } from '@/components/ui/sheet'
import { DestinationShell } from '@/components/shell/destination-shell'
import { RouteContext } from '@/components/navigation/route-context'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'
import { holdAccount, replaceAccountWith } from '@/__tests__/support/account-change'
import { resolveWebThemeVariables } from '@/lib/theme-dom'
import { readExpandedControlGeometry } from '@/e2e/layout/expanded-control-geometry'
import { readFieldIndicators, readOutlineVisibility } from '@/e2e/layout/focus-indicators'
import { inspectInteractionFill } from '@/e2e/layout/interaction-fill-geometry'
import { INTERACTION_FILL_CLEARANCE } from '@orbit/shared/theme'

vi.mock('@/hooks/use-correct-habit-dose', () => ({ useCorrectHabitDose: () => ({ mutateAsync: vi.fn(), isPending: false }) }))

const mocks = vi.hoisted(() => ({
  pathname: '/habits/habit-1',
  realTimeField: false,
  realReminderSections: false,
  realHeaderRing: false,
  realEditorPencil: false,
  realChildRows: false,
  realChildStatusCopy: false,
  realHistory: false,
  logs: [] as HabitLog[],
  metrics: {} as HabitMetrics,
  metricsError: false,
  detail: null as HabitDetail | null,
  detailLoading: false,
  detailError: false,
  refetch: vi.fn(),
  allHabitsFallback: null as Map<string, NormalizedHabit> | null,
  allHabitsError: false,
  allHabitsLoading: false,
  allHabitsEnabled: undefined as boolean | undefined,
  allHabitsRefetch: vi.fn(),
  scopedLoading: false,
  scopedError: false,
  scopedRefetch: vi.fn(),
  scopedCompleteDay: false,
  allHabits: new Map<string, NormalizedHabit>(),
  scopedHabits: new Map<string, NormalizedHabit>(),
  scopedHabitsByDate: new Map<string, Map<string, NormalizedHabit>>(),
  scopedRequests: [] as { dateFrom: string; includeOverdue: boolean }[],
  log: vi.fn(),
  update: vi.fn(),
  updatePending: false,
  checklist: vi.fn(),
  deleteHabit: vi.fn(),
  showError: vi.fn(),
  routerBack: vi.fn(),
  routerPush: vi.fn(),
  routerReplace: vi.fn(),
  history: [] as { path: string; selectedDate: string }[],
  hasProAccess: true,
  timeZone: 'UTC',
  profileReady: true,
  weekStartDay: 1,
  suggestion: null as RescheduleSuggestion | null,
  rescheduleOptions: [] as { enabled: boolean }[],
  rescheduleError: null as Error | null,
  rescheduleRefetch: vi.fn(),
  language: 'en',
  uses24HourClock: undefined as boolean | undefined,
}))

vi.mock('next-intl', () => ({
  useLocale: () => mocks.language,
  useTranslations: () => (key: string, values?: Record<string, string | number>) => {
    if (mocks.realChildStatusCopy && key === 'habits.form.typeHabit') return ptBR.habits.form.typeHabit
    if (mocks.realChildStatusCopy && key === 'habits.statusDot.skip') return ptBR.habits.statusDot.skip
    if (mocks.realChildStatusCopy && key === 'calendar.dayCell.notScheduled') return ptBR.calendar.dayCell.notScheduled
    if (key === 'habits.detail.slippingLine') return `${key}:${values?.days}:${values?.streak}:${values?.limit}`
    if (key === 'loggedAt') return `${values?.date}, logged at ${values?.time}`
    if (key === 'habits.detail.logDateConfirmMessage') return `${values?.date}: ${values?.name}`
    if (key === 'habits.detail.logDateConfirmUnlogMessage') return `Undo ${values?.name}: ${values?.date}`
    if (key === 'habits.detail.askAstraSeedDefault') return `${key}:${JSON.stringify({ title: values?.title })}`
    if (key === 'habits.detail.askAstra' && mocks.language === 'pt-BR') return ptBR.habits.detail.askAstra
    if (key === 'calendarLabel') return `Atividade do hábito em ${values?.month}`
    return key
  },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: mocks.routerBack, push: mocks.routerPush, replace: mocks.routerReplace }),
  usePathname: () => mocks.pathname,
  useParams: () => ({}),
}))

vi.mock('@/app/(app)/today-provider', async () => {
  const { formatAPIDateInTimeZone } = await import('@orbit/shared/utils')
  return { useToday: (timeZone: string | null | undefined) => formatAPIDateInTimeZone(new Date(), timeZone) }
})

vi.mock('@/hooks/use-habit-queries', () => ({
  useHabitDetail: () => ({ data: mocks.detail, isLoading: mocks.detailLoading, isError: mocks.detailError, refetch: mocks.refetch }),
  useHabitLogs: () => ({ data: mocks.logs }),
  useHabitMetrics: () => ({ data: mocks.metrics, isLoading: false, isError: mocks.metricsError }),
  useHabits: (filters: { dateFrom?: string; includeOverdue?: boolean }, _initialItems?: unknown, options?: { completeDay?: boolean; enabled?: boolean }) => {
    if (!filters.dateFrom) mocks.allHabitsEnabled = options?.enabled
    if (filters.dateFrom) {
      mocks.scopedCompleteDay = options?.completeDay ?? false
      mocks.scopedRequests.push({ dateFrom: filters.dateFrom, includeOverdue: filters.includeOverdue === true })
    }
    return { data: filters.dateFrom && mocks.scopedLoading ? undefined : { habitsById: filters.dateFrom ? mocks.scopedHabitsByDate.get(filters.dateFrom) ?? mocks.scopedHabits : (options?.enabled && mocks.allHabitsFallback ? mocks.allHabitsFallback : mocks.allHabits), topLevelHabits: [] }, isLoading: filters.dateFrom ? mocks.scopedLoading : mocks.allHabitsLoading, isError: filters.dateFrom ? mocks.scopedError : mocks.allHabitsError, refetch: filters.dateFrom ? mocks.scopedRefetch : mocks.allHabitsRefetch }
  },
}))

vi.mock('@/hooks/use-habits', () => ({
  useLogHabit: () => ({ mutate: mocks.log, mutateAsync: mocks.log }),
  useUpdateHabit: () => ({ mutate: mocks.update, mutateAsync: mocks.update, isPending: mocks.updatePending }),
  useUpdateChecklist: () => ({ mutate: mocks.checklist, mutateAsync: mocks.checklist }),
  useDeleteHabit: () => ({ mutate: mocks.deleteHabit, mutateAsync: mocks.deleteHabit }),
}))

vi.mock('@/hooks/use-tags', () => ({
  useTags: () => ({ tags: [] }),
  useCreateTag: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateTag: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteTag: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAssignTags: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('@/components/habits/checklist-templates', () => ({ ChecklistTemplates: () => null }))

vi.mock('@/hooks/use-app-toast', () => ({
  useAppToast: () => ({ showError: mocks.showError }),
}))

vi.mock('@/hooks/use-notification-inbox', () => ({
  useNotificationInbox: () => ({ visibleUnreadCount: 0 }),
}))

vi.mock('@/hooks/use-profile', () => ({
  useProfile: () => ({
    profile: mocks.profileReady ? {
      name: 'Reader',
      email: 'reader@example.com',
      aiMessagesLimit: 20,
      aiMessagesUsed: 0,
      hasProAccess: mocks.hasProAccess,
      language: mocks.language,
      uses24HourClock: mocks.uses24HourClock,
      weekStartDay: mocks.weekStartDay,
      timeZone: mocks.timeZone,
    } : undefined,
  }),
}))

vi.mock('@/hooks/use-reschedule-suggestion', () => ({
  useRescheduleSuggestion: (options: { enabled: boolean }) => {
    mocks.rescheduleOptions.push(options)
    return { suggestion: mocks.suggestion, error: mocks.rescheduleError, refetch: mocks.rescheduleRefetch }
  },
}))

vi.mock('@/components/shell/flow-shell', () => ({
  FlowShell: ({ children, header }: { children: React.ReactNode; header?: React.ReactNode }) => <main>{header}{children}</main>,
}))
vi.mock('@/components/ui/astra-glyph', () => ({ AstraGlyph: ({ size }: { size: number }) => <svg data-testid="astra-glyph" data-size={size} aria-hidden="true" /> }))
vi.mock('@/components/ui/badge', () => ({ Badge: ({ children }: { children: React.ReactNode }) => <span data-testid="badge">{children}</span> }))
vi.mock('@/components/ui/confirm-sheet', () => ({
  ConfirmSheet: ({ open, title, message, confirmLabel, onConfirm, onCancel }: { open: boolean; title: string; message: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) => open
    ? <><button type="button" data-testid={`confirm-${title}`} data-message={message} data-confirm-label={confirmLabel} onClick={onConfirm}>{title}</button><button type="button" data-testid={`cancel-${title}`} onClick={onCancel}>Cancel</button></>
    : null,
}))
vi.mock('@/components/ui/error-state', () => ({
  ErrorState: ({ message, action }: { message: string; action: React.ReactNode }) => <div role="alert">{message}{action}</div>,
}))
vi.mock('@/components/ui/proposed', () => ({ Proposed: ({ children, label }: { children: React.ReactNode; label: string }) => <div role="group" aria-label={label}>{children}</div> }))
vi.mock('@/components/ui/skeleton', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/skeleton')>()
  return { Skeleton: (props: React.ComponentProps<typeof actual.Skeleton>) => mocks.realHistory ? <actual.Skeleton {...props} /> : <div>{props.label}</div> }
})
vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) => (
    <button type="button" role="switch" aria-label={label} aria-checked={checked} onClick={() => onChange(!checked)} />
  ),
}))
vi.mock('@/components/ui/list-row', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/list-row')>()
  return { ListRow: (props: React.ComponentProps<typeof actual.ListRow>) => {
    if (props.title === 'habits.detail.askAstra' || props.title === ptBR.habits.detail.askAstra) return <actual.ListRow {...props} />
    const { title, description, value, trailing, chevron, onClick, expanded, controls, toggle } = props
    return onClick || toggle
    ? <button type="button" role={toggle ? "switch" : undefined} aria-label={title} aria-checked={toggle?.checked} aria-expanded={expanded} aria-controls={controls} data-testid={`list-row-${title}`} data-description={description} data-value={value} data-chevron={String(chevron)} onClick={toggle ? () => toggle.onChange(!toggle.checked) : onClick}>{title}{trailing}</button>
    : <div aria-expanded={expanded} aria-controls={controls} data-testid={`list-row-${title}`} data-description={description} data-value={value} data-chevron={String(chevron)}>{title}{trailing}</div>
  }}
})
vi.mock('@/components/ui/pill-button', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/pill-button')>()
  return ({
  ...(await importOriginal<typeof import('@/components/ui/pill-button')>()),
  PillButton: (props: React.ComponentProps<typeof actual.PillButton>) => props.children === 'habits.reschedule.suggestDate' || (mocks.realEditorPencil && props.label === 'habits.editHabit')
    ? <actual.PillButton {...props} /> : <button type="button" disabled={props.disabled} aria-label={props.label} aria-busy={props.loading} data-variant={props.variant} data-size={props.size} onClick={props.onClick}>{props.children}</button>,
  Button: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => <button type="button" onClick={onClick}>{children}</button>,
}) })
vi.mock('@/components/ui/stat-tile', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ui/stat-tile')>()),
  StatTile: ({ label, value }: { label: string; value: string }) => <output data-testid={`stat-${label}`}>{value}</output>,
}))
vi.mock('@/components/dates/day-cell', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/dates/day-cell')>()
  return { DayCell: (props: React.ComponentProps<typeof actual.DayCell>) => {
    if (mocks.realHistory) return <actual.DayCell {...props} />
    const { day, done, scheduled, outsideMonth, label } = props
    const outcome = scheduled === 0 ? 'not-scheduled' : done !== undefined && scheduled !== undefined && done >= scheduled ? 'full' : 'none'
    return <span aria-label={label} data-testid={`history-day-${day}-${outsideMonth ? 'outside' : 'inside'}`}>{outcome}</span>
  } }
})
vi.mock('@/components/dates/day-strip', () => ({ DayStrip: ({ size, days }: { size: number; days: string[] }) => <div data-testid="detail-strip" data-size={size} data-days={days.length} data-values={days.join(",")} /> }))
vi.mock('@/components/dates/month-grid', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/dates/month-grid')>()
  return { MonthGrid: (props: React.ComponentProps<typeof actual.MonthGrid>) => mocks.realHistory ? <actual.MonthGrid {...props} /> : <div aria-label={props.label}><div role={props.loadingLabel ? 'progressbar' : undefined} aria-label={props.loadingLabel} aria-busy={props.loadingLabel ? true : undefined}>{props.children}</div></div> }
})
vi.mock('@/components/habits/edit-habit-modal', () => ({ EditHabitModal: () => null }))
vi.mock('@/components/habits/create-habit-modal', () => ({ CreateHabitModal: ({ open }: { open: boolean }) => open ? <div role="dialog" aria-label="Create habit" /> : null }))
vi.mock('@/components/habits/goal-linking-field', () => ({
  GoalLinkingField: ({ selectedGoalIds, atGoalLimit, onToggleGoal }: { selectedGoalIds: string[]; atGoalLimit: boolean; onToggleGoal: (goalId: string) => void }) => <button type="button" data-testid="goal-linking-field" data-goal-limit={atGoalLimit} data-selected-goals={selectedGoalIds.join(",")} onClick={() => onToggleGoal(atGoalLimit ? selectedGoalIds[0]! : 'goal-2')} />,
}))
vi.mock('@/components/ui/time-field', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ui/time-field')>()
  return ({
  TimeField: ({ label, value, onChange, onClear, commitTypedClearOnBlur }: React.ComponentProps<typeof actual.TimeField>) => mocks.realTimeField ? <actual.TimeField commitTypedClearOnBlur={commitTypedClearOnBlur} label={label} value={value} onChange={onChange} onClear={onClear} /> : (
    <div>
      <input aria-label={label} value={value} onChange={(event) => { if (/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(event.target.value)) onChange(event.target.value as Time24) }} />
      <button type="button" onClick={onClear}>clear-time</button>
    </div>
  ),
})
})
vi.mock('@/hooks/use-reminder-permission', () => ({
  useReminderPermission: (_enabled: boolean, onToggleReminder: () => void) => ({ toggleReminder: onToggleReminder, showNotice: false, openSettings: vi.fn() }),
}))
vi.mock('@/components/habits/habit-form-fields/reminder-section', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/habits/habit-form-fields/reminder-section')>()
  const mockSection = ({ children, onReminderTimesChange }: { children?: React.ReactNode; onReminderTimesChange: (offsets: number[]) => void }) => <div data-testid="offset-reminders"><button type="button" onClick={() => onReminderTimesChange([30])}>set-offset</button>{children}</div>
  return {
    ReminderSection: (props: React.ComponentProps<typeof actual.ReminderSection>) => mocks.realReminderSections ? <actual.ReminderSection {...props} /> : mockSection(props),
  }
})
vi.mock('@/components/habits/habit-form-fields/scheduled-reminder-section', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/habits/habit-form-fields/scheduled-reminder-section')>()
  const mockSection = ({ onSetScheduledReminders }: { onSetScheduledReminders: (scheduled: { when: 'same_day'; time: string }[]) => void }) => <div data-testid="scheduled-reminders"><button type="button" onClick={() => onSetScheduledReminders([{ when: 'same_day', time: '08:00' }])}>set-scheduled</button><button type="button" onClick={() => onSetScheduledReminders([])}>remove-scheduled</button></div>
  return {
    ScheduledReminderSection: (props: React.ComponentProps<typeof actual.ScheduledReminderSection>) => mocks.realReminderSections ? <actual.ScheduledReminderSection {...props} /> : mockSection(props),
  }
})
vi.mock('@/components/habits/habit-checklist', () => ({
  HabitChecklist: ({ interactive, editable, onToggle, onClear }: { interactive: boolean; editable: boolean; onToggle: (index: number) => void; onClear: () => void }) => (
    <div data-testid="habit-checklist" data-interactive={interactive} data-editable={editable}>
      <button type="button" onClick={() => onToggle(0)}>toggle-checklist</button>
      <button type="button" onClick={onClear}>clear-checklist</button>
    </div>
  ),
}))
vi.mock('@/components/habits/habit-form-fields/habit-emoji-selector', () => ({ HabitEmojiSelector: () => null }))
vi.mock('@/components/habits/habit-log-button', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/habits/habit-log-button')>()
  return {
    HabitLogButton: (props: React.ComponentProps<typeof actual.HabitLogButton>) => mocks.realHeaderRing
      ? <actual.HabitLogButton {...props} />
      : <button type="button" aria-label={props.label} data-logged={props.logged} data-disabled-reason={props.disabledReason} disabled={props.disabled} onClick={props.onPress}>{props.label}</button>,
  }
})
vi.mock('@/components/habits/habit-row', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/habits/habit-row')>()
  return { HabitRow: (props: React.ComponentProps<typeof actual.HabitRow>) => {
    if (mocks.realChildRows) return <actual.HabitRow {...props} />
    const { habit, state, canLog, completionReadOnly, completionReason, completionStatusUnavailable, actions = {} } = props
    return (
    <div>
      <button
        type="button"
        data-testid={`child-${habit.id}`}
        data-tags={habit.tags.map((tag) => tag.name).join(",")}
        data-reminder-enabled={habit.reminderEnabled}
        data-state={state}
        data-can-log={canLog}
        data-completion-read-only={completionReadOnly}
        data-completion-reason={completionReason}
        data-completion-status-unavailable={completionStatusUnavailable}
        disabled={completionReadOnly}
        aria-label={state === 'done' ? 'unlog-child' : 'log-child'}
        onClick={state === 'done' ? actions.onUnlog : actions.onLog}
      >
        {habit.title}
      </button>
      <button type="button" aria-label={`open-${habit.id}`} onClick={actions.onDetail} />
      <button type="button" aria-label={`delete-${habit.id}`} onClick={actions.onDelete} />
    </div>
    )
  } }
})

function openRescueGate() {
  mocks.logs = []
  mocks.metrics = { ...mocks.metrics, currentStreak: 0, weeklyCompletionRate: 0, monthlyCompletionRate: 40, lastCompletedDate: '2026-08-20' }
  mocks.scopedHabits = new Map([['habit-1', { ...makeScopedParent(), isOverdue: true }]])
}

beforeEach(() => measureClampedPersonalText())

describe('HabitDetailScreen', () => {
  beforeEach(() => {
    mocks.realEditorPencil = false
    mocks.realHeaderRing = false
    mocks.realChildRows = false
    mocks.realChildStatusCopy = false
    mocks.realHistory = false
    mocks.pathname = '/habits/habit-1'
    mocks.realTimeField = false;
    mocks.realReminderSections = false;
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 29, 12))
    mocks.detail = makeDetail()
    mocks.detailLoading = false
    mocks.detailError = false
    mocks.allHabitsFallback = null
    mocks.allHabitsError = false
    mocks.allHabitsLoading = false
    mocks.allHabitsEnabled = undefined
    mocks.logs = [
      { id: 'older-1', date: '2026-08-26', value: 1, createdAtUtc: '2026-08-26T12:00:00Z' },
      { id: 'older-2', date: '2026-08-27', value: 1, createdAtUtc: '2026-08-27T12:00:00Z' },
    ]
    mocks.metricsError = false
    mocks.metrics = {
      currentStreak: 2,
      longestStreak: 4,
      weeklyCompletionRate: 80,
      monthlyCompletionRate: 75,
      totalCompletions: 2,
      lastCompletedDate: '2026-08-27',
    }
    mocks.allHabits = new Map([['habit-1', { ...makeScopedParent(), tags: [], linkedGoals: [], instances: [] }]])
    mocks.scopedHabits = new Map()
    mocks.scopedHabitsByDate = new Map()
    mocks.scopedRequests = []
    mocks.log.mockReset()
    mocks.update.mockReset()
    mocks.updatePending = false
    mocks.checklist.mockReset()
    mocks.deleteHabit.mockReset()
    mocks.showError.mockReset()
    mocks.refetch.mockReset()
    mocks.allHabitsRefetch.mockReset()
    mocks.scopedLoading = false
    mocks.scopedError = false
    mocks.scopedRefetch.mockReset()
    mocks.routerBack.mockReset()
    mocks.routerPush.mockReset()
    mocks.routerReplace.mockReset()
    mocks.history = []
    mocks.hasProAccess = true
    mocks.timeZone = 'UTC'
    mocks.profileReady = true
    mocks.weekStartDay = 1
    mocks.scopedCompleteDay = false
    mocks.rescheduleOptions = []
    mocks.rescheduleError = null
    mocks.rescheduleRefetch.mockReset()
    mocks.language = 'en'
    mocks.uses24HourClock = undefined
    useChatStore.setState({ draft: '', draftHydrated: true, contextualSuggestion: null })
    mocks.suggestion = null
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('renders repeat next time and Taken at in the owning detail screen', () => {
    mocks.detail = { ...makeDetail(), repeatReminder: { intervalMinutes: 30 }, nextReminderAtUtc: '2026-10-29T04:00:00Z' }
    mocks.logs = [{ id: 'dose-1', date: '2026-08-28', value: 1, createdAtUtc: '2026-08-28T02:00:00Z', takenAtUtc: '2026-08-28T02:00:00Z' }]
    render(<HabitDetailScreen habitId="habit-1" />)
    expect(screen.getByText('habits.nextReminder')).toBeInTheDocument()
    expect(screen.getByText('habits.takenAt')).toBeInTheDocument()
  })

  it('keeps child progress in an unlogged bad habit parent header', () => {
    mocks.realHeaderRing = true
    mocks.logs = []
    mocks.detail = { ...makeDetail(), isBadHabit: true }
    mocks.allHabits = normalizeHabitQueryData([makeHabitScheduleItem({ isBadHabit: true })]).habitsById
    mocks.scopedHabits = new Map([
      ['habit-1', { ...makeScopedParent(), isBadHabit: true }],
      ['child-1', makeScopedChild('2026-08-28')],
    ])
    const view = render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    const header = view.container.querySelector('[data-habit-detail-header-row]')!
    expect(header.querySelector('[role="progressbar"]')).toHaveAttribute('aria-valuenow', '100')
    expect(header.querySelector('[data-status]')).toBeNull()
  })

  it('shows empty, overdue and done status in the leaf header', () => {
    mocks.realHeaderRing = true
    mocks.logs = []
    mocks.detail = { ...makeDetail(), children: [] }
    const view = render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    const header = () => view.container.querySelector('[data-habit-detail-header-row]')!
    expect(header().querySelector('[data-status="empty"]')).toBeInTheDocument()
    expect(header().querySelector('[role="progressbar"]')).toBeNull()

    mocks.scopedHabits.set('habit-1', { ...makeScopedParent(), isOverdue: true })
    view.rerender(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    expect(header().querySelector('[data-status="overdue"]')).toBeInTheDocument()

    mocks.logs = [{ id: 'selected', date: '2026-08-28', value: 1, createdAtUtc: '2026-08-28T12:00:00Z' }]
    view.rerender(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    expect(header().querySelector('[data-status="done"]')).toBeInTheDocument()
  })

  it.each(['absent', 'irrelevant'])('excludes a %s not-scheduled child from the header fraction', (state) => {
    mocks.realHeaderRing = true
    mocks.logs = []
    const child = makeDetail().children[0]!
    mocks.detail = { ...makeDetail(), children: [child, { ...child, id: 'child-2' }] }
    mocks.scopedHabits = new Map([['child-1', makeScopedChild('2026-08-28')]])
    if (state === 'irrelevant') mocks.scopedHabits.set('child-2', {
      ...makeScopedChild('2026-08-29'), id: 'child-2', isLoggedInRange: false, instances: [],
    })
    const view = render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    const header = view.container.querySelector('[data-habit-detail-header-row]')!
    expect(header.querySelector('[role="progressbar"]')).toHaveAttribute('aria-valuenow', '100')
    expect(header.querySelector('[data-status]')).toBeNull()
  })

  it.each(['loading', 'error'])('shows a status ring while selected day children are %s', (state) => {
    mocks.realHeaderRing = true
    mocks.logs = []
    mocks.scopedLoading = state === 'loading'
    mocks.scopedError = state === 'error'
    mocks.scopedHabits = new Map([['child-1', makeScopedChild('2026-08-28')]])
    const view = render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    const header = view.container.querySelector('[data-habit-detail-header-row]')!
    expect(header.querySelector('[role="progressbar"]')).toBeNull()
    expect(header.querySelector('[data-status="empty"]')).toBeInTheDocument()
  })

  it.each(['absent', 'irrelevant'])('shows a status ring when all selected day children are %s', (state) => {
    mocks.realHeaderRing = true
    mocks.logs = []
    mocks.scopedHabits = new Map()
    if (state === 'irrelevant') mocks.scopedHabits.set('child-1', {
      ...makeScopedChild('2026-08-29'), isLoggedInRange: false, instances: [],
    })
    const view = render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    const header = view.container.querySelector('[data-habit-detail-header-row]')!
    expect(header.querySelector('[role="progressbar"]')).toBeNull()
    expect(header.querySelector('[data-status="empty"]')).toBeInTheDocument()
  })

  it.each([0, 1, 2])('shows the selected day fraction for an unlogged parent with %i children done', (done) => {
    mocks.realHeaderRing = true
    mocks.logs = []
    const child = makeDetail().children[0]!
    mocks.detail = { ...makeDetail(), children: [child, { ...child, id: 'child-2' }] }
    mocks.scopedHabits = new Map(mocks.detail.children.map((entry, index) => [entry.id, {
      ...makeScopedChild('2026-08-28'), id: entry.id,
      isLoggedInRange: index < done,
      instances: index < done ? [{ date: '2026-08-28', status: 'Completed', logId: entry.id }] : [],
    }]))
    const view = render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    const header = view.container.querySelector('[data-habit-detail-header-row]')!
    const ring = header.querySelector('[role="progressbar"]')!
    expect(ring).toHaveAttribute('aria-valuenow', String(done * 50))
    expect(header.querySelector('[data-status]')).toBeNull()
    const paintedCircles = Array.from(ring.querySelectorAll('circle')).filter((circle) => circle.getAttribute('visibility') !== 'hidden')
    expect(paintedCircles).toHaveLength(done === 0 ? 1 : 2)

    mocks.logs = [{ id: 'selected', date: '2026-08-28', value: 1, createdAtUtc: '2026-08-28T12:00:00Z' }]
    view.rerender(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    expect(header.querySelector('[data-status="done"]')).toBeInTheDocument()
    expect(header.querySelector('[role="progressbar"]')).toBeNull()
  })

  it.each(['ready', 'loading', 'error'])('keeps a leaf creation row without an empty inside section when day habits are %s', (state) => {
    mocks.detail = { ...makeDetail(), children: [] }
    mocks.scopedLoading = state === 'loading'
    mocks.scopedError = state === 'error'
    render(<HabitDetailScreen habitId="habit-1" />)
    expect(screen.queryByText('habits.detail.inside')).not.toBeInTheDocument()
    expect(screen.queryByTestId('detail-children')).not.toBeInTheDocument()
    expect(screen.queryByText('habits.detail.dayHabitsLoading')).not.toBeInTheDocument()
    expect(screen.queryByText('habits.detail.dayHabitsLoadError')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.addSubHabit' }))
    expect(screen.getByRole('dialog', { name: 'Create habit' })).toBeVisible()
  })

  it.each(['valid', 'malformed'])('shows no data on a metrics error with %s cached values', (cached) => {
    if (cached === 'malformed') mocks.metrics = {} as HabitMetrics
    mocks.metricsError = true
    render(<HabitDetailScreen habitId="habit-1" />)
    expect(screen.getByText('noDataYet')).toBeInTheDocument()
    expect(screen.queryByText('NaN%')).not.toBeInTheDocument()
    expect(screen.queryByText('undefined')).not.toBeInTheDocument()
    expect(screen.queryByText('75%')).not.toBeInTheDocument()
  })

  it('groups a parent label, populated child card and creation row without empty status text', () => {
    render(<HabitDetailScreen habitId="habit-1" />)
    const section = screen.getByRole('heading', { name: 'habits.detail.inside' }).closest('section')!
    expect(within(section).getByTestId('detail-children')).toContainElement(screen.getByTestId('child-child-1'))
    expect(within(section).getByRole('button', { name: 'habits.detail.addSubHabit' })).toBeVisible()
    expect(Array.from(section.querySelectorAll('p')).filter((paragraph) => !paragraph.textContent.trim())).toHaveLength(0)
  })

  it('exposes the habit name as its only page heading and a route focus target', () => {
    render(<RouteContext><HabitDetailScreen habitId="habit-1" /></RouteContext>)
    const headings = screen.getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent(mocks.detail!.title)
    expect(document.title).toBe(`${mocks.detail!.title} · Orbit`)
    expect(headings[0]).toHaveAttribute('tabindex', '-1')
    expect(headings[0]).not.toHaveFocus()
    expect(headings[0]!.querySelector('button')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'habits.editHabit' }))
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(mocks.detail!.title)
  })

  it('exposes the fixture heading after closing a modal above habit detail', async () => {
    mocks.detail = { ...makeDetail(), children: [], dueTime: '08:00:00' }
    function DetailWithPrompt() {
      const [open, setOpen] = React.useState(true)
      return <><HabitDetailScreen habitId="habit-1" />{open ? <Sheet title={en.marketingConsent.prompt.title} onClose={() => setOpen(false)} /> : null}</>
    }
    const view = render(<DetailWithPrompt />)
    expect(view.container.querySelector('h1')).toHaveTextContent(mocks.detail.title)
    expect(screen.queryByRole('heading', { level: 1, name: mocks.detail.title })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'common.close' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('heading', { level: 1, name: mocks.detail.title })).toBeVisible()
    expect(view.container.querySelector('[aria-busy="true"], .skeleton-pulse')).toBeNull()
  })

  it.each([false, true])('leaves focus on the document after a direct load with delayed data=%s', async (delayed) => {
    mocks.detailLoading = delayed
    const view = render(<RouteContext><HabitDetailScreen habitId="habit-1" /></RouteContext>)
    await act(async () => { vi.advanceTimersByTime(40) })
    expect(document.body).toHaveFocus()
    mocks.detailLoading = false
    view.rerender(<RouteContext><HabitDetailScreen habitId="habit-1" /></RouteContext>)
    await act(async () => { vi.advanceTimersByTime(40) })
    expect(screen.getByRole('heading', { level: 1, name: mocks.detail!.title })).not.toHaveFocus()
    expect(document.body).toHaveFocus()
  })

  it.each([false, true])('focuses the habit title after client navigation with delayed data=%s', async (delayed) => {
    mocks.pathname = '/'
    const view = render(<RouteContext><DestinationShell onCreate={() => {}}><h1>Today</h1><button type="button">Open habit</button></DestinationShell></RouteContext>)
    screen.getByRole('button', { name: 'Open habit' }).focus()
    mocks.pathname = '/habits/habit-1'
    mocks.detailLoading = delayed
    view.rerender(<RouteContext><DestinationShell onCreate={() => {}}><HabitDetailScreen habitId="habit-1" fromToday /></DestinationShell></RouteContext>)
    await act(async () => { vi.advanceTimersByTime(40) })
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
    mocks.detailLoading = false
    view.rerender(<RouteContext><DestinationShell onCreate={() => {}}><HabitDetailScreen habitId="habit-1" fromToday /></DestinationShell></RouteContext>)
    await act(async () => { vi.advanceTimersByTime(40) })
    expect(screen.getByRole('heading', { level: 1, name: mocks.detail!.title })).toHaveFocus()
  })
  it.each([
    ['2026-08-20', 'Aug 20, 2026'],
    ['2026-08-28', 'Aug 28, 2026'],
    [undefined, formatLocaleDate('2026-08-29T00:30:00Z', 'en', { dateStyle: 'medium' })],
  ])('shows the API start date %s in the detail row with legacy timestamp compatibility', (startDate, expected) => {
    mocks.detail = { ...makeDetail(), startDate, createdAtUtc: '2026-08-29T00:30:00Z' }
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    const row = screen.getByText('habits.detail.startedOn').parentElement!
    expect(within(row).getByText(expected)).toBeInTheDocument()
  })

  it('waits for the account day before querying an unpinned detail', () => {
    mocks.profileReady = false
    const view = render(<HabitDetailScreen habitId="habit-1" />)
    expect(mocks.scopedCompleteDay).toBe(false)
    mocks.profileReady = true
    view.rerender(<HabitDetailScreen habitId="habit-1" />)
    expect(mocks.scopedCompleteDay).toBe(true)
  })

  it('does not offer a rescue for a habit created today', () => {
    mocks.detail = { ...makeDetail(), createdAtUtc: '2026-08-29T12:00:00Z' }
    mocks.logs = []
    mocks.metrics = { currentStreak: 0, longestStreak: 0, weeklyCompletionRate: 0, monthlyCompletionRate: 0, totalCompletions: 0, lastCompletedDate: null }
    mocks.scopedHabits = new Map([['habit-1', { ...makeScopedParent(), isOverdue: false }]])
    const view = render(<HabitDetailScreen habitId="habit-1" />)
    expect(screen.queryByRole('group', { name: 'habits.form.proposedByAstra' })).not.toBeInTheDocument()
    expect(screen.queryByText(/habits\.detail\.slippingLine/)).not.toBeInTheDocument()
    expect(mocks.rescheduleOptions.every((options) => !options.enabled)).toBe(true)
    mocks.hasProAccess = false
    view.rerender(<HabitDetailScreen habitId="habit-1" />)
    expect(screen.queryByText('habits.reschedule.freePrompt')).not.toBeInTheDocument()
  })

  it('shows a rescue only for an older overdue habit and handles request states', () => {
    openRescueGate()
    const view = render(<HabitDetailScreen habitId="habit-1" />)
    expect(within(screen.getByRole('group', { name: 'habits.form.proposedByAstra' })).getByRole('status')).toHaveTextContent('habits.detail.rescheduleLoading')
    expect(mocks.rescheduleOptions.some((options) => options.enabled)).toBe(true)
    expect(screen.queryByRole('button', { name: 'habits.detail.rescheduleAccept' })).not.toBeInTheDocument()

    mocks.rescheduleError = createApiClientError(400, { error: 'Not overdue', errorCode: 'HABIT_NOT_OVERDUE' }, 'Failed')
    view.rerender(<HabitDetailScreen habitId="habit-1" />)
    expect(screen.queryByRole('group', { name: 'habits.form.proposedByAstra' })).not.toBeInTheDocument()
    expect(screen.queryByText(/habits\.detail\.slippingLine/)).not.toBeInTheDocument()

    mocks.rescheduleError = createApiClientError(500, { error: 'Unavailable' }, 'Failed')
    view.rerender(<HabitDetailScreen habitId="habit-1" />)
    expect(within(screen.getByRole('group', { name: 'habits.form.proposedByAstra' })).getByRole('status')).toHaveTextContent('habits.detail.rescheduleError')
    expect(screen.queryByRole('button', { name: 'habits.detail.rescheduleAccept' })).not.toBeInTheDocument()
    const retry = screen.getByRole('button', { name: 'habits.reschedule.suggestDate' })
    expect(retry).toHaveTextContent('habits.reschedule.suggestDate')
    fireEvent.click(retry)
    expect(mocks.rescheduleRefetch).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'habits.reschedule.dismiss' }))
    expect(screen.queryByText('habits.detail.rescheduleError')).not.toBeInTheDocument()
    expect(screen.getByText('habits.detail.slippingLine:9:0:50')).toBeVisible()
  })

  it.each([
    { isOverdue: false, hasProAccess: true },
    { isOverdue: false, hasProAccess: false },
    { isOverdue: true, hasProAccess: true },
    { isOverdue: true, hasProAccess: false },
  ])('excludes a bad habit logged today from rescue ($isOverdue overdue, $hasProAccess Pro)', ({ isOverdue, hasProAccess }) => {
    openRescueGate()
    mocks.detail = { ...mocks.detail!, isBadHabit: true }
    mocks.logs = [{ id: 'today-slip', date: '2026-08-29', value: 1, createdAtUtc: '2026-08-29T12:00:00Z' }]
    mocks.metrics = { ...mocks.metrics, totalCompletions: 1, lastCompletedDate: '2026-08-29' }
    mocks.scopedHabits = normalizeHabitQueryData([makeHabitScheduleItem({ isBadHabit: true, isOverdue })]).habitsById
    mocks.hasProAccess = hasProAccess
    expect(isHabitSlipping(mocks.detail, mocks.metrics, mocks.logs, new Date(2026, 7, 29), 'UTC')).toBe(true)
    render(<HabitDetailScreen habitId="habit-1" />)
    expect(screen.queryByText(/habits\.detail\.slippingLine/)).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'habits.form.proposedByAstra' })).not.toBeInTheDocument()
    expect(screen.queryByText('habits.reschedule.freePrompt')).not.toBeInTheDocument()
    expect(mocks.rescheduleOptions.length).toBeGreaterThan(0)
    expect(mocks.rescheduleOptions.every((options) => !options.enabled)).toBe(true)
  })

  it.each(['initial request', 'retry'])('dismisses a pending proposal during %s for this visit', (requestState) => {
    openRescueGate()
    if (requestState === 'retry') mocks.rescheduleError = createApiClientError(500, { error: 'Unavailable' }, 'Failed')
    const view = render(<HabitDetailScreen habitId="habit-1" />)
    if (requestState === 'retry') {
      fireEvent.click(screen.getByRole('button', { name: 'habits.reschedule.suggestDate' }))
      expect(mocks.rescheduleRefetch).toHaveBeenCalledOnce()
      mocks.rescheduleError = null
      view.rerender(<HabitDetailScreen habitId="habit-1" />)
    }
    expect(screen.getByText('habits.detail.rescheduleLoading')).toBeVisible()
    const notNow = screen.getByRole('button', { name: 'habits.reschedule.dismiss' })
    expect(notNow).toBeEnabled()
    notNow.focus()
    fireEvent.click(notNow)
    expect(screen.queryByRole('group', { name: 'habits.form.proposedByAstra' })).not.toBeInTheDocument()
    expect(screen.getByText('habits.detail.slippingLine:9:0:50')).toBeVisible()
    expect(screen.getByText('habits.detail.slippingLine:9:0:50').closest('section')).toHaveFocus()
    mocks.suggestion = { frequencyUnit: 'Day', frequencyQuantity: 1, dueDate: '2026-08-30', dueTime: null, days: [], rationale: 'Try tomorrow' }
    view.rerender(<HabitDetailScreen habitId="habit-1" />)
    expect(screen.queryByRole('group', { name: 'habits.form.proposedByAstra' })).not.toBeInTheDocument()
  })

  it('keeps the proposal announcement mounted when loading finishes', () => {
    openRescueGate()
    const view = render(<HabitDetailScreen habitId="habit-1" />)
    const status = within(screen.getByRole('group', { name: 'habits.form.proposedByAstra' })).getByRole('status')
    mocks.suggestion = { frequencyUnit: 'Day', frequencyQuantity: 1, dueDate: '2026-08-30', dueTime: null, days: [], rationale: 'Try tomorrow' }
    view.rerender(<HabitDetailScreen habitId="habit-1" />)
    expect(within(screen.getByRole('group', { name: 'habits.form.proposedByAstra' })).getByRole('status')).toBe(status)
    expect(status).toHaveTextContent('Sun, Aug 30')
    expect(status).toHaveTextContent('Try tomorrow')
    expect(within(status).queryByRole('button')).not.toBeInTheDocument()
  })

  it('uses the account today overdue schedule on a historical detail', () => {
    openRescueGate()
    mocks.scopedHabitsByDate.set('2026-08-20', new Map([['habit-1', { ...makeScopedParent(), isOverdue: false }]]))
    const view = render(<HabitDetailScreen habitId="habit-1" date="2026-08-20" />)
    expect(mocks.scopedRequests).toContainEqual({ dateFrom: '2026-08-29', includeOverdue: true })
    expect(screen.getByText('habits.detail.slippingLine:9:0:50')).toBeVisible()
    expect(mocks.rescheduleOptions.some((options) => options.enabled)).toBe(true)

    mocks.scopedHabits = new Map([['habit-1', { ...makeScopedParent(), isOverdue: false }]])
    mocks.scopedHabitsByDate.set('2026-08-20', new Map([['habit-1', { ...makeScopedParent(), isOverdue: true }]]))
    mocks.rescheduleOptions = []
    view.rerender(<HabitDetailScreen habitId="habit-1" date="2026-08-20" />)
    expect(screen.queryByText(/habits\.detail\.slippingLine/)).not.toBeInTheDocument()
    expect(mocks.rescheduleOptions.every((options) => !options.enabled)).toBe(true)
  })

  it('shows the drawn proposal and puts it away for this visit only', () => {
    openRescueGate()
    mocks.uses24HourClock = true
    mocks.suggestion = { frequencyUnit: 'Day', frequencyQuantity: 1, dueDate: '2026-08-20', dueTime: '07:30:00', days: ['Tuesday', 'Thursday'], rationale: 'Walk before work.' }
    const view = render(<HabitDetailScreen habitId="habit-1" />)
    const proposal = screen.getByRole('group', { name: 'habits.form.proposedByAstra' })
    expect(Array.from(proposal.querySelectorAll('p, button')).map((node) => node.textContent)).toEqual([
      'Thu, Aug 20 · 07:30',
      'dates.daysShort.tuesday, dates.daysShort.thursday',
      'Walk before work.',
      'habits.detail.rescheduleFinePrint',
      'habits.reschedule.dismiss',
      'habits.detail.rescheduleAccept',
    ])
    expect(within(proposal).getAllByRole('button').map((button) => [button.dataset.variant, button.dataset.size])).toEqual([['ghost', 'sm'], ['primary', 'sm']])
    expect(screen.queryByText('habits.detail.slipping')).not.toBeInTheDocument()
    expect(screen.getByText('habits.detail.slippingLine:9:0:50')).toBeVisible()

    const notNow = within(proposal).getByRole('button', { name: 'habits.reschedule.dismiss' })
    notNow.focus()
    fireEvent.click(notNow)
    expect(screen.queryByRole('group', { name: 'habits.form.proposedByAstra' })).not.toBeInTheDocument()
    expect(screen.getByText('habits.detail.slippingLine:9:0:50')).toBeVisible()
    expect(document.activeElement).toBe(screen.getByText('habits.detail.slippingLine:9:0:50').closest('section'))

    mocks.detail = { ...makeDetail(), id: 'habit-2' }
    mocks.scopedHabits = new Map([['habit-2', { ...makeScopedParent(), id: 'habit-2', isOverdue: true }]])
    view.rerender(<HabitDetailScreen habitId="habit-2" />)
    expect(screen.getByRole('group', { name: 'habits.form.proposedByAstra' })).toBeInTheDocument()

    mocks.detail = makeDetail()
    mocks.scopedHabits = new Map([['habit-1', { ...makeScopedParent(), isOverdue: true }]])
    view.rerender(<HabitDetailScreen habitId="habit-1" />)
    expect(screen.getByRole('group', { name: 'habits.form.proposedByAstra' })).toBeInTheDocument()
  })

  it('closes the proposal once the plan is used', async () => {
    openRescueGate()
    mocks.suggestion = { frequencyUnit: 'Day', frequencyQuantity: 1, dueDate: '2026-08-30', dueTime: null, days: [], rationale: 'Try tomorrow' }
    mocks.update.mockResolvedValueOnce(undefined)
    render(<HabitDetailScreen habitId="habit-1" />)
    expect(screen.getByTestId('rescue-proposed-schedule')).toHaveTextContent(/^Sun, Aug 30$/)

    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.rescheduleAccept' }))

    await act(async () => { await Promise.resolve() })
    expect(mocks.update.mock.calls[0]?.[0]).toMatchObject({ habitId: 'habit-1', data: { dueDate: '2026-08-30', frequencyUnit: 'Day', frequencyQuantity: 1 } })
    expect(screen.queryByRole('group', { name: 'habits.form.proposedByAstra' })).not.toBeInTheDocument()
    expect(mocks.showError).not.toHaveBeenCalled()
  })

  it('keeps the plan label busy and holds Not now while the plan saves', () => {
    openRescueGate()
    mocks.suggestion = { frequencyUnit: 'Day', frequencyQuantity: 1, dueDate: '2026-08-30', dueTime: null, days: [], rationale: 'Try tomorrow' }
    mocks.updatePending = true
    render(<HabitDetailScreen habitId="habit-1" />)
    const proposal = screen.getByRole('group', { name: 'habits.form.proposedByAstra' })
    expect(within(proposal).getByRole('button', { name: 'habits.detail.rescheduleAccept' })).toHaveAttribute('aria-busy', 'true')
    expect(within(proposal).getByRole('button', { name: 'habits.reschedule.dismiss' })).toBeDisabled()
  })

  it('does not show an old plan failure on the new habit', async () => {
    openRescueGate()
    mocks.suggestion = { frequencyUnit: 'Day', frequencyQuantity: 1, dueDate: '2026-08-30', dueTime: null, days: [], rationale: 'Try tomorrow' }
    let rejectUpdate!: (error: Error) => void
    mocks.update.mockReturnValueOnce(new Promise<void>((_, reject) => { rejectUpdate = reject }))
    const view = render(<HabitDetailScreen habitId="habit-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.rescheduleAccept' }))
    mocks.detail = { ...makeDetail(), id: 'habit-2' }
    mocks.scopedHabits = new Map([['habit-2', { ...makeScopedParent(), id: 'habit-2', isOverdue: true }]])
    view.rerender(<HabitDetailScreen habitId="habit-2" />)
    await act(async () => { rejectUpdate(new Error('Write failed')); await Promise.resolve() })
    expect(mocks.showError).not.toHaveBeenCalled()
    expect(screen.getByRole('group', { name: 'habits.form.proposedByAstra' })).toBeInTheDocument()
  })

  it('offers Pro and Not now on the free rescue card without asking Astra', () => {
    openRescueGate()
    mocks.hasProAccess = false
    render(<HabitDetailScreen habitId="habit-1" />)
    const card = screen.getByText('habits.reschedule.freePrompt').parentElement!
    expect(screen.queryByRole('group', { name: 'habits.form.proposedByAstra' })).not.toBeInTheDocument()
    expect(within(card).queryByTestId('astra-glyph')).not.toBeInTheDocument()
    expect(within(card).getByTestId('badge')).toHaveTextContent('habits.detail.proGate')
    expect(Array.from(card.querySelectorAll<HTMLElement>('a, button')).map((button) => [button.textContent, button.dataset.variant, button.dataset.size])).toEqual([
      ['habits.reschedule.dismiss', 'ghost', 'sm'],
      ['habits.reschedule.upgrade', 'primary', 'sm'],
    ])
    expect(mocks.rescheduleOptions.length).toBeGreaterThan(0)
    expect(mocks.rescheduleOptions.every((options) => !options.enabled)).toBe(true)
    expect(within(card).getByRole('link', { name: 'habits.reschedule.upgrade' })).toHaveAttribute('href', '/upgrade')

    fireEvent.click(within(card).getByRole('button', { name: 'habits.reschedule.dismiss' }))
    expect(screen.queryByText('habits.reschedule.freePrompt')).not.toBeInTheDocument()
    expect(screen.getByText('habits.detail.slippingLine:9:0:50')).toBeVisible()
  })

  it('uses a primary action on narrow web and secondary on wide web', () => {
    openRescueGate()
    mocks.suggestion = { frequencyUnit: 'Day', frequencyQuantity: 1, dueDate: '2026-08-30', dueTime: null, days: [], rationale: 'Try tomorrow' }
    const narrow = render(<HabitDetailScreen habitId="habit-1" />)
    expect(screen.getByRole('button', { name: 'habits.detail.rescheduleAccept' })).toHaveAttribute('data-variant', 'primary')
    narrow.unmount()
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(min-width: 1024px)', addEventListener: () => {}, removeEventListener: () => {} }))
    const wide = render(<HabitDetailScreen habitId="habit-1" />)
    expect(screen.getByRole('button', { name: 'habits.detail.rescheduleAccept' })).toHaveAttribute('data-variant', 'secondary')
    wide.unmount()
    mocks.hasProAccess = false
    render(<HabitDetailScreen habitId="habit-1" />)
    expect(screen.getByRole('link', { name: 'habits.reschedule.upgrade' })).toHaveAttribute('data-variant', 'secondary')
  })

  it('capitalizes only the first letter of the visible month', () => {
    vi.setSystemTime(new Date(2026, 8, 28, 12))
    mocks.language = 'pt-BR'
    render(<HabitDetailScreen habitId="habit-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))
    expect(screen.getByText(personalText('Setembro de 2026'))).toBeVisible()
    expect(screen.getByLabelText('Atividade do hábito em setembro de 2026')).toBeInTheDocument()
  })

  it('keeps the drawn action row endings and opens sub-habit creation on free', () => {
    mocks.hasProAccess = false
    render(<HabitDetailScreen habitId="habit-1" />)
    const add = screen.getByTestId('list-row-habits.detail.addSubHabit')
    expect(add).toHaveAttribute('data-chevron', 'false')
    expect(add.querySelector('[data-testid="badge"]')).toBeNull()
    fireEvent.click(add)
    expect(mocks.routerPush).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Create habit' })).toBeVisible()
    expect(screen.getByTestId('list-row-habits.detail.delete')).toHaveAttribute('data-chevron', 'false')
  })

  it('explains an offline sub-habit request beside its detail action', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    try {
      render(<HabitDetailScreen habitId="habit-1" />)
      fireEvent.click(screen.getByTestId('list-row-habits.detail.addSubHabit'))
      expect(screen.getByText('offline.create.reason')).toBeVisible()
      expect(screen.queryByRole('dialog', { name: 'Create habit' })).toBeNull()
    } finally {
      Reflect.deleteProperty(navigator, 'onLine')
    }
  })

  it('returns a direct detail link to Today while the profile loads', () => {
    mocks.profileReady = false
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'common.backToToday' }))
    expect(mocks.routerPush).toHaveBeenCalledWith('/?date=2026-08-28')
    expect(mocks.routerBack).not.toHaveBeenCalled()
  })

  it('shows loading feedback and a retry action after a load failure', () => {
    mocks.detailLoading = true
    const view = render(<HabitDetailScreen habitId="habit-1" />)

    expect(screen.getAllByText('habits.detail.loading')).toHaveLength(2)
    expect(screen.getByRole('progressbar', { name: 'habits.detail.loading' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)

    mocks.detailLoading = false
    mocks.detailError = true
    view.rerender(<HabitDetailScreen habitId="habit-1" />)

    expect(screen.getByRole('alert')).toHaveTextContent('habits.detail.loadError')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.retry' }))
    expect(mocks.refetch).toHaveBeenCalledOnce()
  })

  it('moves focus from the fallback heading to the habit heading when data arrives', () => {
    mocks.detailLoading = true
    const view = render(<RouteContext><DestinationShell onCreate={() => {}}><HabitDetailScreen habitId="habit-1" /></DestinationShell></RouteContext>)
    const fallback = screen.getByRole('heading', { level: 1 })
    expect(document.title).toBe('habits.detail.screenTitle · Orbit')
    fallback.focus()
    mocks.detailLoading = false
    view.rerender(<RouteContext><DestinationShell onCreate={() => {}}><HabitDetailScreen habitId="habit-1" /></DestinationShell></RouteContext>)
    expect(screen.getByRole('heading', { level: 1, name: mocks.detail!.title })).toHaveFocus()
    expect(document.title).toBe(`${mocks.detail!.title} · Orbit`)
  })

  it('keeps a loaded habit name over the route fallback on locale and habit changes', () => {
    const view = render(<RouteContext><HabitDetailScreen habitId="habit-1" /></RouteContext>)
    expect(document.title).toBe(`${mocks.detail!.title} · Orbit`)
    mocks.language = 'pt-BR'
    view.rerender(<RouteContext><HabitDetailScreen habitId="habit-1" /></RouteContext>)
    expect(document.title).toBe(`${mocks.detail!.title} · Orbit`)
    mocks.pathname = '/habits/habit-2'
    mocks.detail = { ...mocks.detail!, id: 'habit-2' }
    view.rerender(<RouteContext><HabitDetailScreen habitId="habit-2" /></RouteContext>)
    expect(document.title).toBe(`${mocks.detail!.title} · Orbit`)
  })

  it.each(['habit', 'profile'])('replaces the hosted %s loading heading with the habit heading after a fresh load', (loading) => {
    mocks.profileReady = loading !== 'profile'
    mocks.detailLoading = loading === 'habit'
    const view = render(<DestinationShell onCreate={() => {}}><HabitDetailScreen habitId="habit-1" /></DestinationShell>)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    screen.getByRole('heading', { level: 1, name: 'habits.detail.screenTitle' }).focus()

    mocks.detailLoading = false
    mocks.profileReady = true
    view.rerender(<DestinationShell onCreate={() => {}}><HabitDetailScreen habitId="habit-1" /></DestinationShell>)

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: mocks.detail!.title })).toHaveFocus()
  })

  it('distinguishes an absent child from unavailable day habits and restores completion after retry', () => {
    const view = render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    expect(mocks.scopedCompleteDay).toBe(true)
    const child = screen.getByTestId('child-child-1')
    expect(child).toBeDisabled()
    expect(child).toHaveAttribute('data-completion-reason', 'calendar.dayCell.notScheduled')
    expect(child).toHaveAttribute('data-completion-status-unavailable', 'true')
    expect(screen.getByText('calendar.dayCell.notScheduled')).toBeVisible()

    mocks.scopedHabits.set('child-1', makeScopedChild('2026-08-28'))
    mocks.scopedLoading = true
    view.rerender(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    expect(child).toBeDisabled()
    expect(child).toHaveAttribute('data-completion-reason', 'habits.detail.dayHabitsLoading')
    expect(child).toHaveAttribute('data-completion-status-unavailable', 'true')
    expect(screen.getByText('habits.detail.dayHabitsLoading')).toBeVisible()
    expect(screen.getByTestId('detail-children')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: 'open-child-1' })).toBeEnabled()

    mocks.scopedLoading = false
    mocks.scopedError = true
    view.rerender(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    expect(child).toBeDisabled()
    expect(child).toHaveAttribute('data-completion-reason', 'habits.detail.dayHabitsLoadError')
    expect(child).toHaveAttribute('data-completion-status-unavailable', 'true')
    expect(screen.getByText('habits.detail.dayHabitsLoadError')).toBeVisible()
    expect(screen.getByRole('button', { name: 'habits.detail.retry' })).toHaveAttribute('data-variant', 'ghost')
    expect(screen.getByText('habits.detail.addSubHabit')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.retry' }))
    expect(mocks.scopedRefetch).toHaveBeenCalledOnce()
    expect(mocks.refetch).not.toHaveBeenCalled()
    expect(mocks.allHabitsRefetch).not.toHaveBeenCalled()

    mocks.scopedError = false
    view.rerender(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    expect(child).toBeEnabled()
    expect(child).toHaveAttribute('data-completion-status-unavailable', 'false')
    expect(screen.getByTestId('detail-children')).toHaveAttribute('aria-busy', 'false')
    expect(child).not.toHaveAttribute('data-completion-reason')
    expect(screen.queryByText('habits.detail.dayHabitsLoadError')).not.toBeInTheDocument()
  })

  it.each([false, true])('renders detail while the unrelated list is pending and then rejected, legacy=%s', (legacy) => {
    mocks.detail = legacy ? makeDetail() : makeEnrichedHabitDetail()
    mocks.allHabits.clear()
    mocks.allHabitsLoading = true
    const view = render(<RouteContext><HabitDetailScreen habitId="habit-1" /></RouteContext>)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(mocks.detail!.title)
    expect(document.title).toBe(`${mocks.detail!.title} · Orbit`)
    mocks.allHabitsLoading = false
    mocks.allHabitsError = true
    view.rerender(<RouteContext><HabitDetailScreen habitId="habit-1" /></RouteContext>)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(mocks.detail!.title)
    expect(screen.queryByText('habits.detail.loadError')).not.toBeInTheDocument()
    expect(mocks.allHabitsEnabled).toBe(legacy)
    expect(mocks.allHabitsRefetch).not.toHaveBeenCalled()
  })

  it.each(['UnbrokenToken'.repeat(24), 'A tag name with many words describing the people and activities I enjoy'])('discloses the full habit detail tag %s', (name) => {
    mocks.allHabits.set('habit-1', { ...makeScopedParent(), tags: [{ id: 'long-tag', name, color: '#808080' }] })
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    const tags = document.querySelector('[data-habit-detail-tags]')!
    const disclosure = within(tags as HTMLElement).getByRole('button', { name, expanded: false })
    fireEvent.click(disclosure)
    expect(within(tags as HTMLElement).getByRole('button', { name, expanded: true })).toBeInTheDocument()
    expect(tags.querySelector('[data-personal-text-expanded]')).not.toBeNull()
  })

  it('shows authoritative tags and moves linked goals into the inline details', () => {
    mocks.allHabits.set('habit-1', makeScopedParent())
    mocks.scopedHabits.set('habit-1', makeScopedParent())
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    expect(screen.getByText('Focus')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))
    expect(screen.getByRole('button', { name: 'Read more books' })).toBeVisible()
    expect(mocks.routerPush).not.toHaveBeenCalled()
  })

  it('keeps normalized nested tags visible without relationship controls', () => {
    mocks.detail = { ...makeDetail(), id: 'child-1', isBadHabit: true, children: [] }
    const normalized = normalizeHabitQueryData([makeTaggedNestedHabitScheduleItem()])
    mocks.allHabits = normalized.habitsById
    mocks.scopedHabits = normalized.habitsById
    render(<HabitDetailScreen habitId="child-1" date="2026-08-28" parentId="habit-1" />)

    expect(screen.getByText(personalText('Nested focus'))).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))
    expect(screen.queryByTestId('list-row-habits.detail.linkedGoals')).not.toBeInTheDocument()
    expect(screen.queryByTestId('list-row-habits.detail.slipAlert')).not.toBeInTheDocument()
  })

  it('moves to an older history month without rendering the removed history note', () => {
    mocks.detail = { ...makeDetail(), createdAtUtc: '2025-01-01T12:00:00Z' }
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))
    const previousMonth = screen.getByRole('button', { name: 'previousMonth' })
    for (let index = 0; index < 13; index += 1) fireEvent.click(previousMonth)

    expect(screen.getByText(personalText('July 2025'))).toBeInTheDocument()
    expect(screen.queryByText('olderHistoryUnavailable')).not.toBeInTheDocument()
  })

  it('pops child then parent history back to Today without duplicating the parent', () => {
    mocks.history = [
      { path: '/?date=2026-08-28', selectedDate: '2026-08-28' },
      { path: '/habits/parent-1?date=2026-08-28&from=today', selectedDate: '2026-08-28' },
      { path: '/habits/child-1?date=2026-08-28&parent=parent-1&from=today', selectedDate: '2026-08-28' },
    ]
    mocks.routerBack.mockImplementation(() => { mocks.history.pop() })
    const view = render(
      <HabitDetailScreen habitId="child-1" date="2026-08-28" parentId="parent-1" fromToday />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'common.backToParentHabit' }))
    expect(mocks.history.map((entry) => entry.path)).toEqual([
      '/?date=2026-08-28',
      '/habits/parent-1?date=2026-08-28&from=today',
    ])

    view.rerender(<HabitDetailScreen habitId="parent-1" date="2026-08-28" fromToday />)
    fireEvent.click(screen.getByRole('button', { name: 'common.backToToday' }))

    expect(mocks.history).toEqual([
      { path: '/?date=2026-08-28', selectedDate: '2026-08-28' },
    ])
    expect(mocks.routerPush).not.toHaveBeenCalled()
  })

  it.each([
    { unit: 'Month', origin: '2026-01-31', advanced: '2026-02-28', originalDay: 31, rejectedDay: 28 },
    { unit: 'Year', origin: '2024-02-29', advanced: '2025-02-28', originalDay: 29, rejectedDay: 28 },
  ])('keeps $unit strip and month history anchored after due date advancement', (example) => {
    vi.setSystemTime(new Date(`${example.origin}T12:00:00Z`))
    mocks.logs = []
    mocks.detail = habitDetailSchema.parse({ ...makeDetail(), children: [], days: [],
      createdAtUtc: `${example.origin.slice(0, 7)}-01T12:00:00Z`,
      frequencyUnit: example.unit, frequencyQuantity: 1, dueDate: example.origin,
      scheduledStartDate: example.origin })
    const view = render(<HabitDetailScreen habitId="habit-1" date={example.origin} />)
    expect(screen.getByTestId(`history-day-${example.originalDay}-inside`)).toHaveTextContent('none')
    expect(screen.getByTestId(`history-day-${example.rejectedDay}-inside`)).toHaveTextContent('not-scheduled')
    expect(screen.getByTestId('detail-strip').getAttribute('data-values')?.split(',').at(-1)).toBe('missed')
    mocks.detail = { ...mocks.detail, dueDate: example.advanced }
    view.rerender(<HabitDetailScreen habitId="habit-1" date={example.origin} />)
    expect(screen.getByTestId(`history-day-${example.originalDay}-inside`)).toHaveTextContent('none')
    expect(screen.getByTestId(`history-day-${example.rejectedDay}-inside`)).toHaveTextContent('not-scheduled')
    expect(screen.getByTestId('detail-strip').getAttribute('data-values')?.split(',').at(-1)).toBe('missed')
  })

  it.each([0, 1] as const)('maps interval weeks into history and strip with week start %i', (weekStartDay) => {
    mocks.weekStartDay = weekStartDay
    mocks.logs = []
    for (const example of [
      { unit: 'Month', date: '2026-02-28', dueDate: '2026-06-30', scheduled: true },
      { unit: 'Month', date: '2026-03-31', dueDate: '2026-06-30', scheduled: false },
      { unit: 'Month', date: '2026-05-31', dueDate: '2026-06-30', scheduled: weekStartDay === 0 },
      { unit: 'Week', date: '2026-02-14', dueDate: '2026-03-14', scheduled: true },
      { unit: 'Week', date: '2026-02-21', dueDate: '2026-03-14', scheduled: false },
    ]) {
      vi.setSystemTime(new Date(`${example.date}T12:00:00Z`))
      mocks.detail = habitDetailSchema.parse({ ...makeDetail(), children: [], days: [],
        createdAtUtc: '2026-01-01T12:00:00Z', frequencyUnit: example.unit, frequencyQuantity: 1,
        intervalWeeks: 2, scheduledStartDate: '2026-01-31', dueDate: example.dueDate })
      const view = render(<HabitDetailScreen habitId="habit-1" date={example.date} />)
      const day = Number(example.date.slice(-2))
      expect(screen.getByTestId(`history-day-${day}-inside`))
        .toHaveTextContent(example.scheduled ? 'none' : 'not-scheduled')
      expect(screen.getByTestId('detail-strip').getAttribute('data-values')?.split(',').at(-1))
        .toBe(example.scheduled ? 'missed' : 'not-scheduled')
      view.unmount()
    }
  })

  it.each([0, 1] as const)('agrees on Sunday bad-habit completion with week start %i', (weekStartDay) => {
    vi.setSystemTime(new Date('2026-03-01T12:00:00Z'))
    mocks.weekStartDay = weekStartDay
    mocks.realHeaderRing = true
    mocks.logs = []
    mocks.scopedHabits = new Map()
    mocks.detail = habitDetailSchema.parse({ ...makeDetail(), children: [], days: [],
      createdAtUtc: '2026-01-01T12:00:00Z', isBadHabit: true,
      frequencyUnit: 'Day', frequencyQuantity: 1, intervalWeeks: 2,
      scheduledStartDate: '2026-01-31', dueDate: '2026-03-09' })
    const view = render(<HabitDetailScreen habitId="habit-1" date="2026-03-01" />)
    const scheduled = weekStartDay === 1

    expect(screen.getByTestId('history-day-1-inside')).toHaveTextContent(scheduled ? 'full' : 'not-scheduled')
    expect(screen.getByTestId('detail-strip').getAttribute('data-values')?.split(',').at(-1))
      .toBe(scheduled ? 'done' : 'not-scheduled')
    const header = view.container.querySelector('[data-habit-detail-header-row]')!
    expect(header.querySelector('[data-status]')).toHaveAttribute('data-status', scheduled ? 'done' : 'empty')
  })

  it('reconciles an explicit-date log and unlog across the mounted detail', async () => {
    mocks.log.mockImplementation(({ date }: { habitId: string; date: string }) => {
      const existing = mocks.logs.some((entry) => entry.date === date)
      mocks.logs = existing
        ? mocks.logs.filter((entry) => entry.date !== date)
        : [...mocks.logs, { id: 'selected', date, value: 1, createdAtUtc: `${date}T12:00:00Z` }]
      mocks.metrics = { ...mocks.metrics, totalCompletions: existing ? 2 : 3 }
    })
    const view = render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    expect(screen.getByRole('button', { name: 'log' })).toHaveAttribute('data-logged', 'false')
    expect(screen.getByTestId('history-day-28-inside')).toHaveTextContent('none')
    expect(screen.queryByTestId('stat-totalCompletions')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'log' }))
    await act(async () => Promise.resolve())
    view.rerender(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    expect(screen.getByRole('button', { name: 'unlog' })).toHaveAttribute('data-logged', 'true')
    expect(screen.getByTestId('history-day-28-inside')).toHaveTextContent('full')

    fireEvent.click(screen.getByRole('button', { name: 'unlog' }))
    await act(async () => Promise.resolve())
    view.rerender(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    expect(screen.getByRole('button', { name: 'log' })).toHaveAttribute('data-logged', 'false')
    expect(screen.getByTestId('history-day-28-inside')).toHaveTextContent('none')
  })

  it('guards a repeated detail toggle while the accepted write is unfinalized', async () => {
    let releaseWrite: (() => void) | undefined
    mocks.log.mockReturnValue(new Promise<void>((resolve) => {
      releaseWrite = resolve
    }))
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    fireEvent.click(screen.getByRole('button', { name: 'log' }))
    fireEvent.click(screen.getByRole('button', { name: 'log' }))

    expect(mocks.log).toHaveBeenCalledOnce()
    await act(async () => {
      releaseWrite?.()
      await Promise.resolve()
    })
  })

  it('uses the selected date for recurring child completion and mutations', () => {
    mocks.scopedHabits.set('child-1', makeScopedChild('2026-08-29'))
    const view = render(<HabitDetailScreen habitId="habit-1" date="2026-08-29" />)
    expect(screen.getByTestId('child-child-1')).toHaveAttribute('data-state', 'done')

    mocks.scopedHabits.set('child-1', makeScopedChild('2026-08-28'))
    view.rerender(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    expect(screen.getByTestId('child-child-1')).toHaveAttribute('data-state', 'done')
    fireEvent.click(screen.getByTestId('child-child-1'))
    expect(mocks.log).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('confirm-habits.detail.logDateConfirmTitle'))
    expect(mocks.log).toHaveBeenLastCalledWith({
      habitId: 'child-1',
      date: '2026-08-28',
      intent: 'unlog',
    })
  })

  it('explains disabled completion in old-day detail and child rows', () => {
    mocks.scopedHabits.set('child-1', makeScopedChild('2026-08-19'))
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-19" />)

    expect(screen.getByRole('button', { name: 'log' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'log' }))
      .toHaveAttribute('data-disabled-reason', 'habits.todayBoundary.readOnly')
    expect(screen.getByTestId('child-child-1'))
      .toHaveAttribute('data-completion-reason', 'habits.todayBoundary.readOnly')
    expect(screen.getByText('habits.todayBoundary.readOnly')).toBeVisible()
  })

  it('uses the account day and disables completion after rollover while mounted', () => {
    mocks.timeZone = 'Pacific/Kiritimati'
    vi.setSystemTime(new Date('2026-08-29T12:00:00Z'))
    const view = render(<HabitDetailScreen habitId="habit-1" date="2026-08-23" />)
    expect(screen.getByRole('button', { name: 'log' })).toBeEnabled()
    vi.setSystemTime(new Date('2026-08-30T12:00:00Z'))
    view.rerender(<HabitDetailScreen habitId="habit-1" date="2026-08-23" />)
    expect(screen.getByRole('button', { name: 'log' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'log' })).toHaveAttribute('data-disabled-reason', 'habits.todayBoundary.readOnly')
    expect(screen.getByTestId('child-child-1')).toHaveAttribute('data-completion-read-only', 'true')
  })

  it.each(['log', 'unlog'] as const)('refuses stale detail %s and child log immediately after account midnight', (intent) => {
    mocks.timeZone = 'Pacific/Kiritimati'
    vi.setSystemTime(new Date('2026-08-30T09:59:59Z'))
    if (intent === 'unlog') mocks.logs.push({ id: 'selected', date: '2026-08-23', value: 1, createdAtUtc: '2026-08-23T12:00:00Z' })
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-23" />)
    expect(screen.getByRole('button', { name: intent })).toBeEnabled()

    vi.setSystemTime(new Date('2026-08-30T10:00:01Z'))
    fireEvent.click(screen.getByRole('button', { name: intent }))
    fireEvent.click(screen.getByTestId('child-child-1'))

    expect(mocks.log).not.toHaveBeenCalled()
  })

  it('refuses checklist completion confirmation after account midnight', async () => {
    mocks.timeZone = 'Pacific/Kiritimati'
    mocks.detail = { ...makeDetail(), checklistItems: [{ text: 'First', isChecked: false }] }
    mocks.checklist.mockResolvedValueOnce(undefined)
    vi.setSystemTime(new Date('2026-08-30T09:59:59Z'))
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-23" />)
    fireEvent.click(screen.getByRole('button', { name: 'toggle-checklist' }))
    await act(async () => Promise.resolve())
    expect(screen.getByTestId('confirm-habits.checklistCompleteTitle')).toBeInTheDocument()

    vi.setSystemTime(new Date('2026-08-30T10:00:01Z'))
    fireEvent.click(screen.getByTestId('confirm-habits.checklistCompleteTitle'))
    expect(mocks.log).not.toHaveBeenCalled()
  })

  it('announces full dates for logged and unlogged history cells and keeps the log time', () => {
    mocks.language = 'en'
    mocks.uses24HourClock = true
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    const loggedCell = screen.getByTestId('history-day-26-inside')
    const unloggedCell = screen.getByTestId('history-day-28-inside')
    const loggedTime = formatLocaleDateTime('2026-08-26T12:00:00Z', 'en', { hour: 'numeric', minute: '2-digit', hourCycle: 'h23' })
    expect(loggedCell).toHaveAccessibleName(/Wednesday, August 26, 2026/)
    expect(loggedCell.getAttribute('aria-label')).toContain(loggedTime)
    expect(unloggedCell).toHaveAccessibleName('Friday, August 28, 2026')
  })

  it('announces logged time in 12-hour format under a 24-hour locale', () => {
    mocks.language = 'pt-BR'
    mocks.uses24HourClock = false
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    const loggedTime = formatLocaleDateTime('2026-08-26T12:00:00Z', 'pt-BR', { hour: 'numeric', minute: '2-digit', hourCycle: 'h12' })
    expect(screen.getByTestId('history-day-26-inside').getAttribute('aria-label')).toContain(loggedTime)
  })

  it.each(['2026-08-29', '2026-08-28'])(
    'renders a logged general child done and unlogs it on %s',
    (date) => {
      mocks.scopedHabits.set('child-1', makeLoggedGeneralChild())
      render(<HabitDetailScreen habitId="habit-1" date={date} />)

      const child = screen.getByRole('button', { name: 'unlog-child' })
      expect(child).toHaveAttribute('data-state', 'done')
      expect(child).toHaveAttribute('data-can-log', 'true')
      expect(child).toHaveAttribute('data-completion-read-only', 'false')

      fireEvent.click(child)
      if (date < '2026-08-29') {
        expect(mocks.log).not.toHaveBeenCalled()
        fireEvent.click(screen.getByTestId('confirm-habits.detail.logDateConfirmTitle'))
      }
      expect(mocks.log).toHaveBeenLastCalledWith({ habitId: 'child-1', date, intent: 'unlog' })
    },
  )
  it('keeps the empty live region within the header block without a separate column slot', () => {
    const { container } = render(<HabitDetailScreen habitId="habit-1" />)
    const column = container.querySelector('[data-habit-detail-content]')!
    const header = column.querySelector('header')!
    const checklist = screen.getByTestId('habit-checklist')
    const headerBlock = Array.from(column.children).find((slot) => slot.contains(header))!
    expect(headerBlock.nextElementSibling).toBe(checklist)
    const region = headerBlock.querySelector('[role="status"][aria-live="polite"]')
    expect(region).not.toBeNull()
    expect(region).toBeEmptyDOMElement()
    expect(column.querySelector(':scope > [role="status"]')).toBeNull()
  })

  it('keeps the description expanded while selecting its text', async () => {
    const description = 'A note worth selecting'
    mocks.detail = { ...makeDetail(), description }
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<HabitDetailScreen habitId="habit-1" />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'habits.detail.copyDescription' })) })
    expect(screen.getByText('habits.detail.copyFailed')).toBeInTheDocument()
    const text = document.getElementById('habit-description')!
    expect(text.closest('button')).toBeNull()
    const selection = document.getSelection()!
    try {
      fireEvent.pointerDown(text, { pointerType: 'touch' })
      selection.selectAllChildren(text)
      fireEvent.pointerUp(text, { pointerType: 'touch' })
      fireEvent.click(text, { detail: 1 })
      expect(text).toBeVisible()
      expect(selection.toString()).toBe(description)
      selection.collapse(text, 0)
      fireEvent.pointerDown(text, { pointerType: 'touch' })
      selection.selectAllChildren(text)
      fireEvent.pointerUp(text, { pointerType: 'touch' })
      fireEvent.click(text, { detail: 1 })
      expect(text).toBeVisible()
      expect(selection.toString()).toBe(description)
      expect(document.getElementById('habit-description')).toHaveTextContent(description)
    } finally {
      selection.removeAllRanges()
    }
  })

  it('copies the full description from habit details', async () => {
    const description = '**A full note**\n\n' + 'Long description. '.repeat(100)
    mocks.detail = { ...makeDetail(), description }
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<HabitDetailScreen habitId="habit-1" />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'habits.detail.copyDescription' })) })
    expect(writeText).toHaveBeenCalledWith(description)
  })

  it('keeps the complete plain description visible with independent safe absolute links', () => {
    const description = '  **Read** <b>this</b>\n\nhttps://example.com/notes?q=one&next=two\nhttps://example.com/a%20b?q=%23value\nhttp://example.org/' + 'long'.repeat(100) + '\nDone.'
    mocks.detail = { ...makeDetail(), description }
    render(<HabitDetailScreen habitId="habit-1" />)
    const prose = document.getElementById('habit-description')!
    expect(prose.textContent).toBe(description)
    expect(prose).toBeVisible()
    expect(prose.closest('button')).toBeNull()
    expect(prose.querySelector('b, img, [aria-expanded]')).toBeNull()
    const links = within(prose).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(description.match(/https?:\/\/\S+/g))
    for (const link of links) {
      expect(link).toHaveAttribute('href', link.textContent)
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      expect(link).toHaveAccessibleName(link.textContent!)
      link.focus()
      expect(link).toHaveFocus()
    }
  })

  it('keeps unsafe and malformed description destinations inert', () => {
    const description = 'javascript:alert(1) data:text/html,hello mailto:person@example.com orbit://habit //example.com https:///example.com https://bad%20host https://example.com:wrong javascript:https://example.com https://example.com\\path https://example.com/%zz' + " javascript:alert('https://example.com') data:text/plain,(https://example.com) orbit:open(https://example.com)"
    mocks.detail = { ...makeDetail(), description }
    render(<HabitDetailScreen habitId="habit-1" />)
    const prose = document.getElementById('habit-description')!
    expect(prose.textContent).toBe(description)
    expect(within(prose).queryAllByRole('link')).toHaveLength(0)
  })

  it.each([[false, false], [true, false], [false, true], [true, true]])('places optional tags (%s) and description (%s) below the header row', (hasTags, hasDescription) => {
    mocks.allHabits.set('habit-1', { ...makeScopedParent(), tags: hasTags ? makeScopedParent().tags : [] })
    mocks.detail = { ...makeDetail(), description: hasDescription ? 'A note about this routine' : null }
    const { container } = render(<HabitDetailScreen habitId="habit-1" />)
    const header = container.querySelector('[data-habit-detail-content] header')!
    const row = header.querySelector('[data-habit-detail-header-row]')!
    const metadata = Array.from(header.children).slice(1)
    expect(metadata).toHaveLength(Number(hasTags) + Number(hasDescription))
    expect(row).not.toHaveTextContent('Focus')
    expect(row).not.toHaveTextContent('A note about this routine')
    expect(header.querySelector('[data-habit-detail-tags]') !== null).toBe(hasTags)
    expect(header.querySelector('[data-habit-detail-description]') !== null).toBe(hasDescription)
    if (hasDescription) {
      const prose = document.getElementById('habit-description')!
      expect(prose).toBeVisible()
      expect(prose).toHaveTextContent('A note about this routine')
      expect(prose.closest('button')).toBeNull()
    }
  })

  it('keeps a populated completion boundary inside the header block', () => {
    const { container } = render(<HabitDetailScreen habitId="habit-1" date="2026-08-30" />)
    const column = container.querySelector('[data-habit-detail-content]')!
    const headerBlock = column.firstElementChild!
    expect(headerBlock).toHaveTextContent('habits.todayBoundary.future')
    expect(headerBlock.nextElementSibling).toBe(screen.getByTestId('habit-checklist'))
    expect(headerBlock.querySelector('[role="status"][aria-live="polite"]')).toBeEmptyDOMElement()
  })

  it('sizes the 30-day strip from its content column without horizontal scrolling', () => {
    render(<HabitDetailScreen habitId="habit-1" />)
    const strip = screen.getByTestId('detail-strip')
    expect(strip).toHaveAttribute('data-days', '30')
    expect(strip).toHaveAttribute('data-size', '16')
    expect(strip.closest('section')).toHaveStyle({ containerType: 'inline-size' })
    expect(strip.closest('section')).not.toHaveClass('bg-[var(--bg-card)]')
    expect(strip.parentElement).not.toHaveClass('overflow-x-auto')
  })

  it.each([
    ['pt-BR', false, '7:30 PM', '19:30'],
    ['en', true, '19:30', '7:30 PM'],
  ])('uses %s and the saved clock in the header and time row', (language, uses24HourClock, expected, excluded) => {
    mocks.language = language
    mocks.uses24HourClock = uses24HourClock
    mocks.detail = { ...makeDetail(), dueTime: '19:30' }
    const view = render(<HabitDetailScreen habitId="habit-1" />)
    const header = view.container.querySelector('[data-habit-detail-content] header')
    expect(header).toHaveTextContent(expected)
    expect(header).not.toHaveTextContent(excluded)
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))
    expect(screen.queryByLabelText('habits.form.exactTime')).toBeNull()
  })

  it.each([false, true])('keeps the whole type below the full detail title, task: %s', (task) => {
    mocks.detail = { ...makeDetail(), title: 'A complete title with enough words to occupy the available width', frequencyUnit: task ? null : 'Day', frequencyQuantity: task ? null : 1 }
    const view = render(<HabitDetailScreen habitId="habit-1" />)
    const type = view.container.querySelector('[data-habit-detail-type]')!
    expect(type.textContent).toBe(task ? 'habits.rowTypeTask' : 'habits.form.typeHabit')
    expect(type.previousElementSibling?.textContent).toBe(mocks.detail.title)
    expect(type).not.toHaveClass('text-ellipsis', 'whitespace-nowrap')
  })

  it('shows only the due time for a habit without a frequency', () => {
    mocks.detail = { ...makeDetail(), frequencyUnit: null, frequencyQuantity: null, dueTime: '08:00' }
    const view = render(<HabitDetailScreen habitId="habit-1" />)
    const summary = view.container.querySelector('[data-habit-detail-content] header p:not([data-habit-detail-type])')
    expect(summary?.textContent).toBe('8:00 AM')
  })

  it('omits the summary element when there is no frequency or due time', () => {
    mocks.detail = { ...makeDetail(), frequencyUnit: null, frequencyQuantity: null, dueTime: null }
    const view = render(<HabitDetailScreen habitId="habit-1" />)
    expect(view.container.querySelector('[data-habit-detail-content] header p:not([data-habit-detail-type])')).toBeNull()
  })

  it('omits the empty read-only schedule row for a habit without a frequency', () => {
    mocks.detail = { ...makeDetail(), frequencyUnit: null, frequencyQuantity: null }
    render(<HabitDetailScreen habitId="habit-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))
    expect(screen.queryByTestId('list-row-habits.detail.schedule')).toBeNull()
  })



  it.each(['', 'My draft'])('opens Astra about the habit and preserves an existing draft %s', (draft) => {
    useChatStore.getState().setDraft(draft)
    useChatStore.getState().setContextualSuggestion(null)
    useUIStore.getState().setAstraConversationOpen(false)
    render(<HabitDetailScreen habitId="habit-1" />)
    const astraAction = screen.getByRole('button', { name: 'habits.detail.askAstra' })
    expect(astraAction).toHaveTextContent('habits.detail.askAstra')
    fireEvent.click(astraAction)
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
    const prompt = 'habits.detail.askAstraSeedDefault:{"title":"Read"}'
    if (draft) {
      expect(useChatStore.getState().draft).toBe(draft)
      expect(useChatStore.getState().contextualSuggestion).toMatchObject({ id: 'habit-detail:habit-1', prompt })
    } else expect(useChatStore.getState().draft).toBe(prompt)
  })

  it('contains a log failure without showing a second error', async () => {
    mocks.log.mockRejectedValueOnce(new Error('log failed'))
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    fireEvent.click(screen.getByRole('button', { name: 'log' }))

    await act(async () => { await Promise.resolve() })
    expect(mocks.showError).not.toHaveBeenCalled()
  })

  it('asks before logging a date before the habit existed', async () => {
    expect(en.habits.detail.logDateConfirmMessage).toBe('This logs {name} on {date}.')
    mocks.detail = { ...makeDetail(), createdAtUtc: '2026-08-28T12:00:00Z' }
    mocks.logs = []
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-27" />)
    fireEvent.click(screen.getByRole('button', { name: 'log' }))
    expect(mocks.log).not.toHaveBeenCalled()
    expect(screen.getByTestId('confirm-habits.detail.logDateConfirmTitle')).toHaveAttribute('data-message', expect.stringContaining('August 27, 2026'))
    expect(screen.getByTestId('confirm-habits.detail.logDateConfirmTitle')).toHaveAttribute('data-message', expect.stringContaining('Read'))
    expect(screen.getByTestId('confirm-habits.detail.logDateConfirmTitle')).toHaveAttribute('data-confirm-label', 'habits.detail.logDateConfirmLog')
    fireEvent.click(screen.getByTestId('confirm-habits.detail.logDateConfirmTitle'))
    await act(async () => Promise.resolve())
    expect(mocks.log).toHaveBeenCalledWith({ habitId: 'habit-1', date: '2026-08-27', intent: 'log' })
  })

  it('names the undo action when confirming an unusual unlog date', () => {
    expect(en.habits.detail.logDateConfirmUnlogMessage).toBe('This undoes the log for {name} on {date}.')
    mocks.detail = { ...makeDetail(), createdAtUtc: '2026-08-28T12:00:00Z' }
    mocks.logs = [{ id: 'selected', date: '2026-08-27', value: 1, createdAtUtc: '2026-08-27T12:00:00Z' }]
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-27" />)
    fireEvent.click(screen.getByRole('button', { name: 'unlog' }))
    expect(screen.getByTestId('confirm-habits.detail.logDateConfirmTitle')).toHaveAttribute('data-message', 'Undo Read: August 27, 2026')
    expect(screen.getByTestId('confirm-habits.detail.logDateConfirmTitle')).toHaveAttribute('data-confirm-label', 'habits.detail.logDateConfirmUnlog')
    expect(mocks.log).not.toHaveBeenCalled()
  })

  it('confirms a child date when its creation time is unavailable from the schedule', async () => {
    const schedule = makeHabitScheduleItem({ createdAtUtc: '2026-08-01T12:00:00Z' })
    mocks.scopedHabits = normalizeHabitQueryData([schedule]).habitsById
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    fireEvent.click(screen.getByTestId('child-child-1'))
    expect(mocks.log).not.toHaveBeenCalled()
    expect(screen.getByTestId('confirm-habits.detail.logDateConfirmTitle')).toHaveAttribute('data-message', expect.stringContaining('August 28, 2026'))
    fireEvent.click(screen.getByTestId('confirm-habits.detail.logDateConfirmTitle'))
    await act(async () => Promise.resolve())
    expect(mocks.log).toHaveBeenCalledWith({ habitId: 'child-1', date: '2026-08-28', intent: 'log' })
  })

  it('blocks a child date before its own creation despite an earlier parent and due date', () => {
    const schedule = makeHabitScheduleItem({
      createdAtUtc: '2026-08-01T12:00:00Z',
      children: [{ ...makeHabitScheduleItem().children[0]!, createdAtUtc: '2026-08-29T08:00:00Z' }],
    })
    mocks.scopedHabits = normalizeHabitQueryData([schedule]).habitsById
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    fireEvent.click(screen.getByTestId('child-child-1'))
    expect(mocks.log).not.toHaveBeenCalled()
    expect(screen.queryByTestId('confirm-habits.detail.logDateConfirmTitle')).not.toBeInTheDocument()
    expect(screen.getByTestId('child-child-1').parentElement?.parentElement).toHaveTextContent('habits.detail.logDateUnavailable')
  })

  it('unlogs a previously saved child date before its own creation', async () => {
    mocks.scopedHabits.set('child-1', {
      ...makeScopedChild('2026-08-28'),
      createdAtUtc: '2026-08-29T08:00:00Z',
      createdAtUtcIsInherited: false,
      isCompleted: true,
    })
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    fireEvent.click(screen.getByRole('button', { name: 'unlog-child' }))
    expect(mocks.log).not.toHaveBeenCalled()
    expect(screen.getByTestId('confirm-habits.detail.logDateConfirmTitle')).toHaveAttribute('data-confirm-label', 'habits.detail.logDateConfirmUnlog')
    expect(screen.getByTestId('confirm-habits.detail.logDateConfirmTitle')).toHaveAttribute('data-message', 'habits.detail.logDateConfirmPermanentUnlogMessage')
    expect(en.habits.detail.logDateConfirmPermanentUnlogMessage).toBe('This removes the log for {name} on {date}. It cannot be undone.')
    expect(ptBR.habits.detail.logDateConfirmPermanentUnlogMessage).toBe('Isso remove o registro de {name} em {date}. Não dá para desfazer.')
    fireEvent.click(screen.getByTestId('confirm-habits.detail.logDateConfirmTitle'))
    await act(async () => Promise.resolve())
    expect(mocks.log).toHaveBeenCalledWith({ habitId: 'child-1', date: '2026-08-28', intent: 'unlog' })
    expect(screen.queryByText('habits.detail.logDateUnavailable')).not.toBeInTheDocument()
  })

  it('keeps a precreation child log when permanent removal is canceled', () => {
    mocks.scopedHabits.set('child-1', {
      ...makeScopedChild('2026-08-28'),
      createdAtUtc: '2026-08-29T08:00:00Z',
      createdAtUtcIsInherited: false,
      isCompleted: true,
    })
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    fireEvent.click(screen.getByRole('button', { name: 'unlog-child' }))
    expect(screen.getByTestId('confirm-habits.detail.logDateConfirmTitle')).toHaveAttribute('data-message', 'habits.detail.logDateConfirmPermanentUnlogMessage')
    fireEvent.click(screen.getByTestId('cancel-habits.detail.logDateConfirmTitle'))

    expect(screen.queryByTestId('confirm-habits.detail.logDateConfirmTitle')).not.toBeInTheDocument()
    expect(mocks.log).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'unlog-child' }))
    expect(screen.getByTestId('confirm-habits.detail.logDateConfirmTitle')).toHaveAttribute('data-message', 'habits.detail.logDateConfirmPermanentUnlogMessage')
  })

  it.each([
    ['child-1', 'habit-1'],
    ['grandchild-1', 'child-1'],
  ])('blocks a direct %s detail log before its own creation', (targetId, parentId) => {
    const schedule = makeHabitScheduleItem()
    const child = schedule.children[0]!
    schedule.children = [{ ...child, createdAtUtc: '2026-08-29T08:00:00Z', children: [{ ...child, id: 'grandchild-1', createdAtUtc: '2026-08-29T08:00:00Z', children: [] }] }]
    mocks.allHabits = normalizeHabitQueryData([schedule]).habitsById
    mocks.detail = { ...makeDetail(), id: targetId, createdAtUtc: '2026-08-29T08:00:00Z', children: [] }
    const { container } = render(<HabitDetailScreen habitId={targetId} parentId={parentId} date="2026-08-28" />)
    const region = container.querySelector('[role="status"][aria-live="polite"]')!
    expect(region).toBeEmptyDOMElement()
    fireEvent.click(screen.getByRole('button', { name: 'log' }))
    expect(mocks.log).not.toHaveBeenCalled()
    expect(screen.queryByTestId('confirm-habits.detail.logDateConfirmTitle')).not.toBeInTheDocument()
    expect(container.querySelector('[role="status"][aria-live="polite"]')).toBe(region)
    expect(region).toHaveTextContent('habits.detail.logDateUnavailable')
  })

  it('logs a child date after its own creation without confirmation', async () => {
    const schedule = makeHabitScheduleItem({
      createdAtUtc: '2026-08-01T12:00:00Z',
      children: [{ ...makeHabitScheduleItem().children[0]!, createdAtUtc: '2026-08-27T08:00:00Z' }],
    })
    mocks.scopedHabits = normalizeHabitQueryData([schedule]).habitsById
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    fireEvent.click(screen.getByTestId('child-child-1'))
    await act(async () => Promise.resolve())
    expect(mocks.log).toHaveBeenCalledWith({ habitId: 'child-1', date: '2026-08-28', intent: 'log' })
    expect(screen.queryByTestId('confirm-habits.detail.logDateConfirmTitle')).not.toBeInTheDocument()
  })

  it('replaces checklist confirmation with the unusual-date confirmation', async () => {
    mocks.logs = []
    mocks.detail = { ...makeDetail(), createdAtUtc: '2026-08-28T12:00:00Z', checklistItems: [{ text: 'First', isChecked: false }] }
    mocks.checklist.mockResolvedValue(undefined)
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-27" />)
    fireEvent.click(screen.getByRole('button', { name: 'toggle-checklist' }))
    await act(async () => Promise.resolve())
    fireEvent.click(screen.getByTestId('confirm-habits.checklistCompleteTitle'))
    await act(async () => Promise.resolve())
    expect(screen.queryByTestId('confirm-habits.checklistCompleteTitle')).not.toBeInTheDocument()
    expect(screen.getByTestId('confirm-habits.detail.logDateConfirmTitle')).toBeInTheDocument()
    expect(mocks.log).not.toHaveBeenCalled()
  })

  it('contains and reports a checklist failure', async () => {
    mocks.detail = { ...makeDetail(), checklistItems: [{ text: 'First', isChecked: false }] }
    mocks.checklist.mockRejectedValueOnce(new Error('checklist failed'))
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    fireEvent.click(screen.getByRole('button', { name: 'toggle-checklist' }))

    await act(async () => { await Promise.resolve() })
    expect(mocks.showError).toHaveBeenCalledWith('habits.detail.checklistError')
    expect(screen.queryByTestId('confirm-habits.checklistCompleteTitle')).not.toBeInTheDocument()
  })

  it('offers to log the habit after its last checklist item is completed', async () => {
    mocks.detail = { ...makeDetail(), checklistItems: [{ text: 'First', isChecked: false }] }
    mocks.checklist.mockResolvedValueOnce(undefined)
    mocks.log.mockResolvedValueOnce(undefined)
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    fireEvent.click(screen.getByRole('button', { name: 'toggle-checklist' }))
    await act(async () => Promise.resolve())

    expect(mocks.checklist).toHaveBeenCalledWith({
      habitId: 'habit-1',
      items: [{ text: 'First', isChecked: true }],
    })
    fireEvent.click(screen.getByTestId('confirm-habits.checklistCompleteTitle'))
    await act(async () => Promise.resolve())

    expect(mocks.log).toHaveBeenCalledWith({
      habitId: 'habit-1',
      date: '2026-08-28',
      intent: 'log',
    })
    expect(screen.queryByTestId('confirm-habits.checklistCompleteTitle')).not.toBeInTheDocument()
  })

  it('keeps checklist edits without offering old-day completion', async () => {
    mocks.detail = { ...makeDetail(), checklistItems: [{ text: 'First', isChecked: false }] }
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-19" />)

    fireEvent.click(screen.getByRole('button', { name: 'toggle-checklist' }))
    await act(async () => Promise.resolve())

    expect(mocks.checklist).toHaveBeenCalledWith({
      habitId: 'habit-1',
      items: [{ text: 'First', isChecked: true }],
    })
    expect(screen.queryByTestId('confirm-habits.checklistCompleteTitle')).not.toBeInTheDocument()
    expect(mocks.log).not.toHaveBeenCalled()
  })

  it('deletes a sub habit without leaving the parent detail', async () => {
    mocks.deleteHabit.mockResolvedValueOnce(undefined)
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    fireEvent.click(screen.getByRole('button', { name: 'delete-child-1' }))
    fireEvent.click(screen.getByTestId('confirm-habits.deleteConfirmTitle'))
    await act(async () => Promise.resolve())

    expect(mocks.deleteHabit).toHaveBeenCalledWith('child-1')
    expect(screen.queryByTestId('confirm-habits.deleteConfirmTitle')).not.toBeInTheDocument()
    expect(mocks.routerPush).not.toHaveBeenCalled()
  })

  it('deletes the habit and returns to the selected day', async () => {
    mocks.deleteHabit.mockResolvedValueOnce(undefined)
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.delete' }))
    fireEvent.click(screen.getByTestId('confirm-habits.deleteConfirmTitle'))
    await act(async () => Promise.resolve())

    expect(mocks.deleteHabit).toHaveBeenCalledWith('habit-1')
    expect(mocks.routerPush).toHaveBeenCalledWith('/?date=2026-08-28')
  })

  it('does not route the next account after an old delete completes', async () => {
    vi.stubGlobal('fetch', vi.fn())
    holdAccount('user-1')
    let finishDelete!: () => void
    mocks.deleteHabit.mockImplementationOnce(() => new Promise<void>((resolve) => { finishDelete = resolve }))
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.delete' }))
    fireEvent.click(screen.getByTestId('confirm-habits.deleteConfirmTitle'))
    expect(mocks.deleteHabit).toHaveBeenCalledOnce()

    await replaceAccountWith('user-2')
    await act(async () => { finishDelete() })

    expect(mocks.routerPush).not.toHaveBeenCalled()
  })

  it('leaves habit detail suggestions to the shell composer', () => {
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    expect(useChatStore.getState().contextualSuggestion).toBeNull()
    expect(mocks.routerPush).not.toHaveBeenCalled()
  })

  it('keeps delete confirmation open and reports a delete failure', async () => {
    mocks.deleteHabit.mockRejectedValueOnce(new Error('delete failed'))
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.delete' }))
    fireEvent.click(screen.getByTestId('confirm-habits.deleteConfirmTitle'))

    await act(async () => { await Promise.resolve() })
    expect(mocks.showError).toHaveBeenCalledWith('habits.detail.deleteError')
    expect(screen.getByTestId('confirm-habits.deleteConfirmTitle')).toBeInTheDocument()
  })

  it('contains and reports a reschedule failure', async () => {
    openRescueGate()
    mocks.suggestion = {
      frequencyUnit: 'Day',
      frequencyQuantity: 1,
      dueDate: '2026-08-30',
      dueTime: null,
      days: [],
      rationale: 'Try tomorrow',
    }
    mocks.update.mockRejectedValueOnce(new Error('reschedule failed'))
    render(<HabitDetailScreen habitId="habit-1" />)

    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.rescheduleAccept' }))

    await act(async () => { await Promise.resolve() })
    expect(mocks.showError).toHaveBeenCalledWith('habits.detail.rescheduleWriteError')
    expect(screen.getByRole('group', { name: 'habits.form.proposedByAstra' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'habits.detail.rescheduleAccept' })).toBeInTheDocument()
  })

  it.each([true, false])('shows a present monthly child as unavailable with skipped=%s', (skipped) => {
    const date = '2026-08-28'
    const schedule = makeMonthlyChildDaySchedule(date, '2026-09-28')
    schedule.children[0]!.isSkippedOnDate = skipped
    mocks.detail = { ...makeDetail(), frequencyUnit: 'Month', days: [], children: schedule.children }
    mocks.scopedHabits = normalizeHabitQueryData([schedule]).habitsById
    mocks.logs = []
    mocks.realChildRows = true
    const { container } = render(<HabitDetailScreen habitId="habit-1" date={date} />)
    const rows = within(screen.getByTestId('detail-children')).getAllByTestId('habit-row')
    const skippedRow = rows[0]!
    expect(within(skippedRow.querySelector('[data-habit-row-meta]')!).getByText(skipped ? 'habits.statusDot.skip' : 'calendar.dayCell.notScheduled')).toBeVisible()
    expect(skippedRow.querySelector('[data-status="empty"]')).toBeNull()
    expect(skippedRow.querySelector('[data-status="unavailable"]')).toBeInTheDocument()
    const toggle = within(skippedRow).getByTestId('habit-status-toggle')
    expect(toggle).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(toggle)
    expect(mocks.log).not.toHaveBeenCalled()
    expect(rows[1]!.querySelector('[data-status="done"]')).toBeInTheDocument()
    fireEvent.click(container.querySelector('[data-habit-detail-header-row] button[data-logged]')!)
    expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({ habitId: 'habit-1', date }))
  })

  it('composes integrated metadata from the detail child list records', () => {
    mocks.realChildRows = true
    const checklistItems = [{ text: 'Page', isChecked: true }, { text: 'Page', isChecked: false }]
    mocks.detail = { ...makeDetail(), children: makeDetail().children.map((child) => ({ ...child, checklistItems })) }
    mocks.scopedHabits.set('child-1', { ...makeScopedChild('2026-08-28'), checklistItems })
    const { container } = render(<HabitDetailScreen habitId="habit-1" />)
    const row = container.querySelector('[data-testid="detail-children"] [data-testid="habit-row"]')!
    const meta = row.querySelector('[data-habit-row-meta]')!
    expect(meta.firstElementChild?.querySelector('[data-habit-row-type]')).not.toBeNull()
    expect(meta.querySelector('[data-habit-row-checklist]')?.textContent).toBe('1/2')
    expect(row.querySelectorAll('[data-habit-row-type]')).toHaveLength(1)
  })

  describe('drawn detail geometry', () => {
    let browserLaunch: BrowserLaunch | undefined
    let browser: Browser
    let stylesheet: string
    registerChromeLaunchHook(beforeAll, async (launch) => {
      browserLaunch = launch
      browser = await launch
    })
    beforeAll(async () => {
      const source = resolve(process.cwd(), 'app/globals.css')
      stylesheet = (await postcss([tailwind()]).process(readFileSync(source, 'utf8'), { from: source })).css
    })
    afterAll(async () => { await closeChrome(browserLaunch) }, 30_000)

    it.each([320, 412])('keeps not-due child status inside the card at 200 percent text at %ipx', async (width) => {
      vi.useRealTimers()
      mocks.realChildRows = true
      mocks.realChildStatusCopy = true
      const schedule = makeMonthlyChildDaySchedule('2026-08-28', '2026-09-28')
      schedule.children[0]!.isSkippedOnDate = false
      mocks.detail = { ...makeDetail(), children: schedule.children }
      mocks.scopedHabits = normalizeHabitQueryData([schedule]).habitsById
      document.documentElement.style.fontSize = '32px'
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      try {
        const { container } = render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
        await page.setContent(`<style>${stylesheet}:root { font-size:32px; --font-geist-mono: "Geist Mono" }</style>${container.innerHTML}`)
        await loadAppFonts(page)
        const bounds = await page.locator('[data-habit-id="child-1"] [data-habit-row-meta-token]').evaluateAll((tokens) => tokens.map((token) => {
          const card = token.closest('[data-testid="habit-row"]')!.getBoundingClientRect()
          const box = token.getBoundingClientRect()
          return { right: card.right - box.right, bottom: card.bottom - box.bottom }
        }))
        for (const token of bounds) {
          expect(token.right).toBeGreaterThanOrEqual(0)
          expect(token.bottom).toBeGreaterThanOrEqual(0)
        }
      } finally {
        document.documentElement.style.removeProperty('font-size')
        await page.close()
      }
    })

    it.each([320, 412, 840])('retains every history branch and loading disc allocation at %ipx', async (width) => {
      mocks.realHistory = true
      vi.useRealTimers()
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(2026, 7, 12, 12))
      mocks.detail = { ...makeDetail(), createdAtUtc: '2025-01-01T12:00:00Z' }
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      const snapshots = []
      try {
        for (const loading of [true, false]) {
          mocks.detailLoading = loading
          const view = render(<HabitDetailScreen habitId="habit-1" />)
          if (!loading) fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))
          await page.setContent(`<style>${stylesheet}</style>${view.container.innerHTML}`)
          const measure = () => page.getByTestId('month-grid-days').evaluate(grid => {
            const origin = grid.getBoundingClientRect()
            const slots = [...grid.children].map((slot, index) => {
              const bounds = slot.getBoundingClientRect()
              const mark = slot.querySelector('[data-day-circle], [data-day-history-numeral], [data-variant="grid"] span')
              const range = document.createRange(); range.selectNodeContents(slot)
              const visual = (mark ?? range).getBoundingClientRect()
              const column = index % 7
              const allocated = Math.min(44, bounds.width)
              const expected = bounds.left + (bounds.width - allocated) / 2 + 17 + (allocated - 34) * column / 6
              return { x: visual.left + visual.width / 2 - origin.left, y: visual.top + visual.height / 2 - origin.top,
                delta: Math.abs(visual.left + visual.width / 2 - expected), width: visual.width, height: visual.height }
            })
            return { slots, future: grid.querySelectorAll('[aria-label*="futureWord"]').length, unavailable: grid.querySelectorAll('[aria-label*="unavailableWord"]').length }
          })
          const geometry = await measure()
          for (const slot of geometry.slots) {
            expect(slot.width).toBe(34); expect(slot.height).toBe(34)
            expect(slot.delta).toBeLessThanOrEqual(0.5)
          }
          snapshots.push(geometry.slots.slice(0, 7))
          if (!loading) {
            expect(geometry.future).toBeGreaterThan(0)
            for (let month = 0; month < 13; month++) fireEvent.click(screen.getByRole('button', { name: 'previousMonth' }))
            await page.setContent(`<style>${stylesheet}</style>${view.container.innerHTML}`)
            const older = await measure()
            expect(older.unavailable).toBeGreaterThan(0)
            for (const slot of older.slots) { expect(slot.width).toBe(34); expect(slot.height).toBe(34); expect(slot.delta).toBeLessThanOrEqual(0.5) }
          }
          view.unmount()
        }
        for (const [index, before] of snapshots[0]!.entries()) {
          const after = snapshots[1]![index]!
          expect(before.x).toBeCloseTo(after.x, 1); expect(before.y).toBeCloseTo(after.y, 1)
        }
      } finally { await page.close() }
    })

    it.each([16, 32])('keeps the Portuguese habit analysis label readable at 320px with root font %ipx', async (fontSize) => {
      vi.useRealTimers()
      mocks.language = 'pt-BR'
      const { container } = render(<HabitDetailScreen habitId="habit-1" />)
      const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
      try {
        await page.setContent(`<style>${stylesheet}:root { font-size:${fontSize}px }</style>${container.innerHTML}`)
        await loadAppFonts(page)
        const action = page.getByRole('button', { name: ptBR.habits.detail.askAstra, exact: true })
        const geometry = await action.locator('[data-slot="list-row-title"]').evaluate((title) => {
          const style = getComputedStyle(title)
          return { clientWidth: title.clientWidth, scrollWidth: title.scrollWidth, height: title.getBoundingClientRect().height, lineHeight: Number.parseFloat(style.lineHeight), textOverflow: style.textOverflow }
        })
        expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth)
        expect(geometry.textOverflow).not.toBe('ellipsis')
        if (fontSize === 16) expect(geometry.height).toBeCloseTo(geometry.lineHeight, 0)
        else expect(geometry.height).toBeGreaterThan(geometry.lineHeight)
      } finally { await page.close() }
    })

    it.each([320, 412, 600, 1024, 1352])('clears the unscheduled child explanation at %ipx', async (width) => {
      vi.useRealTimers()
      mocks.scopedHabits = new Map()
      mocks.realChildRows = true
      const { container } = render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      try {
        const variables = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([key, value]) => `${key}:${value}`).join(';')
        await page.setContent(`<style>${stylesheet}:root { ${variables} } * { transition:none!important }</style>${container.innerHTML}`)
        const group = page.getByTestId('detail-children')
        expect(await group.locator('p').textContent()).toBe('calendar.dayCell.notScheduled')
        for (const control of await group.locator('button:visible:not(:disabled):not([aria-disabled="true"])').all()) {
          await control.hover({ timeout: 2000 })
          const geometry = await control.evaluate((element) => ({
            bottom: element.getBoundingClientRect().bottom,
            reasonTop: element.closest('[data-testid="detail-children"]')!.querySelector('p')!.getBoundingClientRect().top,
          }))
          expect(geometry.reasonTop - geometry.bottom).toBeGreaterThanOrEqual(INTERACTION_FILL_CLEARANCE)
          for (const state of ['hover', 'press', 'focus-visible'] as const) {
            if (state === 'press') await page.mouse.down()
            if (state === 'focus-visible') {
              await page.mouse.move(0, 0)
              await page.mouse.up()
              await page.keyboard.press('Tab')
              await control.focus()
              expect(await control.evaluate(element => element.matches(':focus-visible'))).toBe(true)
            }
            const fill = await control.evaluate(inspectInteractionFill, INTERACTION_FILL_CLEARANCE)
            expect(fill.violations, `${width}px ${state}: ${fill.control}`).toEqual([])
          }
          await control.blur()
        }
      } finally { await page.close() }
    })

    it.each(['light', 'dark'] as const)('leaves the child row group without a second surface in %s', async (mode) => {
      vi.useRealTimers()
      mocks.realChildRows = true
      mocks.detail = { ...makeDetail(), children: makeDetail().children.map((child) => ({ ...child, description: '**Read** two pages before breakfast.' })) }
      mocks.scopedHabits.set('child-1', { ...makeScopedChild('2026-08-28'), description: '**Read** two pages before breakfast.' })
      const { container } = render(<HabitDetailScreen habitId="habit-1" />)
      const page = await browser.newPage({ viewport: { width: 320, height: 915 } })
      try {
        const variables = Object.entries(resolveWebThemeVariables('orange', mode)).map(([name, value]) => `${name}:${value}`).join(';')
        await page.setContent(`<style>${stylesheet}:root{${variables}}</style>${container.innerHTML}`)
        const group = await page.getByTestId('detail-children').evaluate((element) => {
          const paint = getComputedStyle(element)
          return { background: paint.backgroundColor, shadow: paint.boxShadow, border: paint.borderWidth, gap: paint.rowGap }
        })
        expect(group).toEqual({ background: 'rgba(0, 0, 0, 0)', shadow: 'none', border: '0px', gap: '12px' })
        const inset = await page.getByTestId('detail-children').getByTestId('habit-row').evaluate((row) => {
          const well = Array.from(row.querySelectorAll('span')).find((element) => getComputedStyle(element).width === '32px')!
          return well.getBoundingClientRect().left - row.getBoundingClientRect().left
        })
        expect(inset).toBe(8)
        const cardInset = await page.getByTestId('detail-children').getByTestId('habit-row').evaluate((row) =>
          row.getBoundingClientRect().left - row.closest('[data-testid="detail-children"]')!.getBoundingClientRect().left)
        expect(cardInset).toBe(16)
        expect(await page.locator('[data-habit-row-description]').allTextContents()).toEqual(['Read two pages before breakfast.'])
      } finally { await page.close() }
    })

    it.each([
      [320, 'dark'], [412, 'dark'], [1100, 'dark'],
      [320, 'light'], [412, 'light'], [1100, 'light'],
    ] as const)('keeps the title quiet and its button indicator clear at %ipx in %s mode', async (width, mode) => {
      vi.useRealTimers()
      mocks.realHeaderRing = true
      mocks.realEditorPencil = true
      const { container } = render(<HabitDetailScreen habitId="habit-1" />)
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      try {
        const variables = Object.entries(resolveWebThemeVariables('orange', mode)).map(([name, value]) => name + ': ' + value + ';').join(' ')
        await page.setContent('<style>' + stylesheet + ':root { ' + variables + ' } body { background: var(--bg); }</style>' + container.innerHTML)
        await loadAppFonts(page)
        const title = page.getByRole('heading', { level: 1, name: mocks.detail!.title })
        expect(await title.locator('button').count()).toBe(0)
        expect(await readFieldIndicators(title, 'h1', { includeDescendants: true })).toEqual([])
        const pencil = page.getByRole('button', { name: 'habits.editHabit', exact: true })
        const hit = await pencil.evaluate(readExpandedControlGeometry)
        expect(hit.edgeHits).toEqual([true, true, true, true])
        expect(hit.height).toBeGreaterThanOrEqual(48)
        expect(hit.width).toBeGreaterThanOrEqual(48)
        await pencil.focus()
        expect(await pencil.evaluate((element) => element === document.activeElement && element.matches(':focus-visible'))).toBe(true)
        expect(await readFieldIndicators(pencil, 'button', { includeDescendants: true })).toHaveLength(1)
        const fill = await pencil.evaluate(inspectInteractionFill, INTERACTION_FILL_CLEARANCE)
        expect(fill.violations).toEqual([])
      } finally { await page.close() }
    })

    it.each([320, 412, 600, 1024, 1100, 1352])('aligns title ink and reserves fill clearance at %ipx', async (width) => {
      vi.useRealTimers()
      mocks.realHeaderRing = true
      mocks.realEditorPencil = true
      const { container } = render(<HabitDetailScreen habitId="habit-1" />)
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      try {
        const variables = Object.entries(resolveWebThemeVariables('orange', 'dark')).map(([name, value]) => name + ': ' + value + ';').join(' ')
        await page.setContent('<style>' + stylesheet + ':root { ' + variables + ' } body { background: var(--bg); }</style>' + container.innerHTML)
        const themeTokens = await page.evaluate(() => {
          const style = getComputedStyle(document.documentElement)
          return ['--bg-hover', '--hairline-strong', '--fg-1', '--primary'].map((name) => [name, style.getPropertyValue(name).trim()])
        })
        for (const [name, value] of themeTokens) expect(value, name).not.toBe('')
        const heading = page.getByRole('heading', { level: 1, name: mocks.detail!.title })
        const geometry = await heading.evaluate((heading) => {
          const summary = heading.nextElementSibling!
          const row = heading.closest('[data-habit-detail-header-row]')!
          const controls = row.firstElementChild!
          const range = document.createRange()
          range.selectNodeContents(heading.querySelector('[data-personal-text]')!)
          return { titleX: range.getBoundingClientRect().left, summaryX: summary.getBoundingClientRect().left, controlsX: controls.getBoundingClientRect().left, gap: heading.getBoundingClientRect().top - controls.getBoundingClientRect().bottom }
        })
        expect(Math.abs(geometry.titleX - geometry.summaryX)).toBeLessThanOrEqual(1)
        expect(Math.abs(geometry.titleX - geometry.controlsX)).toBeLessThanOrEqual(1)
        expect(geometry.gap).toBe(8)
        const target = page.getByRole('button', { name: 'habits.editHabit', exact: true })
        await target.hover()
        for (const state of ['hover', 'press'] as const) {
          if (state === 'press') await page.mouse.down()
          await target.evaluate(readControlPaint)
          const fill = await target.evaluate(inspectInteractionFill, INTERACTION_FILL_CLEARANCE)
          expect(fill.hasFill, state).toBe(true)
          expect(fill.violations, state).toEqual([])
        }
        await page.mouse.move(0, 0)
        await page.mouse.up()
      } finally { await page.close() }
    })

    it.each([
      [412, 'leaf'],
      [1280, 'leaf'],
      [412, 'parent'],
      [1280, 'parent'],
    ])('reserves offline refusal clearance only while visible at %ipx for a %s', async (width, kind) => {
      vi.useRealTimers()
      mocks.detail = kind === 'leaf' ? { ...makeDetail(), children: [] } : makeDetail()
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      try {
        const { container } = render(<HabitDetailScreen habitId="habit-1" />)
        const measureClearance = async () => {
          await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
          return page.getByTestId('list-row-habits.detail.addSubHabit').evaluate((element) => {
            const live = element.parentElement!.querySelector('[aria-live="polite"]')!
            return live.getBoundingClientRect().top - element.getBoundingClientRect().bottom
          })
        }
        expect(await measureClearance()).toBe(0)
        if (kind === 'parent') {
          const gaps = await page.getByTestId('detail-children').evaluate((element) => ({
            before: element.getBoundingClientRect().top - element.previousElementSibling!.getBoundingClientRect().bottom,
            after: element.nextElementSibling!.getBoundingClientRect().top - element.getBoundingClientRect().bottom,
          }))
          expect(gaps).toEqual({ before: 8, after: 8 })
        }
        fireEvent.click(screen.getByTestId('list-row-habits.detail.addSubHabit'))
        expect(screen.getByText('offline.create.reason')).toBeVisible()
        expect(await measureClearance()).toBe(12)
      } finally {
        Reflect.deleteProperty(navigator, 'onLine')
        await page.close()
      }
    })

    it.each([320, 412])('shows the full long habit title at %ipx with large text', async (width) => {
      vi.useRealTimers()
      const habitTitle = 'Read a long chapter and discuss the details with the reading group '.repeat(3)
      mocks.detail = { ...makeDetail(), title: habitTitle }
      const { container } = render(<HabitDetailScreen habitId="habit-1" />)
      const page = await browser.newPage({ viewport: { width, height: 1600 } })
      try {
        await page.setContent(`<style>${stylesheet}</style>${container.innerHTML}`)
        const geometry = await page.getByRole('heading', { level: 1, name: habitTitle }).evaluate((element) => {
                    const label = element.querySelector<HTMLElement>('[data-personal-text]')!
          const style = getComputedStyle(label)
          const fontSize = parseFloat(style.fontSize) * 2
          const lineHeight = parseFloat(style.lineHeight) * 2
          element.style.fontSize = `${fontSize}px`
          element.style.lineHeight = `${lineHeight}px`
          const range = document.createRange()
          range.selectNodeContents(label)
          const text = range.getBoundingClientRect()
          const bounds = label.getBoundingClientRect()
          const column = element.closest('[data-habit-detail-content]')!
          const columnStyle = getComputedStyle(column)
          return { whiteSpace: style.whiteSpace, textOverflow: style.textOverflow,
            lines: range.getClientRects().length, inside: text.right <= bounds.right + 1 && text.bottom <= bounds.bottom + 1,
            width: bounds.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight), available: column.getBoundingClientRect().width - parseFloat(columnStyle.paddingLeft) - parseFloat(columnStyle.paddingRight), leading: lineHeight / fontSize }
        })
        expect(geometry.whiteSpace).toBe('normal')
        expect(geometry.textOverflow).not.toBe('ellipsis')
        expect(geometry.lines).toBeGreaterThan(2)
        expect(geometry.inside).toBe(true)
        expect(geometry.leading).toBeGreaterThanOrEqual(1.4)
        expect(geometry.width).toBe(geometry.available)
      } finally { await page.close() }
    })

    it.each([
      [412, 'Read'],
      [1280, 'Read'],
      [360, 'Read a longer book chapter with notes and discuss it with the reading group'],
      [840, 'Read a longer book chapter with notes and discuss it with the reading group'],
    ])('resolves the title display family and column cap at %ipx for %s', async (width, habitTitle) => {
      vi.useRealTimers()
      mocks.detail = { ...makeDetail(), title: habitTitle }
      mocks.metrics = { ...mocks.metrics, totalCompletions: 0 }
      const { container } = render(<HabitDetailScreen habitId="habit-1" />)
      fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))
      const page = await browser.newPage({ viewport: { width, height: 915 } })
      try {
        await page.setContent(`<style>${stylesheet}:root { --font-space-grotesk: "Space Grotesk"; --font-geist: "Geist"; --font-geist-mono: "Geist Mono"; }</style>${container.innerHTML}`)
        const title = page.getByRole('heading', { level: 1, name: habitTitle })
        const geometry = await title.evaluate((element) => {
          const row = element.closest('[data-habit-detail-header-row]')!
          const column = element.closest('[data-habit-detail-content]')!
          const style = getComputedStyle(element)
          const columnStyle = getComputedStyle(column)
          return {
            family: style.fontFamily,
            size: style.fontSize,
            weight: style.fontWeight,
            contentWidth: column.getBoundingClientRect().width - Number.parseFloat(columnStyle.paddingLeft) - Number.parseFloat(columnStyle.paddingRight),
            headerInset: row.getBoundingClientRect().left - column.getBoundingClientRect().left,
            columnInset: Number.parseFloat(columnStyle.paddingLeft),
          }
        })
        expect(geometry.family).toContain('Space Grotesk')
        expect(geometry.size).toBe(width < 640 ? '22px' : '28px')
        expect(geometry.weight).toBe('500')
        expect(geometry.contentWidth).toBe(Math.min(width - 32, 620))
        expect(geometry.headerInset).toBe(geometry.columnInset)
        const rename = page.getByRole('button', { name: 'habits.editHabit', exact: true })
        await rename.evaluate((element) => element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }))
        const visibleRatio = await rename.evaluate((element) => new Promise<number>((resolveRatio) => {
          const observer = new IntersectionObserver(([entry]) => {
            observer.disconnect()
            resolveRatio(entry!.intersectionRatio)
          })
          observer.observe(element)
        }))
        expect(visibleRatio, 'the entire rename target is reachable without ancestor clipping').toBe(1)
        const emptyMetrics = await page.getByText('noDataYet', { exact: true }).evaluate((element) => {
          const style = getComputedStyle(element)
          return { align: style.textAlign, top: style.paddingTop, bottom: style.paddingBottom }
        })
        expect(emptyMetrics).toEqual({ align: 'center', top: '16px', bottom: '16px' })
      } finally {
        await page.close()
      }
    })
  })

})
