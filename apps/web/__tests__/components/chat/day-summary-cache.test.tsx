import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import { habitKeys } from '@orbit/shared/query'
import { habitListQueryFilters } from '@orbit/shared/utils'
import { createMockHabitScheduleItem } from '@orbit/shared/__tests__/factories'
import { inPlaceDayFixture } from '@orbit/shared/__tests__/in-place-block-fixtures'
import { DaySummaryCard } from '@/components/chat/day-summary-card'

vi.mock('@/hooks/use-habits', async () => {
  const queries = await import('@/hooks/use-habit-queries')
  return { useHabits: queries.useHabits, useLogHabit: () => ({ mutate: vi.fn() }) }
})
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string, values?: { name?: string }) => values?.name ? `${key}:${values.name}` : key }))

it('subscribes to a log on Hoje through the real habit query cache', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  const filters = { dateFrom: inPlaceDayFixture.date, dateTo: inPlaceDayFixture.date, includeGeneral: true, includeOverdue: true }
  const key = habitKeys.list(habitListQueryFilters(filters, true))
  const occurrences = (inPlaceDayFixture.rows ?? []).map(item => createMockHabitScheduleItem({ id: item.id, title: item.title, dueDate: inPlaceDayFixture.date }))
  client.setQueryData(key, occurrences)
  const view = render(<QueryClientProvider client={client}><DaySummaryCard daySummary={inPlaceDayFixture} /></QueryClientProvider>)
  expect(screen.getByRole('button', { name: 'chat.habitList.log:Habit 1' })).toBeInTheDocument()
  act(() => { client.setQueryData(key, occurrences.map(item => item.id === 'habit-1' ? { ...item, isLoggedInRange: true } : item)) })
  await waitFor(() => expect(screen.getByRole('button', { name: 'chat.habitList.unlog:Habit 1' })).toBeInTheDocument())
  view.unmount()
  client.clear()
})
