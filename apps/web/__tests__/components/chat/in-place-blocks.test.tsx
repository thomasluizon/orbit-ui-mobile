import { personalText } from '@/__tests__/support/personal-text'
import { ChatBlock } from '@/components/chat/block-registry'
import { chatNavigationCases } from '@orbit/shared/test-support/chat-navigation-fixtures'
import type { ReactNode, MouseEventHandler } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inPlaceDayFixture, inPlaceCalendarFixture } from '@orbit/shared/__tests__/in-place-block-fixtures'
import { createMockHabit, createMockGoal } from '@orbit/shared/__tests__/factories'
import { DaySummaryCard } from '@/components/chat/day-summary-card'
import { CalendarCard } from '@/components/chat/calendar-card'
import { GoalListCard } from '@/components/chat/goal-list-card'
import { MetricsCard } from '@/components/chat/metrics-card'
import { useUIStore } from '@/stores/ui-store'
import { StreakCard } from '@/components/chat/streak-card'
import { DestinationShell } from '@/components/shell/destination-shell'

const state = vi.hoisted(() => ({
  push: vi.fn(), mutate: vi.fn(), refetch: vi.fn(), pro: true, pathname: '/', wide: false,
  disconnected: false,
  query: { isPending: false, isError: false, isRefetchError: false },
  habits: new Map(), goals: new Map(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: state.push }), usePathname: () => state.pathname, useParams: () => ({}) }))
vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string, values?: Record<string, unknown>) => values ? `${key}:${JSON.stringify(values)}` : key }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: { name: 'Person', email: 'person@example.com', hasProAccess: state.pro, timeZone: 'UTC', uses24HourClock: true } }) }))
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleUnreadCount: 0 }) }))
vi.mock('@/components/command/command-palette', () => ({ CommandPalette: () => null }))
vi.mock('@/hooks/use-is-desktop', () => ({ useIsWideDesktop: () => state.wide }))
vi.mock('@/hooks/use-habits', () => ({
  useHabits: () => ({ ...state.query, data: { habitsById: state.habits }, refetch: state.refetch }),
  useLogHabit: () => ({ mutate: state.mutate, mutateAsync: state.mutate }),
  useHabitMetrics: () => ({ ...state.query, refetch: state.refetch }),
}))
vi.mock('@/hooks/use-goals', () => ({ useGoals: () => ({ ...state.query, data: { goalsById: state.goals }, refetch: state.refetch }) }))
vi.mock('@/hooks/use-recap', () => ({ useProgressRecap: () => ({ ...state.query, refetch: state.refetch }) }))
vi.mock('@/hooks/use-calendar-events', () => ({ useCalendarEvents: () => ({ ...state.query, data: state.disconnected ? { status: 'not-connected', events: [] } : undefined, refetch: state.refetch }) }))
vi.mock('@/hooks/use-calendars', () => ({ useCalendars: () => ({ data: [{ id: 'one' }, { id: 'two' }] }) }))
vi.mock('@/hooks/use-gamification', () => ({ useStreakFreeze: () => ({
  streakQuery: { ...state.query, refetch: state.refetch },
  streakInfo: { currentStreak: 3, longestStreak: 9, lastActiveDate: '2026-10-17', isFrozenToday: false, recentFreezeDates: [] },
  streakFreezesAccumulated: 2, maxStreakFreezesAccumulated: 3, freezesUsedThisMonth: 1, daysUntilNextFreeze: 4,
}) }))
beforeEach(() => {
  vi.clearAllMocks()
  state.mutate.mockReset().mockImplementation(() => new Promise(() => {}))
  state.pathname = '/'
  state.pro = true
  state.disconnected = false
  useUIStore.getState().setAstraConversationOpen(true)
  state.query = { isPending: false, isError: false, isRefetchError: false }
  state.habits.clear(); state.goals.clear()
  for (const item of inPlaceDayFixture.rows ?? []) state.habits.set(item.id, createMockHabit({ id: item.id, title: item.title }))
})

