vi.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => ({ currentTheme: 'dark', toggleTheme: vi.fn() }) }))
import { beforeEach, expect, it, vi } from 'vitest'
import { useEffect, useLayoutEffect } from 'react'
import { render, screen } from '@testing-library/react'
import { useTodayPage } from '@/app/(app)/use-today-page'
import { DestinationShell } from '@/components/shell/destination-shell'
import { useUIStore } from '@/stores/ui-store'

const state = vi.hoisted(() => ({
  paints: [] as boolean[],
  pathname: '/',
  width: 412,
  habits: { hasFetched: true, habitsCount: 1, isFetching: false, showLoadError: false },
}))

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', () => ({ usePathname: () => state.pathname, useParams: () => ({}), useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: undefined }) }))
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleUnreadCount: 0 }) }))
vi.mock('@/hooks/use-keyboard-shortcuts', () => ({ useKeyboardShortcuts: () => {} }))
vi.mock('@/components/command/command-palette', () => ({ CommandPalette: () => null }))
vi.mock('@/app/(app)/use-today-navigation', () => ({ useTodayNavigation: () => ({ dateStr: '2026-09-04' }) }))
vi.mock('@/app/(app)/use-today-selection', () => ({ useTodaySelection: () => ({}) }))
vi.mock('@/app/(app)/use-today-habits-data', () => ({ useTodayHabitsData: () => state.habits }))

function FirstPaint() {
  useLayoutEffect(() => { state.paints.push(document.querySelector('[data-shell-fab] [data-fab]') !== null) })
  return null
}

function TodayShell({ mounted = true }: { mounted?: boolean }) {
  const todayFabHidden = useUIStore((state) => state.todayFabHidden)
  return <DestinationShell todayFabHidden={todayFabHidden} onCreate={() => {}}><FirstPaint />{mounted ? <TodayPage /> : null}</DestinationShell>
}

function TodayPage() {
  useTodayPage('2026-09-04', null)
  return <h1>Today</h1>
}

beforeEach(() => {
  state.habits = { hasFetched: true, habitsCount: 1, isFetching: false, showLoadError: false }
  state.paints = []
  state.pathname = '/'
  state.width = 412
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: state.width >= Number(query.match(/min-width: (\d+)px/)?.[1]),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
  useUIStore.setState(useUIStore.getInitialState())
})

it('retains the create FAB and Astra entry through a pending habits refresh', () => {
  const { rerender } = render(<TodayShell />)
  const fab = document.querySelector('[data-shell-fab] [data-fab]')
  expect(fab).not.toBeNull()
  const entry = screen.getByRole('button', { name: 'shell.astraButton.open' })
  state.habits = { ...state.habits, isFetching: true }
  rerender(<TodayShell />)
  expect(document.querySelector('[data-shell-fab] [data-fab]')).toBe(fab)
  expect(screen.getByRole('button', { name: 'shell.astraButton.open' })).toBe(entry)
  state.habits = { ...state.habits, isFetching: false, showLoadError: false }
  rerender(<TodayShell />)
  expect(document.querySelector('[data-shell-fab] [data-fab]')).toBe(fab)
  expect(screen.getByRole('button', { name: 'shell.astraButton.open' })).toBe(entry)
  expect(screen.queryByRole('textbox')).toBeNull()
})

it.each([
  { hasFetched: false, habitsCount: 0, isFetching: true, showLoadError: false },
  { hasFetched: false, habitsCount: 3, isFetching: true, showLoadError: false },
])('draws the create FAB on the first frame while every Today query is pending: %j', (habits) => {
  state.habits = habits
  render(<TodayShell />)
  expect(state.paints).toEqual([true])
  expect(document.querySelector('[data-shell-fab] [data-fab]')).not.toBeNull()
  expect(screen.getByRole('button', { name: 'shell.astraButton.open' })).toBeVisible()
})

it.each([
  { hasFetched: false, habitsCount: 0, isFetching: false, showLoadError: true },
  { hasFetched: true, habitsCount: 0, isFetching: false, showLoadError: false },
])('hides the FAB once the settled Today has an error or an empty list: %j', (habits) => {
  state.habits = habits
  render(<TodayShell />)
  expect(document.querySelector('[data-shell-fab] [data-fab]')).toBeNull()
  expect(screen.queryByRole('textbox')).toBeNull()
  expect(screen.getByRole('button', { name: 'shell.astraButton.open' })).toBeVisible()
})

it('keeps the pending FAB in place when the list arrives and again after returning to Today', () => {
  state.habits = { hasFetched: false, habitsCount: 0, isFetching: true, showLoadError: false }
  const view = render(<TodayShell />)
  const fab = document.querySelector('[data-shell-fab] [data-fab]')
  expect(fab).not.toBeNull()
  state.habits = { hasFetched: true, habitsCount: 2, isFetching: false, showLoadError: false }
  view.rerender(<TodayShell />)
  expect(document.querySelector('[data-shell-fab] [data-fab]')).toBe(fab)
  state.paints = []
  view.rerender(<TodayShell mounted={false} />)
  view.rerender(<TodayShell />)
  expect(state.paints.every(Boolean)).toBe(true)
})

