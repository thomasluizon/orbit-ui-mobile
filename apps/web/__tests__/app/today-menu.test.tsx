vi.mock('@/hooks/use-color-scheme', () => ({ useColorScheme: () => ({ currentTheme: 'dark', toggleTheme: vi.fn() }) }))
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { TodayDateControl, type TodayDateControlProps } from '@/app/(app)/today-shell'
import { useUIStore } from '@/stores/ui-store'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/components/navigation/notification-bell', () => ({ NotificationBell: () => null }))

const props: TodayDateControlProps = {
  dayName: 'Monday', numericDate: '01/01', isTodaySelected: true, nextDisabled: false,
  previousLabel: 'Previous', goToTodayLabel: 'Today', nextLabel: 'Next',
  moreLabel: 'Options', selectLabel: 'Select', collapseLabel: 'Collapse', allCollapsed: false,
  refreshLabel: 'Refresh', completedLabel: 'Completed', showCompleted: false, isFetching: false,
  searchLabel: 'Search', onSearch: vi.fn(), onToggleSelect: vi.fn(), onToggleCollapse: vi.fn(),
  onRefresh: vi.fn(), onToggleCompleted: vi.fn(), onGoToPreviousDay: vi.fn(),
  onGoToToday: vi.fn(), onGoToNextDay: vi.fn(),
}

beforeEach(() => useUIStore.getState().setFilters({ frequencyUnit: undefined }))

it.each([true, false])('resets options when the frequency menu reopens by keyboard with wide=%s', async (wide) => {
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches: wide, media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }))
  render(<TodayDateControl {...props} />)
  const trigger = screen.getByRole('button', { name: 'Options' })
  await userEvent.click(trigger)
  await userEvent.click(await screen.findByRole('menuitem', { name: 'habits.frequencyFilter' }))
  await screen.findByRole('menuitemcheckbox', { name: 'habits.filter.daily' })
  await userEvent.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  await waitFor(() => expect(trigger).toHaveFocus())
  fireEvent.keyDown(trigger, { key: 'ArrowDown' })
  expect(await screen.findByRole('menu', { name: 'Options' })).toBeVisible()
  expect(screen.getByRole('menuitem', { name: 'Refresh' })).toBeInTheDocument()
  expect(screen.queryByRole('menuitemcheckbox')).not.toBeInTheDocument()
})