describe('Astra blocks act on app state', () => {
  it('shows twenty rows, reports all rows and locks a double tap until the log settles', () => {
    const view = render(<DaySummaryCard daySummary={inPlaceDayFixture} />)
    const log = screen.getByRole('button', { name: 'chat.habitList.log:{"name":"Habit 1"}' })
    expect(screen.getAllByRole('button', { name: /chat.habitList.open/ })).toHaveLength(20)
    expect(screen.queryByRole('button', { name: /Habit 21/ })).not.toBeInTheDocument()
    expect(screen.getByText('chat.daySummary.rowCount:{"shown":20,"total":25}')).toBeInTheDocument()
    fireEvent.click(log); fireEvent.click(log)
    expect(state.mutate).toHaveBeenCalledTimes(1)
    expect(state.mutate.mock.calls[0]![0]).toEqual(expect.objectContaining({ habitId: 'habit-1', intent: 'log' }))
    expect(view.container.querySelector('section')).toHaveAttribute('data-state', 'acting')
    state.habits.set('habit-1', createMockHabit({ id: 'habit-1', title: 'Habit 1', isLoggedInRange: true }))
    view.rerender(<DaySummaryCard daySummary={inPlaceDayFixture} />)
    expect(screen.getByRole('button', { name: 'chat.habitList.unlog:{"name":"Habit 1"}' })).toBeInTheDocument()
  })

  it('updates a row after a log on Hoje without changing the reply', () => {
    const view = render(<DaySummaryCard daySummary={inPlaceDayFixture} />)
    state.habits.set('habit-1', createMockHabit({ id: 'habit-1', title: 'Habit 1', isLoggedInRange: true }))
    view.rerender(<DaySummaryCard daySummary={inPlaceDayFixture} />)
    expect(screen.getByRole('button', { name: 'chat.habitList.unlog:{"name":"Habit 1"}' })).toBeInTheDocument()
    expect(state.mutate).not.toHaveBeenCalled()
  })

  it('shows an event source and opens the calendar sheet with its encoded identity', () => {
    render(<CalendarCard calendarCard={inPlaceCalendarFixture} />)
    expect(screen.getByRole('group', { name: /Walk with the team, Work/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'chat.calendarCard.makeHabit:{"title":"Walk with the team"}' }))
    expect(state.push).toHaveBeenCalledWith('/calendar?import=1&event=event%20%2Fone')
    expect(useUIStore.getState().astraConversationOpen).toBe(false)
  })

  it('withholds calendar content for a free account', () => {
    state.pro = false
    const view = render(<CalendarCard calendarCard={inPlaceCalendarFixture} />)
    expect(view.container).toBeEmptyDOMElement()
  })

  it('preserves goal progress and names its actual linked source', () => {
    state.goals.set('goal-1', createMockGoal({ id: 'goal-1', title: 'Move', currentValue: 6, targetValue: 10, isProgressDerived: true, linkedHabits: [{ id: 'habit-1', title: 'Walk' }] }))
    render(<GoalListCard goalList={{ items: [{ id: 'goal-1', title: 'Move', current: 1, target: 10, unit: 'km' }] }} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '10')
    expect(screen.getByText(personalText('goals.linkedHabits: Walk'))).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'goals.linkedHabits: Walk' })).not.toBeInTheDocument()
  })
})

