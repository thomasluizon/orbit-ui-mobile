import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { habitKeys } from '@orbit/shared/query'
import { formatAPIDate, formatAPIDateInTimeZone, habitListQueryFilters } from '@orbit/shared/utils'
import { createMockHabitScheduleItem } from '@orbit/shared/__tests__/factories'
import { inPlaceDayFixture } from '@orbit/shared/__tests__/in-place-block-fixtures'
import { DaySummaryCard } from '@/components/chat/day-summary-card'
import { logHabit } from '@/lib/actions/habits'
import { useAuthStore } from '@/stores/auth-store'
import type { HabitScheduleItem } from '@orbit/shared/types/habit'

vi.mock('@/lib/actions/habits', () => ({ logHabit: vi.fn() }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn(), showPersistentError: vi.fn() }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string, values?: Record<string, unknown>) => values ? `${key}:${JSON.stringify(values)}` : key }))

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.getState().setAuth({ userId: 'account-a', name: 'Alex', email: 'alex@example.com' })
  vi.mocked(logHabit).mockImplementation(() => new Promise(() => {}))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

function mountDay(habit: HabitScheduleItem, date = inPlaceDayFixture.date) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  const key = habitKeys.list(habitListQueryFilters({ dateFrom: date, dateTo: date, includeGeneral: true, includeOverdue: true }, true))
  client.setQueryData(key, [habit])
  const snapshot = { ...inPlaceDayFixture, date, due: 1, rows: [{ ...inPlaceDayFixture.rows![0]!, isBadHabit: habit.isBadHabit }] }
  const view = render(<QueryClientProvider client={client}><DaySummaryCard daySummary={snapshot} /></QueryClientProvider>)
  return { client, key, view }
}

it.each(['bad', 'flexible'] as const)('does not send a second log as undo for a logged %s habit', async (kind) => {
  const { client, view } = mountDay(createMockHabitScheduleItem({ id: 'habit-1', title: 'Habit 1', isBadHabit: kind === 'bad', isFlexible: kind === 'flexible', isLoggedInRange: true }))
  const status = view.container.querySelector('[data-status]')!
  const control = status.closest('button')
  fireEvent.click(control ?? screen.getByRole('button', { name: 'chat.habitList.open:{"name":"Habit 1"}' }))
  await act(async () => { await Promise.resolve() })
  expect(logHabit).not.toHaveBeenCalled()
  expect(control).toBeNull()
  expect(screen.queryByRole('button', { name: /chat.habitList.unlog/ })).not.toBeInTheDocument()
  expect(status).toHaveAttribute('data-status', kind === 'bad' ? 'bad' : 'done')
  view.unmount(); client.clear()
})

it('writes the retained displayed day after account midnight while it is still device today and updates that cache optimistically', async () => {
  vi.stubEnv('TZ', 'UTC')
  vi.setSystemTime(new Date('2026-10-17T18:00:00Z'))
  expect(formatAPIDateInTimeZone(new Date(), 'Asia/Tokyo')).toBe('2026-10-18')
  const date = formatAPIDate(new Date())
  const { client, key, view } = mountDay(createMockHabitScheduleItem({ id: 'habit-1', title: 'Habit 1', dueDate: date }), date)
  fireEvent.click(screen.getByRole('button', { name: 'chat.habitList.log:{"name":"Habit 1"}' }))
  await waitFor(() => expect(logHabit).toHaveBeenCalledWith('habit-1', { date }, 'account-a'))
  await waitFor(() => expect(screen.getByRole('button', { name: 'chat.habitList.unlog:{"name":"Habit 1"}' })).toBeInTheDocument())
  expect(client.getQueryData<HabitScheduleItem[]>(key)?.[0]?.isLoggedInRange).toBe(true)
  view.unmount(); client.clear()
})
