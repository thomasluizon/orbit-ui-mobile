import { act, create } from 'react-test-renderer'
import { Pressable } from 'react-native'
import type { GeometryTree } from '../../support/safe-area-geometry'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { habitKeys } from '@orbit/shared/query'
import { formatAPIDate, formatAPIDateInTimeZone, habitListQueryFilters } from '@orbit/shared/utils'
import { createMockHabitScheduleItem } from '@orbit/shared/__tests__/factories'
import { inPlaceDayFixture } from '@orbit/shared/__tests__/in-place-block-fixtures'
import { DaySummaryCard } from '@/components/chat/day-summary-card'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { API } from '@orbit/shared/api'
import type { HabitScheduleItem } from '@orbit/shared/types/habit'

vi.mock('@/lib/queued-api-mutation', () => ({ performQueuedApiMutation: vi.fn() }))
vi.mock('expo-crypto', () => ({ randomUUID: () => '11111111-1111-4111-8111-111111111111' }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn(), showPersistentError: vi.fn() }) }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('react-i18next', async (importOriginal) => ({ ...await importOriginal<typeof import('react-i18next')>(), useTranslation: () => ({ i18n: { language: 'en' }, t: (key: string, values?: Record<string, unknown>) => values ? `${key}:${JSON.stringify(values)}` : key }) }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(performQueuedApiMutation).mockImplementation(() => new Promise(() => {}))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

async function mountDay(habit: HabitScheduleItem, date = inPlaceDayFixture.date) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  const key = habitKeys.list(habitListQueryFilters({ dateFrom: date, dateTo: date, includeGeneral: true, includeOverdue: true }, true))
  client.setQueryData(key, [habit])
  const snapshot = { ...inPlaceDayFixture, date, due: 1, rows: [{ ...inPlaceDayFixture.rows![0]!, isBadHabit: habit.isBadHabit }] }
  let view!: GeometryTree
  await act(() => { view = create(<QueryClientProvider client={client}><DaySummaryCard daySummary={snapshot} /></QueryClientProvider>) as GeometryTree })
  return { client, key, view }
}

it.each(['bad', 'flexible'] as const)('does not send a second log as undo for a logged %s habit', async (kind) => {
  const { client, view } = await mountDay(createMockHabitScheduleItem({ id: 'habit-1', title: 'Habit 1', isBadHabit: kind === 'bad', isFlexible: kind === 'flexible', isLoggedInRange: true }))
  const controls = view.root.findAll(node => node.type === Pressable && String(node.props.accessibilityLabel).includes('Habit 1') && !String(node.props.accessibilityLabel).includes('.open'))
  const action = controls[0] ?? view.root.findAll(node => node.type === Pressable && String(node.props.accessibilityLabel).includes('.open'))[0]!
  await act(() => { if (!action.props.disabled) (action.props.onPress as () => void)() })
  await act(async () => { await Promise.resolve() })
  expect(performQueuedApiMutation).not.toHaveBeenCalled()
  expect(controls).toHaveLength(0)
  expect(view.root.findAll(node => String(node.props.accessibilityLabel).includes('chat.habitList.unlog'))).toHaveLength(0)
  expect(view.root.findAll(node => node.props.status === (kind === 'bad' ? 'bad' : 'done')).length).toBeGreaterThan(0)
  await act(() => view.unmount()); client.clear()
})

it('writes the retained displayed day after account midnight while it is still device today and updates that cache optimistically', async () => {
  vi.stubEnv('TZ', 'UTC')
  vi.setSystemTime(new Date('2026-10-17T18:00:00Z'))
  expect(formatAPIDateInTimeZone(new Date(), 'Asia/Tokyo')).toBe('2026-10-18')
  const date = formatAPIDate(new Date())
  const { client, key, view } = await mountDay(createMockHabitScheduleItem({ id: 'habit-1', title: 'Habit 1', dueDate: date }), date)
  const control = view.root.findAll(node => node.type === Pressable && node.props.accessibilityLabel === 'chat.habitList.log:{"name":"Habit 1"}')[0]!
  await act(async () => { (control.props.onPress as () => void)(); await new Promise(resolve => setTimeout(resolve, 10)) })
  expect(performQueuedApiMutation).toHaveBeenCalledWith(expect.objectContaining({ endpoint: API.habits.log('habit-1'), method: 'POST', payload: { date } }))
  expect(view.root.findAll(node => node.props.accessibilityLabel === 'chat.habitList.unlog:{"name":"Habit 1"}').length).toBeGreaterThan(0)
  expect(client.getQueryData<HabitScheduleItem[]>(key)?.[0]?.isLoggedInRange).toBe(true)
  await act(() => view.unmount()); client.clear()
})