it.each([
  [{ isPending: true, isError: false, isRefetchError: false }, 'loading'],
  [{ isPending: false, isError: true, isRefetchError: false }, 'partiallyFailed'],
  [{ isPending: false, isError: true, isRefetchError: true }, 'stale'],
] as const)('shares query states across action queries while metrics retain their snapshot: %s', (query, expected) => {
  state.query = { ...query }
  state.goals.set('goal-1', createMockGoal({ id: 'goal-1' }))
  const view = render(<>
    <DaySummaryCard daySummary={inPlaceDayFixture} />
    <CalendarCard calendarCard={inPlaceCalendarFixture} />
    <GoalListCard goalList={{ items: [{ id: 'goal-1', title: 'Move', current: 1, target: 10, unit: 'km' }] }} />
    <StreakCard streakCard={{ currentStreak: 3, longestStreak: 9, level: 1, totalXp: 20, xpForNextLevel: 100, lastActiveDate: null, isFrozenToday: false, recentFreezeDates: [], recentAchievements: [], surfaceId: 'progress' }} />
    <MetricsCard metricsCard={{ period: 'week', completionRate: 50, activeDays: 3, totalCompletions: 3, totalScheduled: 6, currentStreak: 3, bestStreak: 9, hasData: true, surfaceId: 'progress' }} />
  </>)
  expect(view.container.querySelectorAll(`section[data-state="${expected}"]`)).toHaveLength(4)
  if (expected === 'partiallyFailed') expect(screen.getAllByRole('alert')).toHaveLength(4)
})

it('retains freeze facts under a compact streak without shell navigation', () => {
  const view = render(<StreakCard streakCard={{ currentStreak: 3, longestStreak: 9, level: 1, totalXp: 20, xpForNextLevel: 100, lastActiveDate: null, isFrozenToday: false, recentFreezeDates: [], recentAchievements: [], surfaceId: 'progress' }} />)
  expect(view.container.querySelector('[data-component="freeze-bank"]')).toHaveTextContent('progressScreen.streak.banked')
  expect(screen.getByText('progressScreen.streak.longest')).toBeInTheDocument()
  expect(screen.getByText('streakDisplay.detail.tierTileLabel')).toBeInTheDocument()
  expect(screen.getByText('progressScreen.streak.protectedDays')).toBeInTheDocument()
  expect(view.container.querySelector('[data-compact-figure]')).toHaveTextContent('3')
  expect(screen.queryByRole('button', { name: 'chat.streakCard.open' })).not.toBeInTheDocument()
})

it('puts at most three numerical figures beside the chart', () => {
  const view = render(<MetricsCard metricsCard={{ period: 'habit', habitId: 'habit-1', completionRate: 50, activeDays: 3, totalCompletions: 3, totalScheduled: 6, currentStreak: 3, bestStreak: 9, hasData: true, surfaceId: 'progress' }} />)
  expect(view.container.querySelectorAll('[data-compact-figure]')).toHaveLength(3)
})

it('keeps cached habits loggable after an offline refetch error', () => {
  state.query = { isPending: false, isError: true, isRefetchError: true }
  render(<DaySummaryCard daySummary={inPlaceDayFixture} />)
  const log = screen.getByRole('button', { name: 'chat.habitList.log:{"name":"Habit 1"}' })
  expect(log).toBeEnabled()
  fireEvent.click(log)
  expect(state.mutate).toHaveBeenCalledTimes(1)
})

it('offers calendar reconnection and disables import after disconnection', () => {
  state.disconnected = true
  const view = render(<CalendarCard calendarCard={inPlaceCalendarFixture} />)
  expect(view.container.querySelector('section')).toHaveAttribute('data-state', 'partiallyFailed')
  expect(screen.getByRole('alert')).toHaveTextContent('chat.calendarCard.syncState.ReconnectRequired')
  expect(screen.getByRole('button', { name: /chat.calendarCard.makeHabit/ })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'chat.calendarCard.open' }))
  expect(state.push).toHaveBeenCalledWith('/calendar?import=1')
})

it('puts a payload sync error in the calendar actions area', () => {
  const view = render(<CalendarCard calendarCard={{ ...inPlaceCalendarFixture, sync: { enabled: true, status: 'TransientError', lastSyncedAt: null } }} />)
  expect(screen.getByRole('alert')).toHaveTextContent('chat.calendarCard.syncState.TransientError')
  expect(view.container.querySelector('[data-action-row]')).toContainElement(screen.getByRole('alert'))
})


