import { act, create } from 'react-test-renderer'
import { Pressable, StyleSheet } from 'react-native'
import type { GeometryTree } from '../../support/safe-area-geometry'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { habitKeys } from '@orbit/shared/query'
import { formatAPIDate, formatAPIDateInTimeZone, habitListQueryFilters } from '@orbit/shared/utils'
import { createMockHabitScheduleChild, createMockHabitScheduleItem } from '@orbit/shared/__tests__/factories'
import { inPlaceDayFixture, nestedDaySummaryFixture } from '@orbit/shared/__tests__/in-place-block-fixtures'
import type { DaySummaryCard as DaySummaryCardData } from '@orbit/shared/types/chat'
import { DaySummaryCard } from '@/components/chat/day-summary-card'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { apiClient } from '@/lib/api-client'
import { API } from '@orbit/shared/api'
import type { HabitScheduleItem } from '@orbit/shared/types/habit'
import { renderedText } from '../../support/react-test-renderer'

vi.mock('@/lib/queued-api-mutation', () => ({ performQueuedApiMutation: vi.fn() }))
vi.mock('@/lib/api-client', () => ({ apiClient: vi.fn() }))
vi.mock('expo-crypto', () => ({ randomUUID: () => '11111111-1111-4111-8111-111111111111' }))
vi.mock('@/hooks/use-app-toast', () => ({ useAppToast: () => ({ showError: vi.fn(), showPersistentError: vi.fn() }) }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('react-i18next', async (importOriginal) => ({ ...await importOriginal<typeof import('react-i18next')>(), useTranslation: () => ({ i18n: { language: 'en' }, t: (key: string, values?: Record<string, unknown>) => values ? `${key}:${JSON.stringify(values)}` : key }) }))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(performQueuedApiMutation).mockImplementation(() => new Promise(() => {}))
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

async function mountDay(habit: HabitScheduleItem, date = inPlaceDayFixture.date, summary?: DaySummaryCardData) {
  vi.mocked(apiClient).mockResolvedValue({ items: [habit], page: 1, pageSize: 1, totalCount: 1, totalPages: 1 })
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  const key = habitKeys.list(habitListQueryFilters({ dateFrom: date, dateTo: date, includeGeneral: true, includeOverdue: true }, true))
  client.setQueryData(key, [habit])
  const snapshot = summary ?? { ...inPlaceDayFixture, date, due: 1, rows: [{ ...inPlaceDayFixture.rows![0]!, isBadHabit: habit.isBadHabit }] }
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
  const check = view.root.findAll(node => String(node.type) === 'AnimatedView' && node.props.accessibilityRole === 'image' && node.props.accessibilityLabel === 'chat.habitList.pending')[0]!
  expect(StyleSheet.flatten(check.props.style)).toMatchObject({ width: 28, height: 28, borderRadius: 12, borderWidth: 1 })
  const control = view.root.findAll(node => node.type === Pressable && node.props.accessibilityLabel === 'chat.habitList.log:{"name":"Habit 1"}')[0]!
  await act(async () => { (control.props.onPress as () => void)(); await new Promise(resolve => setTimeout(resolve, 10)) })
  expect(performQueuedApiMutation).toHaveBeenCalledWith(expect.objectContaining({ endpoint: API.habits.log('habit-1'), method: 'POST', payload: { date } }))
  expect(view.root.findAll(node => node.props.accessibilityLabel === 'chat.habitList.unlog:{"name":"Habit 1"}').length).toBeGreaterThan(0)
  expect(client.getQueryData<HabitScheduleItem[]>(key)?.[0]?.isLoggedInRange).toBe(true)
  await act(() => view.unmount()); client.clear()
})

it.each([false, true])('reconciles a nested log from logged=%s before the request settles and rolls it back on failure', async (logged) => {
  const snapshot: DaySummaryCardData = {
    ...nestedDaySummaryFixture, done: Number(logged), completionRate: Number(logged) * 50,
    rows: nestedDaySummaryFixture.rows!.map(row => row.depth > 0 ? { ...row, status: logged ? 'done' : 'today' } : row),
  }
  const habit = createMockHabitScheduleItem({
    id: 'habit-1', title: 'Habit 1', dueDate: snapshot.date, hasSubHabits: true,
    scheduledDates: [snapshot.date], instances: [{ date: snapshot.date, status: 'Pending', logId: null }],
    children: [createMockHabitScheduleChild({
      id: 'child-1', title: 'Stretch', dueDate: snapshot.date, isLoggedInRange: logged, scheduledDates: [snapshot.date],
      instances: [{ date: snapshot.date, status: logged ? 'Completed' : 'Pending', logId: logged ? '11111111-1111-4111-8111-111111111111' : null }],
    })],
  })
  let rejectRequest!: (error: Error) => void
  vi.mocked(performQueuedApiMutation).mockImplementationOnce(() => new Promise((_, reject) => { rejectRequest = reject }))
  const { client, key, view } = await mountDay(habit, snapshot.date, snapshot)
  vi.mocked(apiClient).mockImplementation(() => new Promise(() => {}))
  const initialAction = `chat.habitList.${logged ? 'unlog' : 'log'}:{"name":"Stretch"}`
  const optimisticAction = `chat.habitList.${logged ? 'log' : 'unlog'}:{"name":"Stretch"}`
  const control = view.root.findAll(node => node.type === Pressable && node.props.accessibilityLabel === initialAction)[0]!
  expect(view.root.findAll(node => node.props.accessibilityRole === 'progressbar')[0]?.props.accessibilityValue).toMatchObject({ now: Number(logged) * 50 })
  await act(async () => { (control.props.onPress as () => void)(); await new Promise(resolve => setTimeout(resolve, 10)) })
  expect(performQueuedApiMutation).toHaveBeenCalledWith(expect.objectContaining({ endpoint: API.habits.log('child-1'), method: 'POST', payload: { date: snapshot.date } }))
  expect(view.root.findAll(node => node.type === Pressable && node.props.accessibilityLabel === optimisticAction)).toHaveLength(1)
  expect(client.getQueryData<HabitScheduleItem[]>(key)?.[0]?.children[0]?.isLoggedInRange).toBe(!logged)
  expect(renderedText(view.toJSON())).toContain(`chat.daySummary.doneOfDue:{"done":${Number(!logged)},"due":2}`)
  expect(view.root.findAll(node => node.props.accessibilityRole === 'progressbar')[0]?.props.accessibilityValue).toMatchObject({ now: Number(!logged) * 50 })
  expect(view.root.findAll(node => node.type === Pressable && node.props.accessibilityLabel === 'chat.habitList.log:{"name":"Habit 1"}')[0]?.props.disabled).toBe(false)
  await act(async () => { rejectRequest(new Error('offline')); await new Promise(resolve => setTimeout(resolve, 10)) })
  expect(client.isFetching({ queryKey: key })).toBe(1)
  expect(client.getQueryData<HabitScheduleItem[]>(key)?.[0]?.children[0]?.isLoggedInRange).toBe(logged)
  expect(view.root.findAll(node => node.type === Pressable && node.props.accessibilityLabel === initialAction)[0]?.props.disabled).toBe(false)
  expect(renderedText(view.toJSON())).toContain(`chat.daySummary.doneOfDue:{"done":${Number(logged)},"due":2}`)
  expect(view.root.findAll(node => node.props.accessibilityRole === 'progressbar')[0]?.props.accessibilityValue).toMatchObject({ now: Number(logged) * 50 })
  await act(() => view.unmount()); client.clear()
})
