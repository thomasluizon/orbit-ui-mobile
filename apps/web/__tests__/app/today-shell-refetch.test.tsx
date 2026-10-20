import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useTodayPage } from '@/app/(app)/use-today-page'
import { DestinationShell } from '@/components/shell/destination-shell'
import { useUIStore } from '@/stores/ui-store'

const state = vi.hoisted(() => ({
  habits: { hasFetched: true, habitsCount: 1, isFetching: false, showLoadError: false },
}))

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('next/navigation', () => ({ usePathname: () => '/', useParams: () => ({}), useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/use-profile', () => ({ useProfile: () => ({ profile: undefined }) }))
vi.mock('@/hooks/use-notification-inbox', () => ({ useNotificationInbox: () => ({ visibleUnreadCount: 0 }) }))
vi.mock('@/hooks/use-keyboard-shortcuts', () => ({ useKeyboardShortcuts: () => {} }))
vi.mock('@/components/command/command-palette', () => ({ CommandPalette: () => null }))
vi.mock('@/app/(app)/use-today-navigation', () => ({ useTodayNavigation: () => ({ dateStr: '2026-09-04' }) }))
vi.mock('@/app/(app)/use-today-selection', () => ({ useTodaySelection: () => ({}) }))
vi.mock('@/app/(app)/use-today-habits-data', () => ({ useTodayHabitsData: () => state.habits }))

function TodayShell() {
  useTodayPage('2026-09-04', null)
  return <DestinationShell onCreate={() => {}} composer={<textarea aria-label="Draft" defaultValue="Keep this draft" />}>
    <h1>Today</h1>
  </DestinationShell>
}

beforeEach(() => {
  state.habits = { hasFetched: true, habitsCount: 1, isFetching: false, showLoadError: false }
  useUIStore.setState({ todayFabHidden: false, isSelectMode: false, showCreateModal: false })
})

it('retains the FAB and composer through a pending habits refresh', () => {
  const { rerender } = render(<TodayShell />)
  const fab = document.querySelector('[data-shell-fab] [data-fab]')
  expect(fab).not.toBeNull()
  const composer = screen.getByRole('textbox', { name: 'Draft' })
  state.habits = { ...state.habits, isFetching: true }
  rerender(<TodayShell />)
  expect(document.querySelector('[data-shell-fab] [data-fab]')).toBe(fab)
  expect(screen.getByRole('textbox', { name: 'Draft' })).toBe(composer)
  state.habits = { ...state.habits, isFetching: false, showLoadError: false }
  rerender(<TodayShell />)
  expect(document.querySelector('[data-shell-fab] [data-fab]')).toBe(fab)
  expect(composer).toHaveValue('Keep this draft')
})

it.each([
  { hasFetched: false, habitsCount: 0, isFetching: true, showLoadError: false },
  { hasFetched: false, habitsCount: 0, isFetching: false, showLoadError: true },
  { hasFetched: true, habitsCount: 0, isFetching: false, showLoadError: false },
])('hides the FAB until a nonempty list is available: %j', (habits) => {
  state.habits = habits
  render(<TodayShell />)
  expect(document.querySelector('[data-shell-fab] [data-fab]')).toBeNull()
  expect(screen.getByRole('textbox', { name: 'Draft' })).toBeVisible()
})