it.each(['child', 'bad'] as const)('counts a completed %s row according to the single-day schedule', (kind) => {
  const parent = inPlaceDayFixture.rows![0]!
  const extra = { ...parent, id: 'extra', title: 'Extra', depth: kind === 'child' ? 1 : 0, isBadHabit: kind === 'bad' }
  const snapshot = { ...inPlaceDayFixture, due: 2, done: 0, rows: [parent, extra] }
  state.habits.set(extra.id, createMockHabit({ id: extra.id, title: extra.title, isBadHabit: extra.isBadHabit, isLoggedInRange: true }))
  const view = render(<DaySummaryCard daySummary={snapshot} />)
  expect(screen.getByText(`chat.daySummary.doneOfDue:{"done":${kind === 'child' ? 1 : 0},"due":2}`)).toBeInTheDocument()
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', kind === 'child' ? '50' : '0')
  view.unmount()
})

vi.mock('@/hooks/use-notifications', () => ({ useMarkNotificationRead: () => ({ mutateAsync: vi.fn() }) }))

function NavigationApp({ part }: Readonly<{ part: typeof chatNavigationCases[number]['part'] }>) {
  const open = useUIStore(state => state.astraConversationOpen)
  return <DestinationShell conversation={<ChatBlock part={part} onActionChipClick={undefined} />} conversationOpen={open}
    conversationLabel="Astra" onCreate={vi.fn()}><h1>{state.pathname}</h1></DestinationShell>
}

it.each(chatNavigationCases.flatMap(scenario => [false, true].map(wide => ({ ...scenario, wide }))))('reveals the destination outside full-screen Astra from $name with wide=$wide', ({ part, label, web, wide }) => {
  state.wide = wide
  const openAtNavigation: boolean[] = []
  state.push.mockImplementation((pathname: string) => {
    openAtNavigation.push(useUIStore.getState().astraConversationOpen)
    state.pathname = pathname
  })
  state.goals.set('goal-1', createMockGoal({ id: 'goal-1' }))
  const view = render(<NavigationApp part={part} />)
  expect(screen.getByRole('dialog', { name: 'Astra' })).toBeVisible()
  expect(view.container.querySelector('[data-shell-destination]')).toHaveAttribute('inert')
  const action = screen.queryByRole('link', { name: label }) ?? screen.queryByRole('button', { name: label })
  if (['habit row', 'dated habit row', 'day habit row', 'calendar import'].includes(part.kind === 'habitList' ? part.block.date ? 'dated habit row' : 'habit row' : part.kind === 'daySummary' && label.includes('habitList.open') ? 'day habit row' : label.includes('makeHabit') ? 'calendar import' : '')) {
    expect(action).not.toBeNull()
    fireEvent.click(action!)
    expect(state.push).toHaveBeenCalledWith(web)
    expect(openAtNavigation).toEqual([false])
  } else {
    expect(action).toBeNull()
    expect(state.push).not.toHaveBeenCalled()
  }
})

vi.mock('next/link', () => ({ default: ({ href, onClick, onNavigate, children }: {
  href: string; onClick?: MouseEventHandler<HTMLAnchorElement>; onNavigate?: (event: { preventDefault: () => void }) => void; children: ReactNode
}) => <a href={href} onClick={event => {
  onClick?.(event)
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  const cancellation = { prevented: false }
  onNavigate?.({ preventDefault: () => { cancellation.prevented = true } })
  if (!cancellation.prevented) state.push(href)
}}>{children}</a> }))

it('keeps a second day check usable while the first is pending', () => {
  render(<DaySummaryCard daySummary={inPlaceDayFixture} />)
  fireEvent.click(screen.getByRole('button', { name: 'chat.habitList.log:{"name":"Habit 1"}' }))
  const second = screen.getByRole('button', { name: 'chat.habitList.log:{"name":"Habit 2"}' })
  expect(second).toBeEnabled()
  fireEvent.click(second)
  expect(state.mutate).toHaveBeenCalledTimes(2)
})