it('commits the FAB hidden by the end of the first layout phase when Today returns over a list cached empty', () => {
  state.habits = { hasFetched: true, habitsCount: 0, isFetching: false, showLoadError: false }
  const atLayoutEnd: boolean[] = []
  function AfterToday() {
    useLayoutEffect(() => { atLayoutEnd.push(useUIStore.getState().todayFabHidden) })
    return null
  }
  function ReturningToday() {
    const setTodayFabHidden = useUIStore((store) => store.setTodayFabHidden)
    useEffect(() => () => setTodayFabHidden(false), [setTodayFabHidden])
    return <TodayPage />
  }
  function ReturnShell({ mounted }: { mounted: boolean }) {
    const todayFabHidden = useUIStore((store) => store.todayFabHidden)
    return <DestinationShell todayFabHidden={todayFabHidden} onCreate={() => {}}>{mounted ? <ReturningToday /> : null}<AfterToday /></DestinationShell>
  }
  const view = render(<ReturnShell mounted />)
  view.rerender(<ReturnShell mounted={false} />)
  expect(useUIStore.getState().todayFabHidden).toBe(false)
  atLayoutEnd.length = 0
  view.rerender(<ReturnShell mounted />)
  expect(atLayoutEnd[0]).toBe(true)
  expect(document.querySelector('[data-shell-fab]')).toBeNull()
})

it.each([412, 1280])('draws the whole shell, including the create control, at %i with every query pending', (width) => {
  state.width = width
  state.habits = { hasFetched: false, habitsCount: 0, isFetching: true, showLoadError: false }
  const view = render(<TodayShell />)
  expect(screen.getAllByRole('button', { name: 'nav.createHabit' }).length).toBeGreaterThan(0)
  expect(view.container.querySelector('[data-shell-sidebar]')).not.toBeNull()
  expect(view.container.querySelector('[data-shell-tab-bar]')).not.toBeNull()
})

it('never toggles the FAB visibility for a populated Today, including during refresh', () => {
  const visibility: boolean[] = []
  const unsubscribe = useUIStore.subscribe((next, previous) => {
    if (next.todayFabHidden !== previous.todayFabHidden) visibility.push(!next.todayFabHidden)
  })
  try {
    const view = render(<TodayShell />)
    state.habits = { ...state.habits, isFetching: true }
    view.rerender(<TodayShell />)
    state.habits = { ...state.habits, isFetching: false }
    view.rerender(<TodayShell />)
    expect(visibility).toEqual([])
    expect(document.querySelector('[data-shell-fab] [data-fab]')).not.toBeNull()
  } finally { unsubscribe() }
})

it.each([412, 1280].flatMap(width => [false, true].map(showLoadError => ({ width, showLoadError }))))(
  'removes the FAB slot and floating viewport for settled Today at $width with load error=$showLoadError', ({ width, showLoadError }) => {
    state.width = width
    state.habits = { hasFetched: !showLoadError, habitsCount: 0, isFetching: false, showLoadError }
    const view = render(<TodayShell />)
    expect(view.container.querySelector('[data-shell-fab]')).toBeNull()
    const column = view.container.querySelector('[data-shell-fab-clip]')
    if (width < 1024) expect(column?.querySelector('[data-shell-astra-button] [data-astra-button]')).not.toBeNull()
    else expect(column).toBeNull()
    expect(view.container.querySelector('[data-shell-bottom-viewport]')).toHaveAttribute('data-floating', 'false')
    expect(view.container.querySelector('[data-shell-destination-viewport]')).toHaveAttribute('data-floating', 'false')
    state.habits = { ...state.habits, isFetching: true }
    view.rerender(<TodayShell />)
    expect(view.container.querySelector('[data-shell-fab]')).toBeNull()
    expect(view.container.querySelector('[data-shell-bottom-viewport]')).toHaveAttribute('data-floating', 'false')
  },
)

it.each(['/calendar', '/progress', '/profile', '/habits/habit-1'])(
  'uses its own chrome on %s while Today is pending', (pathname) => {
    state.pathname = pathname
    const view = render(<TodayShell mounted={false} />)
    expect(view.container.querySelector('[data-shell-fab]')).toBeNull()
    expect(view.container.querySelector('[data-shell-bottom-viewport]')).toHaveAttribute('data-floating', 'false')
    expect(view.container.querySelector('[data-shell-destination-viewport]')).toHaveAttribute('data-floating', 'false')
  },
)
