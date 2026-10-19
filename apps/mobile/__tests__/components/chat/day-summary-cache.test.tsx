import { act, create } from 'react-test-renderer'
import type { GeometryTree } from '../../support/safe-area-geometry'
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
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('react-i18next', async (importOriginal) => ({ ...await importOriginal<typeof import('react-i18next')>(), useTranslation: () => ({ i18n: { language: 'en' }, t: (key: string, values?: { name?: string }) => values?.name ? `${key}:${values.name}` : key }) }))

it('subscribes to a log on Hoje through the real habit query cache', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  const filters = { dateFrom: inPlaceDayFixture.date, dateTo: inPlaceDayFixture.date, includeGeneral: true, includeOverdue: true }
  const key = habitKeys.list(habitListQueryFilters(filters, true))
  const occurrences = (inPlaceDayFixture.rows ?? []).map(item => createMockHabitScheduleItem({ id: item.id, title: item.title, dueDate: inPlaceDayFixture.date }))
  client.setQueryData(key, occurrences)
  let tree!: GeometryTree
  await act(() => { tree = create(<QueryClientProvider client={client}><DaySummaryCard daySummary={inPlaceDayFixture} /></QueryClientProvider>) as GeometryTree })
  expect(tree.root.findAll(node => node.props.accessibilityLabel === 'chat.habitList.log:Habit 1').length).toBeGreaterThan(0)
  await act(async () => {
    client.setQueryData(key, occurrences.map(item => item.id === 'habit-1' ? { ...item, isLoggedInRange: true } : item))
    await new Promise(resolve => setTimeout(resolve, 10))
  })
  expect(tree.root.findAll(node => node.props.accessibilityLabel === 'chat.habitList.unlog:Habit 1').length).toBeGreaterThan(0)
  await act(() => tree.unmount())
  client.clear()
})

vi.mock('@/lib/api-client', () => ({ apiClient: vi.fn() }))