it('keeps the ring and total in step with live completion and rollback', () => {
  const snapshot = { ...inPlaceDayFixture, rows: inPlaceDayFixture.rows!.slice(0, 1), due: 1 }
  const view = render(<DaySummaryCard daySummary={snapshot} />)
  state.habits.set('habit-1', createMockHabit({ id: 'habit-1', isLoggedInRange: true }))
  view.rerender(<DaySummaryCard daySummary={snapshot} />)
  expect(screen.getByText('chat.daySummary.doneOfDue:{"done":1,"due":1}')).toBeInTheDocument()
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  state.habits.set('habit-1', createMockHabit({ id: 'habit-1', isLoggedInRange: false }))
  view.rerender(<DaySummaryCard daySummary={snapshot} />)
  expect(screen.getByText('chat.daySummary.doneOfDue:{"done":0,"due":1}')).toBeInTheDocument()
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
})

it('marks only the failed day row after overlapping requests settle', async () => {
  let rejectFirst!: (error: Error) => void
  let resolveSecond!: () => void
  state.mutate.mockImplementationOnce(() => new Promise((_, reject) => { rejectFirst = reject }))
    .mockImplementationOnce(() => new Promise<void>(resolve => { resolveSecond = resolve }))
  const view = render(<DaySummaryCard daySummary={inPlaceDayFixture} />)
  fireEvent.click(screen.getByRole('button', { name: 'chat.habitList.log:{"name":"Habit 1"}' }))
  fireEvent.click(screen.getByRole('button', { name: 'chat.habitList.log:{"name":"Habit 2"}' }))
  await act(async () => { resolveSecond(); rejectFirst(new Error('offline')) })
  const rows = view.container.querySelectorAll('[data-habit-block-row]')
  expect(rows[0]!.querySelector('[role="alert"]')).toHaveTextContent('chat.liveBlock.error')
  expect(rows[1]!.querySelector('[role="alert"]')).toBeNull()
  expect(screen.getByRole('button', { name: 'chat.habitList.log:{"name":"Habit 1"}' })).toBeEnabled()
})

it('keeps a failed check visible on its own day row until retry', async () => {
  let reject!: (error: Error) => void
  state.mutate.mockImplementationOnce((_input: unknown, callbacks?: { onError: () => void }) => {
    const request = new Promise((_, fail) => { reject = fail })
    void request.catch(() => callbacks?.onError())
    return request
  })
  const view = render(<DaySummaryCard daySummary={inPlaceDayFixture} />)
  fireEvent.click(screen.getByRole('button', { name: 'chat.habitList.log:{"name":"Habit 1"}' }))
  await act(async () => { reject(new Error('offline')) })
  const rows = view.container.querySelectorAll('[data-habit-block-row]')
  expect(rows[0]!.querySelector('[role="alert"]')).toHaveTextContent('chat.liveBlock.error')
  expect(rows[1]!.querySelector('[role="alert"]')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'chat.habitList.log:{"name":"Habit 1"}' }))
  expect(rows[0]!.querySelector('[role="alert"]')).toBeNull()
})

it('offers reconnection when the sync snapshot requires it', () => {
  render(<CalendarCard calendarCard={{ ...inPlaceCalendarFixture, sync: { enabled: true, status: 'ReconnectRequired', lastSyncedAt: null } }} />)
  fireEvent.click(screen.getByRole('button', { name: 'chat.calendarCard.open' }))
  expect(state.push).toHaveBeenCalledWith('/calendar?import=1')
})

it('does not ask to reload a stale goal block without a reload action', () => {
  state.query = { isPending: false, isError: true, isRefetchError: true }
  const view = render(<GoalListCard goalList={{ items: [{ id: 'missing', title: 'Move', current: 1, target: 10, unit: 'km' }] }} />)
  expect(view.container).not.toHaveTextContent('chat.liveBlock.stale')
  expect(view.container).toHaveTextContent('chat.liveBlock.unavailable')
})
