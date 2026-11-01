import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { createMockProfile } from '@orbit/shared/__tests__/factories'
import { formatAPIDate } from '@orbit/shared/utils'
import { TodayPageClient } from '@/app/(app)/today-page-client'
import { DestinationShell } from '@/components/shell/destination-shell'
import { ShellScrollerProvider } from '@/components/shell/shell-scroller-context'
import { useUIStore } from '@/stores/ui-store'

const navigation = vi.hoisted(() => ({ pathname: '/', date: null as string | null, width: 600, push: vi.fn() }))
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(navigation.date ? { date: navigation.date } : {}),
  useRouter: () => ({ push: navigation.push, replace: navigation.push }),
}))
vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string) => key }))
vi.mock('@/hooks/use-is-desktop', () => ({ useIsWideDesktop: () => navigation.width >= 1024 }))
vi.mock('@/hooks/use-profile', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/hooks/use-profile')>(),
  useProfile: () => ({ profile: createMockProfile({ timeZone: 'Pacific/Kiritimati' }) }),
}))
vi.mock('@/app/(app)/today-provider', () => ({ useToday: () => '2026-09-12' }))
vi.mock('@/hooks/use-keyboard-shortcuts', () => ({ useKeyboardShortcuts: () => {} }))
vi.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => ({ currentTheme: 'dark', toggleTheme: vi.fn() }) }))
vi.mock('@/components/command/command-palette', () => ({ CommandPalette: () => null }))
vi.mock('@/components/navigation/notification-bell', () => ({ NotificationBell: () => null }))
vi.mock('@/components/today/setup-checklist-card', () => ({ SetupChecklistCard: () => null }))
vi.mock('@/components/today/today-astra', () => ({ TodayAstra: () => null }))
vi.mock('@/hooks/use-offline', () => ({ useOffline: () => ({ isOnline: true }) }))
vi.mock('@/app/(app)/use-today-habits-data', () => ({ useTodayHabitsData: () => ({ hasFetched: true, habitsCount: 1 }) }))
vi.mock('@/app/(app)/use-today-selection', () => ({ useTodaySelection: () => ({ showBulkDeleteConfirm: false }) }))
vi.mock('@/components/habits/selection-tray', () => ({ SelectionTray: () => null }))
vi.mock('@/components/habits/habit-list', () => ({
  HabitList: (props: { view: string; selectedDate?: Date; searchQuery: string; showCompleted: boolean }) =>
    <output data-testid="list" data-view={props.view} data-date={props.selectedDate && formatAPIDate(props.selectedDate)}
      data-search={props.searchQuery} data-completed={String(props.showCompleted)} />,
}))

function Surface() {
  return <ShellScrollerProvider><DestinationShell onCreate={() => {}}>
    <TodayPageClient initialToday="2026-09-12" initialHabits={null} />
  </DestinationShell></ShellScrollerProvider>
}

beforeEach(() => {
  vi.clearAllMocks()
  navigation.pathname = '/'
  navigation.date = '2026-09-09'
  useUIStore.setState(useUIStore.getInitialState())
  navigation.push.mockImplementation(() => { navigation.pathname = '/'; navigation.date = null })
})

it.each([600, 1100, 1352].flatMap((width) => ['today', 'all', 'general'].flatMap((view) => ['/', '/calendar', '/progress', '/profile', '/habits/example'].map((from) => ({ width, view, from })))))(
  'resets Hoje through its real navigation entry at $width from $from with $view selected, including a second press', async ({ width, view, from }) => {
    navigation.width = width
    const rendered = render(<Surface />)
    const scroller = document.querySelector<HTMLElement>('[data-shell-scroller]')!
    const scrollTo = vi.fn()
    scroller.scrollTo = scrollTo
    for (let activation = 0; activation < 2; activation++) {
      if (view !== 'today') fireEvent.click(screen.getByRole('radio', { name: view === 'all' ? 'habits.viewAll' : 'habits.viewGeneral' }))
      fireEvent.click(screen.getByRole('button', { name: 'habits.search.title' }))
      fireEvent.change(screen.getByRole('textbox', { name: 'habits.search.title' }), { target: { value: 'needle' } })
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 310)) })
      fireEvent.click(screen.getByRole('button', { name: 'habits.listOptions' }))
      await act(async () => { await vi.dynamicImportSettled() })
      fireEvent.click(screen.getByRole('menuitem', { name: 'habits.showCompletedMenu' }))
      expect(screen.getByTestId('list')).toHaveAttribute('data-completed', 'true')
      await act(async () => { useUIStore.setState({ activeFilters: { frequencyUnit: 'Week' }, isSelectMode: true,
        selectedHabitIds: new Set(['habit']), manuallySelectedIds: new Set(['habit']) }) })
      fireEvent.click(screen.getByRole('button', { name: 'habits.listOptions' }))
      expect(screen.getByRole('menu')).toBeInTheDocument()
      navigation.pathname = activation === 0 ? from : '/'
      rendered.rerender(<Surface />)
      const nav = document.querySelector<HTMLElement>(width >= 1024 ? '[data-shell-sidebar] nav' : '[data-shell-tab-bar] nav')!
      fireEvent.click(nav.querySelector<HTMLAnchorElement>('a[href="/"]')!)
      rendered.rerender(<Surface />)
      const list = screen.getByTestId('list')
      expect.soft(list).toHaveAttribute('data-view', 'today')
      expect.soft(list).toHaveAttribute('data-date', '2026-09-12')
      expect.soft(list).toHaveAttribute('data-search', '')
      expect.soft(list).toHaveAttribute('data-completed', 'false')
      expect.soft(screen.queryByRole('textbox', { name: 'habits.search.title' })).not.toBeInTheDocument()
      expect.soft(screen.queryByRole('menu')).not.toBeInTheDocument()
      expect.soft(useUIStore.getState().activeFilters).toEqual({})
      expect.soft(useUIStore.getState().isSelectMode).toBe(false)
      expect.soft(useUIStore.getState().selectedHabitIds.size).toBe(0)
      expect.soft(useUIStore.getState().manuallySelectedIds.size).toBe(0)
      expect.soft(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'instant' })
      if (list.getAttribute('data-completed') !== 'false' || screen.queryByRole('menu')) break
    }
  },
)
