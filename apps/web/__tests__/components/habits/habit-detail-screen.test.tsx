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
import { createApiClientError, formatAPIDate, formatLocaleDateTime, isHabitSlipping, normalizeHabitQueryData } from '@orbit/shared/utils'
import {
  makeHabitDetail as makeDetail,
  makeHabitScheduleItem,
  makeTaggedNestedHabitScheduleItem,
  makeHabitDetailScopedChild as makeScopedChild,
  makeHabitDetailScopedParent as makeScopedParent,
  makeLoggedGeneralHabitDetailChild as makeLoggedGeneralChild,
} from '@orbit/shared/test-support/habit-detail-fixtures'
import type { HabitLog } from '@orbit/shared/types/calendar'
import type { HabitDetail, HabitMetrics, NormalizedHabit, RescheduleSuggestion } from '@orbit/shared/types/habit'
import { HabitDetailScreen } from '@/components/habits/habit-detail-screen'
import { DestinationShell } from '@/components/shell/destination-shell'
import { RouteContext } from '@/components/navigation/route-context'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'
import { holdAccount, replaceAccountWith } from '@/__tests__/support/account-change'

const mocks = vi.hoisted(() => ({
  pathname: '/habits/habit-1',
  realTimeField: false,
  realReminderSections: false,
  logs: [] as HabitLog[],
  metrics: {} as HabitMetrics,
  detail: null as HabitDetail | null,
  detailLoading: false,
  detailError: false,
  refetch: vi.fn(),
  allHabitsError: false,
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
    if (key === 'habits.detail.slippingLine') return `${key}:${values?.days}:${values?.streak}:${values?.limit}`
    if (key === 'loggedAt') return `${values?.date}, logged at ${values?.time}`
    if (key === 'habits.detail.logDateConfirmMessage') return `${values?.date}: ${values?.name}`
    if (key === 'habits.detail.logDateConfirmUnlogMessage') return `Undo ${values?.name}: ${values?.date}`
    if (key === 'habits.detail.askAstraSeedDefault') return `${key}:${JSON.stringify({ title: values?.title })}`
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
  useHabitMetrics: () => ({ data: mocks.metrics, isLoading: false }),
  useHabits: (filters: { dateFrom?: string; includeOverdue?: boolean }, _initialItems?: unknown, options?: { completeDay?: boolean }) => {
    if (filters.dateFrom) {
      mocks.scopedCompleteDay = options?.completeDay ?? false
      mocks.scopedRequests.push({ dateFrom: filters.dateFrom, includeOverdue: filters.includeOverdue === true })
    }
    return { data: filters.dateFrom && mocks.scopedLoading ? undefined : { habitsById: filters.dateFrom ? mocks.scopedHabitsByDate.get(filters.dateFrom) ?? mocks.scopedHabits : mocks.allHabits, topLevelHabits: [] }, isLoading: !!filters.dateFrom && mocks.scopedLoading, isError: filters.dateFrom ? mocks.scopedError : mocks.allHabitsError, refetch: filters.dateFrom ? mocks.scopedRefetch : mocks.allHabitsRefetch }
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
      weekStartDay: 1,
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
vi.mock('@/components/ui/skeleton', () => ({ Skeleton: ({ label }: { label: string }) => <div>{label}</div> }))
vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) => (
    <button type="button" role="switch" aria-label={label} aria-checked={checked} onClick={() => onChange(!checked)} />
  ),
}))
vi.mock('@/components/ui/list-row', () => ({
  ListRow: ({ title, description, value, trailing, chevron, onClick }: { title: string; description?: string; value?: string; trailing?: React.ReactNode; chevron?: boolean; onClick?: () => void }) => onClick
    ? <button type="button" data-testid={`list-row-${title}`} data-description={description} data-value={value} data-chevron={String(chevron)} onClick={onClick}>{title}{trailing}</button>
    : <div data-testid={`list-row-${title}`} data-description={description} data-value={value} data-chevron={String(chevron)}>{title}{trailing}</div>,
}))
vi.mock('@/components/ui/pill-button', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ui/pill-button')>()),
  PillButton: ({ children, disabled, label, variant, size, loading, onClick }: { children?: React.ReactNode; disabled?: boolean; label?: string; variant?: string; size?: string; loading?: boolean; onClick?: () => void }) => <button type="button" disabled={disabled} aria-label={label} aria-busy={loading} data-variant={variant} data-size={size} onClick={onClick}>{children}</button>,
  Button: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => <button type="button" onClick={onClick}>{children}</button>,
}))
vi.mock('@/components/ui/stat-tile', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ui/stat-tile')>()),
  StatTile: ({ label, value }: { label: string; value: string }) => <output data-testid={`stat-${label}`}>{value}</output>,
}))
vi.mock('@/components/dates/day-cell', () => ({
  DayCell: ({ day, done, scheduled, outsideMonth, label }: { day: number; done?: number; scheduled?: number; outsideMonth: boolean; label: string }) => {
    const outcome = scheduled === 0 ? 'not-scheduled' : done !== undefined && scheduled !== undefined && done >= scheduled ? 'full' : 'none'
    return <span aria-label={label} data-testid={`history-day-${day}-${outsideMonth ? 'outside' : 'inside'}`}>{outcome}</span>
  },
}))
vi.mock('@/components/dates/day-strip', () => ({ DayStrip: ({ size, days }: { size: number; days: string[] }) => <div data-testid="detail-strip" data-size={size} data-days={days.length} /> }))
vi.mock('@/components/dates/month-grid', () => ({
  MonthGrid: ({ children, label }: { children: React.ReactNode; label: string }) => <div aria-label={label}>{children}</div>,
}))
vi.mock('@/components/habits/create-habit-modal', () => ({ CreateHabitModal: ({ open }: { open: boolean }) => open ? <div role="dialog" aria-label="Create habit" /> : null }))
vi.mock('@/components/habits/goal-linking-field', () => ({
  GoalLinkingField: ({ selectedGoalIds, atGoalLimit, onToggleGoal }: { selectedGoalIds: string[]; atGoalLimit: boolean; onToggleGoal: (goalId: string) => void }) => <button type="button" data-testid="goal-linking-field" data-goal-limit={atGoalLimit} onClick={() => onToggleGoal(atGoalLimit ? selectedGoalIds[0]! : 'goal-2')} />,
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
  const mockSection = ({ children, onReminderTimesChange, onToggleReminder }: { children?: React.ReactNode; onReminderTimesChange: (offsets: number[]) => void; onToggleReminder: () => void }) => <div data-testid="offset-reminders"><button type="button" onClick={() => onReminderTimesChange([30])}>set-offset</button><button type="button" onClick={onToggleReminder}>toggle-offsets</button>{children}</div>
  return {
    ReminderSection: (props: React.ComponentProps<typeof actual.ReminderSection>) => mocks.realReminderSections ? <actual.ReminderSection {...props} /> : mockSection(props),
  }
})
vi.mock('@/components/habits/habit-form-fields/scheduled-reminder-section', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/habits/habit-form-fields/scheduled-reminder-section')>()
  const mockSection = ({ onSetScheduledReminders, onToggleReminder }: { onSetScheduledReminders: (scheduled: { when: 'same_day'; time: string }[]) => void; onToggleReminder: () => void }) => <div data-testid="scheduled-reminders"><button type="button" onClick={() => onSetScheduledReminders([{ when: 'same_day', time: '08:00' }])}>set-scheduled</button><button type="button" onClick={() => onSetScheduledReminders([])}>remove-scheduled</button><button type="button" onClick={onToggleReminder}>toggle-scheduled</button></div>
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
vi.mock('@/components/habits/habit-log-button', () => ({
  HabitLogButton: ({ label, logged, onPress, disabled, disabledReason }: { label: string; logged: boolean; onPress: () => void; disabled?: boolean; disabledReason?: string }) => <button type="button" aria-label={label} data-logged={logged} data-disabled-reason={disabledReason} disabled={disabled} onClick={onPress}>{label}</button>,
}))
vi.mock('@/components/habits/habit-row', () => ({
  HabitRow: ({ habit, state, canLog, completionReadOnly, completionReason, completionStatusUnavailable, actions }: { habit: NormalizedHabit; state: string; canLog: boolean; completionReadOnly: boolean; completionReason?: string; completionStatusUnavailable?: boolean; actions: { onLog: () => void; onUnlog: () => void; onDetail: () => void; onDelete: () => void } }) => (
    <div>
      <button
        type="button"
        data-testid={`child-${habit.id}`}
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
  ),
}))

function openRescueGate() {
  mocks.logs = []
  mocks.metrics = { ...mocks.metrics, currentStreak: 0, weeklyCompletionRate: 0, monthlyCompletionRate: 40, lastCompletedDate: '2026-08-20' }
  mocks.scopedHabits = new Map([['habit-1', { ...makeScopedParent(), isOverdue: true }]])
}

describe('HabitDetailScreen', () => {
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
    expect(headings[0]!.querySelector('button')).toHaveTextContent(mocks.detail!.title)
    fireEvent.click(screen.getByRole('button', { name: mocks.detail!.title }))
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(mocks.detail!.title)
  })
  beforeEach(() => {
    mocks.pathname = '/habits/habit-1'
    mocks.realTimeField = false;
    mocks.realReminderSections = false;
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 29, 12))
    mocks.detail = makeDetail()
    mocks.detailLoading = false
    mocks.detailError = false
    mocks.allHabitsError = false
    mocks.logs = [
      { id: 'older-1', date: '2026-08-26', value: 1, createdAtUtc: '2026-08-26T12:00:00Z' },
      { id: 'older-2', date: '2026-08-27', value: 1, createdAtUtc: '2026-08-27T12:00:00Z' },
    ]
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

  it('opens Creation controls seeded from the habit in one disclosure', () => {
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))
    expect(screen.getByRole('textbox', { name: 'habits.form.description' })).toHaveValue(mocks.detail!.description ?? '')
    expect(screen.getByRole('switch', { name: 'habits.form.habitTypeAvoid' })).toBeInTheDocument()
    expect(screen.getByLabelText('habits.form.exactTime')).toBeInTheDocument()
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
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.retry' }))
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
      fireEvent.click(screen.getByRole('button', { name: 'habits.detail.retry' }))
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
    expect(within(card).getByTestId('astra-glyph')).toHaveAttribute('data-size', '20')
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
    expect(screen.getByText('Setembro de 2026')).toBeVisible()
    expect(screen.getByLabelText('Atividade do hábito em setembro de 2026')).toBeInTheDocument()
  })

  it('uses the drawn action row endings and a Pro badge on free', () => {
    mocks.hasProAccess = false
    render(<HabitDetailScreen habitId="habit-1" />)
    const add = screen.getByTestId('list-row-habits.detail.addSubHabit')
    expect(add).toHaveAttribute('data-chevron', 'false')
    expect(add.querySelector('[data-testid="badge"]')).toHaveTextContent('habits.detail.proGate')
    fireEvent.click(add)
    expect(mocks.routerPush).toHaveBeenCalledWith('/upgrade')
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

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('shows loading feedback and a retry action after a load failure', () => {
    mocks.detailLoading = true
    const view = render(<HabitDetailScreen habitId="habit-1" />)

    expect(screen.getAllByText('habits.detail.loading')).toHaveLength(3)
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
    const view = render(<RouteContext><HabitDetailScreen habitId="habit-1" /></RouteContext>)
    const fallback = screen.getByRole('heading', { level: 1 })
    expect(document.title).toBe('habits.detail.screenTitle · Orbit')
    fallback.focus()
    mocks.detailLoading = false
    view.rerender(<RouteContext><HabitDetailScreen habitId="habit-1" /></RouteContext>)
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

  it('replaces the hosted loading heading with the habit heading after a fresh load', () => {
    mocks.detailLoading = true
    const view = render(<DestinationShell onCreate={() => {}}><HabitDetailScreen habitId="habit-1" /></DestinationShell>)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    screen.getByRole('heading', { level: 1, name: 'habits.detail.screenTitle' }).focus()

    mocks.detailLoading = false
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

  it('retries a list-only load failure', () => {
    mocks.allHabitsError = true
    render(<HabitDetailScreen habitId="habit-1" />)

    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.retry' }))

    expect(mocks.allHabitsRefetch).toHaveBeenCalledOnce()
    expect(mocks.refetch).not.toHaveBeenCalled()
  })

  it('shows authoritative tags and moves linked goals into the inline details', () => {
    mocks.allHabits.set('habit-1', makeScopedParent())
    mocks.scopedHabits.set('habit-1', makeScopedParent())
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    expect(screen.getByText('Focus')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))
    expect(screen.getByTestId('list-row-habits.detail.linkedGoals')).toHaveAttribute('data-value', '1')
    fireEvent.click(screen.getByTestId('list-row-habits.detail.linkedGoals'))
    expect(screen.getByTestId('goal-linking-field')).toBeInTheDocument()
    expect(mocks.routerPush).not.toHaveBeenCalled()
  })

  it('preserves authoritative relationship state for an off-schedule habit', async () => {
    const linkedGoals = Array.from({ length: 10 }, (_, index) => ({ id: `goal-${index + 1}`, title: `Goal ${index + 1}` }))
    mocks.detail = { ...makeDetail(), isBadHabit: true }
    mocks.allHabits.set('habit-1', {
      ...makeScopedParent(),
      isBadHabit: true,
      linkedGoals,
      slipAlertEnabled: true,
    })

    render(<HabitDetailScreen habitId="habit-1" date="2026-08-29" />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))

    expect(screen.getByTestId('list-row-habits.detail.linkedGoals')).toHaveAttribute('data-value', '10')
    fireEvent.click(screen.getByTestId('list-row-habits.detail.linkedGoals'))
    expect(screen.getByTestId('goal-linking-field')).toHaveAttribute('data-goal-limit', 'true')
    fireEvent.click(screen.getByTestId('goal-linking-field'))
    expect(mocks.update.mock.calls.at(-1)?.[0].data).toMatchObject({
      goalIds: linkedGoals.slice(1).map((goal) => goal.id),
    })

    const slipAlert = screen.getByRole('switch', { name: 'habits.detail.slipAlert' })
    expect(slipAlert).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(slipAlert)
    await act(async () => Promise.resolve())
    expect(mocks.update.mock.calls.at(-1)?.[0].data).toMatchObject({ slipAlertEnabled: false })
  })

  it('keeps a general habit existing goal links after the first toggle', () => {
    mocks.detail = { ...makeDetail(), isGeneral: true }
    mocks.allHabits.clear()
    mocks.scopedHabits = normalizeHabitQueryData([makeHabitScheduleItem({
      isGeneral: true,
      linkedGoals: [{ id: 'goal-1', title: 'Read more books' }],
    })]).habitsById
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))
    fireEvent.click(screen.getByTestId('list-row-habits.detail.linkedGoals'))
    fireEvent.click(screen.getByTestId('goal-linking-field'))

    expect(mocks.update.mock.calls.at(-1)?.[0].data).toMatchObject({
      goalIds: ['goal-1', 'goal-2'],
    })
  })

  it('hides relationship controls for a nested child from real normalized schedule data', () => {
    mocks.detail = { ...makeDetail(), id: 'child-1', isBadHabit: true, children: [] }
    mocks.allHabits = normalizeHabitQueryData([makeHabitScheduleItem()]).habitsById
    mocks.scopedHabits = normalizeHabitQueryData([makeHabitScheduleItem()]).habitsById
    render(<HabitDetailScreen habitId="child-1" date="2026-08-28" parentId="habit-1" />)

    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))

    expect(screen.queryByTestId('list-row-habits.detail.linkedGoals')).not.toBeInTheDocument()
    expect(screen.queryByTestId('list-row-habits.detail.slipAlert')).not.toBeInTheDocument()
  })

  it('keeps normalized nested tags visible without relationship controls', () => {
    mocks.detail = { ...makeDetail(), id: 'child-1', isBadHabit: true, children: [] }
    const normalized = normalizeHabitQueryData([makeTaggedNestedHabitScheduleItem()])
    mocks.allHabits = normalized.habitsById
    mocks.scopedHabits = normalized.habitsById
    render(<HabitDetailScreen habitId="child-1" date="2026-08-28" parentId="habit-1" />)

    expect(screen.getByText('Nested focus')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))
    expect(screen.queryByTestId('list-row-habits.detail.linkedGoals')).not.toBeInTheDocument()
    expect(screen.queryByTestId('list-row-habits.detail.slipAlert')).not.toBeInTheDocument()
  })

  it('keeps relationship controls interactive for a top-level habit with zero linked goals', async () => {
    mocks.detail = { ...makeDetail(), isBadHabit: true }
    mocks.allHabits = normalizeHabitQueryData([makeHabitScheduleItem({ isBadHabit: true })]).habitsById
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))
    fireEvent.click(screen.getByTestId('list-row-habits.detail.linkedGoals'))
    fireEvent.click(screen.getByTestId('goal-linking-field'))
    fireEvent.click(screen.getByRole('switch', { name: 'habits.detail.slipAlert' }))

    await act(async () => Promise.resolve())
    expect(mocks.update.mock.calls.at(-2)?.[0].data).toMatchObject({ goalIds: ['goal-2'] })
    expect(mocks.update.mock.calls.at(-1)?.[0].data).toMatchObject({ slipAlertEnabled: true })
  })

  it('restores an empty rename and returns to the selected day', async () => {
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    fireEvent.click(screen.getByRole('button', { name: 'Read' }))
    const input = screen.getByRole('textbox', { name: 'rename' })
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.blur(input)
    await act(async () => Promise.resolve())

    expect(screen.queryByRole('textbox', { name: 'rename' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Read' })).toBeInTheDocument()
    expect(mocks.update).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'common.backToToday' }))
    expect(mocks.routerPush).toHaveBeenCalledWith('/?date=2026-08-28')
  })

  it('moves to an older history month without rendering the removed history note', () => {
    mocks.detail = { ...makeDetail(), createdAtUtc: '2025-01-01T12:00:00Z' }
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    const previousMonth = screen.getByRole('button', { name: 'previousMonth' })
    for (let index = 0; index < 13; index += 1) fireEvent.click(previousMonth)

    expect(screen.getByText('July 2025')).toBeInTheDocument()
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

  it('renames an unscoped habit without sending Pro or goal state', () => {
    mocks.hasProAccess = false
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    fireEvent.click(screen.getByRole('button', { name: 'Read' }))
    const input = screen.getByRole('textbox', { name: 'rename' })
    fireEvent.change(input, { target: { value: 'Read daily' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(mocks.update).toHaveBeenCalledOnce()
    const request = mocks.update.mock.calls[0]![0].data
    expect(request.title).toBe('Read daily')
    expect(request).not.toHaveProperty('slipAlertEnabled')
    expect(request).not.toHaveProperty('goalIds')
  })

  it('opens a non-daily schedule editor inline without opening the full editor', () => {
    mocks.detail = { ...makeDetail(), frequencyUnit: 'Week', frequencyQuantity: 2 }
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.schedule' }))
    expect(screen.getByRole('spinbutton', { name: 'habits.form.frequencyRequired' })).toHaveValue(2)
    expect(screen.queryByTestId('edit-habit-modal')).not.toBeInTheDocument()
  })
  it('corrects daily weekdays directly without opening the disclosure', async () => {
    const view = render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(7)
    fireEvent.click(screen.getByRole('button', { name: 'dates.daysLong.sunday' }))
    await act(async () => Promise.resolve())
    const request = mocks.update.mock.calls.at(-1)![0].data
    expect(request).toMatchObject({ frequencyUnit: 'Day', frequencyQuantity: 1, days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] })
    mocks.detail = { ...mocks.detail!, days: request.days }
    view.rerender(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    expect(screen.getByRole('button', { name: 'dates.daysLong.sunday', pressed: false })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'dates.daysLong.sunday' }))
    expect(mocks.update.mock.calls.at(-1)![0].data.days).toEqual([])
  })
  it('renders reminders without a cancel or save step', () => {
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))
    expect(screen.queryByRole('button', { name: 'common.cancel' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'common.save' })).not.toBeInTheDocument()
  })

  it.each([false, true])('preserves queued reminder selections across disclosure collapse and reopen, refreshed %s', async (refreshWhilePending) => {
    mocks.realReminderSections = true
    mocks.detail = { ...makeDetail(), dueTime: '09:00', reminderEnabled: true, reminderTimes: [15] }
    const finishes: (() => void)[] = []
    mocks.update.mockImplementation(() => new Promise<void>((resolve) => { finishes.push(resolve) }))
    const view = render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
    press('habits.detail.moreDetails')
    press('habits.form.reminderAdd')
    press('habits.form.reminder1hour')
    press('habits.form.reminderAdd')
    press('habits.form.reminder30min')
    expect(mocks.update).toHaveBeenCalledTimes(1)
    if (refreshWhilePending) {
      await act(async () => { finishes[0]!(); await Promise.resolve() })
      mocks.detail = { ...mocks.detail!, reminderTimes: mocks.update.mock.calls[0]![0].data.reminderTimes }
      act(() => { view.rerender(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />) })
    }
    press('habits.detail.moreDetails')
    expect(screen.queryByRole('switch', { name: 'habits.form.reminders' })).not.toBeInTheDocument()
    press('habits.detail.moreDetails')
    press('habits.form.reminderAdd')
    press('habits.form.reminderAtTime')
    for (let index = refreshWhilePending ? 1 : 0; index < 3; index += 1) {
      await act(async () => { finishes[index]!(); await Promise.resolve() })
    }
    expect(mocks.update).toHaveBeenCalledTimes(3)
    expect(mocks.update.mock.calls.at(-1)![0].data).toMatchObject({
      reminderEnabled: true, reminderTimes: [60, 30, 15, 0], scheduledReminders: [],
    })
  })

  it('patches a reminder toggle once with optimistic state', async () => {
    mocks.detail = { ...makeDetail(), dueTime: '09:00', reminderEnabled: false, reminderTimes: [15] }
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))
    fireEvent.click(screen.getByRole('button', { name: 'toggle-offsets' }))
    await act(async () => Promise.resolve())
    expect(mocks.update).toHaveBeenCalledTimes(1)
    expect(mocks.update.mock.calls[0]![0].data).toMatchObject({ reminderEnabled: true, reminderTimes: [15], scheduledReminders: [] })
  })

  it.each([false, true])('keeps one filled action with a rescue card and schedule editor, Pro %s', (hasProAccess) => {
    openRescueGate()
    mocks.hasProAccess = hasProAccess
    mocks.suggestion = { frequencyUnit: 'Day', frequencyQuantity: 1, dueDate: '2026-08-30', dueTime: null, days: [], rationale: 'Try tomorrow' }
    render(<HabitDetailScreen habitId="habit-1" />)
    const rescueAction = () => screen.getByRole(hasProAccess ? 'button' : 'link', { name: hasProAccess ? 'habits.detail.rescheduleAccept' : 'habits.reschedule.upgrade' })
    expect(rescueAction()).toHaveAttribute('data-variant', 'primary')
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.schedule' }))
    expect(rescueAction()).toHaveAttribute('data-variant', 'ghost')
    expect(screen.getByRole('button', { name: 'common.save' })).toHaveAttribute('data-variant', 'secondary')
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }))
    expect(rescueAction()).toHaveAttribute('data-variant', 'primary')
  })

  it('uses a ghost cancel before the filled schedule action', () => {
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.schedule' }))
    expect(screen.getByRole('button', { name: 'common.cancel' })).toHaveAttribute('data-variant', 'ghost')
    expect(screen.getByRole('button', { name: 'common.save' })).toHaveAttribute('data-variant', 'secondary')
  })

  it('persists each real reminder control once without filling another action', async () => {
    mocks.realReminderSections = true
    mocks.detail = { ...makeDetail(), dueTime: '09:00', reminderEnabled: true, reminderTimes: [15] }
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))
    expect(screen.getByRole('switch', { name: 'habits.form.reminders', checked: true })).toBeInTheDocument()
    expect(screen.getAllByText('habits.form.reminders')).toHaveLength(1)
    expect(screen.queryByText('habits.form.reminder')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.schedule' }))

    fireEvent.click(screen.getByRole('button', { name: 'habits.form.reminderAdd' }))
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.reminder1hour' }))
    await act(async () => Promise.resolve())
    expect(mocks.update).toHaveBeenCalledTimes(1)
    expect(mocks.update.mock.calls.at(-1)![0].data.reminderTimes).toEqual([60, 15])
    fireEvent.click(screen.getAllByRole('button', { name: 'habits.form.removeReminder' })[0]!)
    await act(async () => Promise.resolve())
    expect(mocks.update).toHaveBeenCalledTimes(2)
    expect(mocks.update.mock.calls.at(-1)![0].data.reminderTimes).toEqual([15])

    fireEvent.click(screen.getByRole('button', { name: 'habits.form.reminderAdd' }))
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.reminderCustom' }))
    fireEvent.change(screen.getByPlaceholderText('habits.form.reminderCustomPlaceholder'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'common.add' }))
    expect(mocks.update).toHaveBeenCalledTimes(2)
    expect(mocks.showError).toHaveBeenCalledWith('habits.form.invalidRelativeReminder')
    fireEvent.change(screen.getByPlaceholderText('habits.form.reminderCustomPlaceholder'), { target: { value: '45' } })
    expect(screen.getByRole('button', { name: 'common.add' })).toHaveAttribute('data-variant', 'ghost')
    fireEvent.click(screen.getByRole('button', { name: 'common.add' }))
    await act(async () => Promise.resolve())
    expect(mocks.update).toHaveBeenCalledTimes(3)
    expect(mocks.update.mock.calls.at(-1)![0].data.reminderTimes).toEqual([45, 15])

    fireEvent.click(screen.getByRole('button', { name: 'habits.form.reminderAddTime' }))
    fireEvent.change(screen.getByLabelText('habits.form.scheduledReminderTimePlaceholder'), { target: { value: '08:00' } })
    expect(screen.getByRole('button', { name: 'common.add' })).toHaveAttribute('data-variant', 'ghost')
    fireEvent.click(screen.getByRole('button', { name: 'common.add' }))
    await act(async () => Promise.resolve())
    expect(mocks.update).toHaveBeenCalledTimes(4)
    expect(mocks.update.mock.calls.at(-1)![0].data.scheduledReminders).toEqual([{ when: 'same_day', time: '08:00' }])
    fireEvent.click(screen.getByRole('button', { name: 'habits.form.removeScheduledReminder' }))
    await act(async () => Promise.resolve())
    expect(mocks.update).toHaveBeenCalledTimes(5)
    expect(mocks.update.mock.calls.at(-1)![0].data.scheduledReminders).toEqual([])
    expect(screen.getAllByRole('button').filter((button) => button.dataset.variant === 'secondary')).toHaveLength(1)
  })

  it('restores the reminder switch and reports a failed patch', async () => {
    mocks.realReminderSections = true
    mocks.detail = { ...makeDetail(), dueTime: '09:00', reminderEnabled: true, reminderTimes: [15] }
    let rejectPatch!: (error: Error) => void
    mocks.update.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectPatch = reject }))
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))
    fireEvent.click(screen.getByRole('switch', { name: 'habits.form.reminders' }))
    expect(screen.getByRole('switch', { name: 'habits.form.reminders', checked: false })).toBeInTheDocument()
    await act(async () => { rejectPatch(new Error('update failed')); await Promise.resolve() })
    expect(mocks.update).toHaveBeenCalledTimes(1)
    expect(mocks.showError).toHaveBeenCalledWith('habits.detail.updateError')
    expect(screen.getByRole('switch', { name: 'habits.form.reminders', checked: true })).toBeInTheDocument()
  })

  it.each(['relative', 'scheduled'])('keeps the real %s reminder cap visible without a patch', (cap) => {
    mocks.realReminderSections = true
    mocks.detail = { ...makeDetail(), dueTime: '09:00', reminderEnabled: true,
      reminderTimes: cap === 'relative' ? Array.from({ length: 15 }, (_, index) => index * 10) : [15],
      scheduledReminders: cap === 'scheduled' ? Array.from({ length: 5 }, (_, index) => ({ when: 'same_day' as const, time: `0${index}:00` })) : [],
    }
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))
    expect(screen.getAllByText(cap === 'relative' ? 'habits.form.relativeReminderMax' : 'habits.form.scheduledReminderMax').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'habits.form.reminderAddTime' })).not.toBeInTheDocument()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('edits reminders inside the disclosure and shows the saved readout', async () => {
    const view = render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))
    expect(screen.getByTestId('scheduled-reminders')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'set-scheduled' }))
    fireEvent.click(screen.getByRole('button', { name: 'toggle-scheduled' }))
    expect(mocks.update).toHaveBeenCalledTimes(1)
    await act(async () => Promise.resolve())
    expect(mocks.update.mock.calls.at(-1)![0].data).toMatchObject({ reminderEnabled: true, scheduledReminders: [{ when: 'same_day', time: '08:00' }] })
    mocks.detail = { ...makeDetail(), reminderEnabled: true, reminderTimes: [10, 30], scheduledReminders: [{ when: 'same_day', time: '08:00' }] }
    view.rerender(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    expect(screen.getByText('habits.detail.reminders')).toBeInTheDocument()
    expect(screen.getByText('8:00 AM').parentElement).toHaveTextContent('habits.detail.reminderSameDay')
  })
  it('orders the open sections like the canvas and swaps checklist logging for editing', () => {
    const view = render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    const column = view.container.querySelector('[data-habit-detail-content]')!
    const copy = column.textContent!
    expect(copy.indexOf('habits.detail.inside')).toBeLessThan(copy.indexOf('history'))
    expect(copy.indexOf('history')).toBeLessThan(copy.indexOf('habits.detail.schedule'))
    expect(copy.indexOf('habits.detail.schedule')).toBeLessThan(copy.indexOf('habits.detail.moreDetails'))
    const disclosure = screen.getByRole('button', { name: 'habits.detail.moreDetails' })
    expect(disclosure).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(disclosure)
    expect(disclosure).toHaveAttribute('aria-expanded', 'true')
    const lists = screen.getAllByTestId('habit-checklist')
    expect(lists).toHaveLength(1)
    expect(lists[0]).toHaveAttribute('data-editable', 'true')
    fireEvent.click(disclosure)
    expect(screen.getAllByTestId('habit-checklist')).toHaveLength(1)
    mocks.detail = { ...makeDetail(), isBadHabit: true }
    view.rerender(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    fireEvent.click(disclosure)
    expect(screen.getByTestId('list-row-habits.detail.slipAlert')).toBeInTheDocument()
  })
  it('keeps the empty live region within the header block without a separate column slot', () => {
    const { container } = render(<HabitDetailScreen habitId="habit-1" />)
    const column = container.querySelector('[data-habit-detail-content]')!
    const header = column.querySelector('header')!
    const strip = screen.getByTestId('detail-strip').closest('section')!
    const headerBlock = Array.from(column.children).find((slot) => slot.contains(header))!
    expect(headerBlock.nextElementSibling).toBe(strip)
    const region = headerBlock.querySelector('[role="status"][aria-live="polite"]')
    expect(region).not.toBeNull()
    expect(region).toBeEmptyDOMElement()
    expect(column.querySelector(':scope > [role="status"]')).toBeNull()
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
      const target = screen.getByRole('button', { name: 'A note about this routine' })
      expect(target).toHaveAttribute('aria-expanded', 'false')
      expect(target).toHaveTextContent('A note about this routine')
      fireEvent.click(target)
      expect(target).toHaveAttribute('aria-expanded', 'true')
      fireEvent.click(target)
      expect(target).toHaveAttribute('aria-expanded', 'false')
    }
  })

  it('keeps a populated completion boundary inside the header block', () => {
    const { container } = render(<HabitDetailScreen habitId="habit-1" date="2026-08-30" />)
    const column = container.querySelector('[data-habit-detail-content]')!
    const headerBlock = column.firstElementChild!
    expect(headerBlock).toHaveTextContent('habits.todayBoundary.future')
    expect(headerBlock.nextElementSibling).toBe(screen.getByTestId('detail-strip').closest('section'))
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
    expect(screen.getByLabelText('habits.form.exactTime')).toHaveValue('19:30')
  })

  it('shows only the due time for a habit without a frequency', () => {
    mocks.detail = { ...makeDetail(), frequencyUnit: null, frequencyQuantity: null, dueTime: '08:00' }
    const view = render(<HabitDetailScreen habitId="habit-1" />)
    const summary = view.container.querySelector('[data-habit-detail-content] header p')
    expect(summary?.textContent).toBe('8:00 AM')
  })

  it('omits the summary element when there is no frequency or due time', () => {
    mocks.detail = { ...makeDetail(), frequencyUnit: null, frequencyQuantity: null, dueTime: null }
    const view = render(<HabitDetailScreen habitId="habit-1" />)
    expect(view.container.querySelector('[data-habit-detail-content] header p')).toBeNull()
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
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.askAstra' }))
    expect(useUIStore.getState().astraConversationOpen).toBe(true)
    const prompt = 'habits.detail.askAstraSeedDefault:{"title":"Read"}'
    if (draft) {
      expect(useChatStore.getState().draft).toBe(draft)
      expect(useChatStore.getState().contextualSuggestion).toMatchObject({ id: 'habit-detail:habit-1', prompt })
    } else expect(useChatStore.getState().draft).toBe(prompt)
  })

  it('preserves consecutive edits before detail refreshes', async () => {
    mocks.detail = { ...makeDetail(), dueTime: '09:00' }
    let finish!: () => void
    mocks.update.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
    render(<HabitDetailScreen habitId="habit-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))
    fireEvent.change(screen.getByLabelText('habits.form.exactTime'), { target: { value: '10:15' } })
    fireEvent.click(screen.getByRole('switch', { name: 'habits.form.habitTypeAvoid' }))
    await act(async () => { finish() })
    expect(mocks.update.mock.calls.at(-1)![0].data).toMatchObject({ dueTime: '10:15', isBadHabit: true })
  })

  it('keeps an empty time draft local while replacing the saved time', async () => {
    mocks.realTimeField = true
    mocks.uses24HourClock = true
    mocks.detail = { ...makeDetail(), dueTime: '09:00', reminderEnabled: true, reminderTimes: [15] }
    render(<HabitDetailScreen habitId="habit-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))
    const input = screen.getByLabelText('habits.form.exactTime')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '' } })
    expect(mocks.update).not.toHaveBeenCalled()
    fireEvent.change(input, { target: { value: '10:15' } })
    await act(async () => Promise.resolve())
    expect(mocks.update.mock.calls.at(-1)![0].data).toMatchObject({ dueTime: '10:15', reminderEnabled: true, reminderTimes: [15] })
  })

  it('keeps cadence editing available for a daily habit', async () => {
    render(<HabitDetailScreen habitId="habit-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.schedule' }))
    fireEvent.click(screen.getByRole('radio', { name: 'habits.form.unitWeek' }))
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }))
    await act(async () => Promise.resolve())
    expect(mocks.update.mock.calls.at(-1)![0].data).toMatchObject({ frequencyUnit: 'Week', frequencyQuantity: 1 })
  })

  it('hides Avoid for a general habit as Creation does', () => {
    mocks.detail = { ...makeDetail(), isGeneral: true }
    render(<HabitDetailScreen habitId="habit-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))
    expect(screen.queryByRole('switch', { name: 'habits.form.habitTypeAvoid' })).toBeNull()
  })

  it('persists Creation controls through their existing write paths', async () => {
    mocks.detail = { ...makeDetail(), dueTime: '09:00', description: 'Old note', endDate: '2026-09-30' }
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))
    fireEvent.click(screen.getByTestId('list-row-habits.detail.linkedGoals'))
    fireEvent.click(screen.getByTestId('goal-linking-field'))
    await act(async () => Promise.resolve())
    expect(mocks.update.mock.calls.at(-1)![0].data).toMatchObject({ goalIds: ['goal-2'] })
    fireEvent.change(screen.getByLabelText('habits.form.exactTime'), { target: { value: '10:15' } })
    await act(async () => Promise.resolve())
    expect(mocks.update.mock.calls.at(-1)![0].data).toMatchObject({ dueTime: '10:15', dueEndTime: null })
    const description = screen.getByRole('textbox', { name: 'habits.form.description' })
    fireEvent.change(description, { target: { value: ' Better note ' } })
    fireEvent.blur(description)
    await act(async () => Promise.resolve())
    expect(mocks.update.mock.calls.at(-1)![0].data).toMatchObject({ description: 'Better note' })
    fireEvent.click(screen.getByRole('switch', { name: 'habits.form.habitTypeAvoid' }))
    await act(async () => Promise.resolve())
    expect(mocks.update.mock.calls.at(-1)![0].data).toMatchObject({ isBadHabit: true })
    await act(async () => Promise.resolve())
  })
  it('clears reminder configuration when the time editor clears due time', async () => {
    mocks.detail = {
      ...makeDetail(),
      dueTime: '09:00',
      dueEndTime: '10:00',
      reminderEnabled: true,
      reminderTimes: [15],
      scheduledReminders: [{ when: 'same_day', time: '08:00' }],
    }
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))
    fireEvent.click(screen.getByRole('button', { name: 'clear-time' }))
    await act(async () => Promise.resolve())

    const request = mocks.update.mock.calls.at(-1)?.[0].data
    expect({
      dueTime: request.dueTime,
      dueEndTime: request.dueEndTime,
      reminderEnabled: request.reminderEnabled,
      reminderTimes: request.reminderTimes,
      scheduledReminders: request.scheduledReminders,
    }).toEqual({
      dueTime: null,
      dueEndTime: null,
      reminderEnabled: false,
      reminderTimes: [],
      scheduledReminders: [],
    })
  })

  it('validates reminder changes before mutation', async () => {
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))
    fireEvent.click(screen.getByRole('button', { name: 'toggle-scheduled' }))

    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.showError).toHaveBeenCalledWith('habits.form.reminderMinimumOne')

    fireEvent.click(screen.getByRole('button', { name: 'set-scheduled' }))
    await act(async () => Promise.resolve())
    expect(mocks.update.mock.calls.at(-1)?.[0].data).toMatchObject({
      reminderEnabled: true,
      scheduledReminders: [{ when: 'same_day', time: '08:00' }],
    })
  })

  it('edits stored scheduled reminders beside due-time offsets', async () => {
    mocks.detail = {
      ...makeDetail(),
      dueTime: '09:00',
      reminderEnabled: true,
      reminderTimes: [15],
      scheduledReminders: [{ when: 'same_day', time: '08:00' }],
    }
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)
    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))

    expect(screen.getByTestId('offset-reminders')).toBeInTheDocument()
    expect(screen.getByTestId('scheduled-reminders')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'remove-scheduled' }))
    await act(async () => Promise.resolve())
    expect(mocks.update.mock.calls.at(-1)?.[0].data).toMatchObject({
      reminderEnabled: true,
      reminderTimes: [15],
      scheduledReminders: [],
    })
  })

  it('sends slip alert state only from the explicit switch action', () => {
    mocks.detail = { ...makeDetail(), isBadHabit: true }
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    fireEvent.click(screen.getByRole('button', { name: 'habits.detail.moreDetails' }))
    expect(screen.getByTestId('list-row-habits.detail.slipAlert')).toHaveAttribute('data-description', 'habits.detail.slipAlertDescription')
    fireEvent.click(screen.getByRole('switch', { name: 'habits.detail.slipAlert' }))

    expect(mocks.update).toHaveBeenCalledOnce()
    expect(mocks.update.mock.calls[0]![0].data).toMatchObject({ slipAlertEnabled: true })
    expect(mocks.update.mock.calls[0]![0].data).not.toHaveProperty('goalIds')
  })

  it('keeps the title editor open and reports an update failure', async () => {
    mocks.update.mockRejectedValueOnce(new Error('update failed'))
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    fireEvent.click(screen.getByRole('button', { name: 'Read' }))
    const input = screen.getByRole('textbox', { name: 'rename' })
    fireEvent.change(input, { target: { value: 'Read daily' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await act(async () => { await Promise.resolve() })
    expect(mocks.showError).toHaveBeenCalledWith('habits.detail.updateError')
    expect(screen.getByRole('textbox', { name: 'rename' })).toHaveValue('Read daily')
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

  it('clears a checklist only after confirmation', async () => {
    mocks.detail = { ...makeDetail(), checklistItems: [{ text: 'First', isChecked: false }] }
    mocks.checklist.mockResolvedValueOnce(undefined)
    render(<HabitDetailScreen habitId="habit-1" date="2026-08-28" />)

    fireEvent.click(screen.getByRole('button', { name: 'clear-checklist' }))
    expect(mocks.checklist).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('confirm-habits.checklistClearTitle'))
    await act(async () => Promise.resolve())

    expect(mocks.checklist).toHaveBeenCalledOnce()
    expect(mocks.checklist).toHaveBeenCalledWith({ habitId: 'habit-1', items: [] })
    expect(screen.queryByTestId('confirm-habits.checklistClearTitle')).not.toBeInTheDocument()
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
          const button = element.querySelector('button')!
          const style = getComputedStyle(button)
          const fontSize = parseFloat(style.fontSize) * 2
          const lineHeight = parseFloat(style.lineHeight) * 2
          button.style.fontSize = `${fontSize}px`
          button.style.lineHeight = `${lineHeight}px`
          const range = document.createRange()
          range.selectNodeContents(button)
          const text = range.getBoundingClientRect()
          const bounds = button.getBoundingClientRect()
          const column = element.closest('[data-habit-detail-content]')!
          const columnStyle = getComputedStyle(column)
          return { whiteSpace: style.whiteSpace, textOverflow: style.textOverflow,
            lines: range.getClientRects().length, inside: text.right <= bounds.right + 1 && text.bottom <= bounds.bottom + 1,
            width: bounds.width, available: column.getBoundingClientRect().width - parseFloat(columnStyle.paddingLeft) - parseFloat(columnStyle.paddingRight), leading: lineHeight / fontSize }
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
        expect(geometry.contentWidth).toBe(width < 640 ? width - 32 : 620)
        expect(geometry.headerInset).toBe(geometry.columnInset)
        const rename = title.getByRole('button', { name: habitTitle, exact: true })
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
