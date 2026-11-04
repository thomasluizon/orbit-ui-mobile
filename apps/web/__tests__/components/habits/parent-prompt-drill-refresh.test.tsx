import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMockHabitScheduleChild, createMockHabitScheduleItem, createMockProfile } from '@orbit/shared/__tests__/factories'
import { makeEnrichedHabitDetail, makeHabitDetailChild } from '@orbit/shared/test-support/habit-detail-fixtures'
import type { HabitDetail } from '@orbit/shared/types/habit'
import { normalizeHabitQueryData } from '@orbit/shared/utils'
import { useParentPromptQueue } from '@/components/habits/use-parent-prompt-queue'
import { useHabitListVisibility, useHabitRecentCompletionState, useHabitRecentCompletions } from '@/components/habits/use-habit-list-state'
import { fetchJson } from '@/lib/api-fetch'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('@/lib/api-fetch', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/api-fetch')>(), fetchJson: vi.fn(),
}))

const date = '2026-09-12'
let tree: ReactTestRenderer | undefined
let client: QueryClient | undefined
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.useFakeTimers(); vi.setSystemTime(new Date(`${date}T12:00:00Z`)) })
afterEach(async () => { await act(() => tree?.unmount()); tree = undefined; client?.clear(); onlineManager.setOnline(true); vi.useRealTimers(); vi.unstubAllGlobals() })

async function mountDrillQueue(partialList = false) {
  const initial: HabitDetail = {
    ...makeEnrichedHabitDetail(), id: 'parent', frequencyUnit: null, isGeneral: true, isBadHabit: true,
    children: ['first', 'second'].map(id => ({
      ...makeHabitDetailChild(), id, frequencyUnit: null, isGeneral: true, isBadHabit: true, isCompleted: id === 'first',
    })),
  }
  let releaseDetail!: (detail: HabitDetail) => void
  let rejectDetail!: (error: Error) => void
  const detailResponse = new Promise<HabitDetail>((resolve, reject) => { releaseDetail = resolve; rejectDetail = reject })
  vi.mocked(fetchJson).mockReset().mockResolvedValueOnce(initial).mockImplementation(() => detailResponse)
  const snapshot = normalizeHabitQueryData(partialList ? [createMockHabitScheduleItem({
    id: initial.id, frequencyUnit: null, isGeneral: true, isBadHabit: true, hasSubHabits: true,
    children: [createMockHabitScheduleChild({ id: 'second', frequencyUnit: null, isGeneral: true, isBadHabit: true })],
  })] : [])
  let updatedAt = 1
  let queue!: ReturnType<typeof useParentPromptQueue>
  let drill!: ReturnType<typeof useHabitListVisibility>['drill']
  const log = vi.fn().mockResolvedValue(undefined)
  const bulkLog = { mutateAsync: vi.fn().mockResolvedValue({ results: [] }) }
  const refetch = vi.fn(() => {
    updatedAt += 1
    tree!.update(<QueryClientProvider client={client!}><Probe /></QueryClientProvider>)
    return Promise.resolve()
  })
  function Probe() {
    const recent = useHabitRecentCompletionState({ selectedDateStr: date })
    const completions = useHabitRecentCompletions({ selectedDateStr: date, setRecentlyCompletedDates: recent.setRecentlyCompletedDates })
    const habitsQuery = { dataUpdatedAt: updatedAt, refetch }
    const list = useHabitListVisibility({ ...snapshot, selectedDateStr: date, todayStr: date, habitsQuery } as unknown as Parameters<typeof useHabitListVisibility>[0], { searchQuery: '', showCompleted: false, view: 'general' }, recent)
    drill = list.drill
    queue = useParentPromptQueue({
      selectedDateStr: date, selectedDate: new Date(`${date}T12:00:00Z`), profile: createMockProfile({ timeZone: 'UTC' }),
      habitsById: snapshot.habitsById, additionalHabitsById: drill.settlementHabitsById, additionalHabitsUpdatedAtById: drill.settlementUpdatedAtById,
      getChildren: () => [], visibility: list.visibility, view: 'general', habitsQuery,
      ...completions, bulkLog, bulkSkip: { mutateAsync: vi.fn() }, showError: vi.fn(), t: (key: string) => key,
      logHabit: { mutateAsync: log }, skipHabit: { mutateAsync: vi.fn() },
    } as unknown as Parameters<typeof useParentPromptQueue>[0])
    return null
  }
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  await act(() => { tree = create(<QueryClientProvider client={client!}><Probe /></QueryClientProvider>) })
  await act(() => drill.drillInto('parent'))
  return {
    current: () => queue, drill: () => drill, log, refetch,
    failDetail: async () => {
      await act(async () => { rejectDetail(new TypeError('Network request failed')); await detailResponse.catch(() => {}) })
    },
    resolve: async (path: 'direct' | 'callback' | 'bulk') => {
      await act(async () => {
        if (path === 'direct') await queue.handleDirectToggle(drill.settlementHabitsById.get('second')!, 'log')
        else if (path === 'callback') queue.checkAndPromptParentLog('second')
        else queue.settleBulkHabitResolutions([{ habitId: 'second', mode: 'log' }], date)
      })
    },
    finishDetail: async (parentCompleted: boolean) => {
      await act(async () => {
        releaseDetail({ ...initial, isCompleted: parentCompleted, children: initial.children.map(child => ({ ...child, isCompleted: true })) })
        await detailResponse
      })
    },
    replaceDetail: async (parentCompleted: boolean) => {
      vi.mocked(fetchJson).mockResolvedValue({ ...initial, isCompleted: parentCompleted, children: initial.children.map(child => ({ ...child, isCompleted: true })) })
      await act(refetch)
    },
  }
}

it.each(['direct', 'callback', 'bulk'] as const)('waits for drill-only settlement inventory after a %s slip', async path => {
  const queue = await mountDrillQueue()
  await queue.resolve(path)
  expect(vi.mocked(fetchJson)).toHaveBeenCalledTimes(2)
  expect(queue.drill().settlementHabitsById.get('parent')?.isCompleted).toBe(false)
  expect(queue.current().parentPrompt).toBeNull()
  expect(queue.log.mock.calls.map(([input]) => input.habitId)).toEqual(path === 'direct' ? ['second'] : [])
  await queue.finishDetail(true)
  expect(queue.drill().settlementHabitsById.get('parent')?.isCompleted).toBe(true)
  expect(queue.current().parentPrompt).toBeNull()
  expect(queue.log.mock.calls.map(([input]) => input.habitId)).toEqual(path === 'direct' ? ['second'] : [])
})

it.each(([false, true] as const).flatMap(offline => (['direct', 'callback', 'bulk'] as const).map(path => ({ path, offline }))))('continues $path settlement after a drill refresh rejects, offline: $offline', async ({ path, offline }) => {
  const queue = await mountDrillQueue(true)
  await queue.resolve(path)
  expect(queue.current().parentPrompt).toBeNull()
  expect(queue.log.mock.calls.map(([input]) => input.habitId)).toEqual(path === 'direct' ? ['second'] : [])
  if (offline) onlineManager.setOnline(false)
  await queue.failDetail()
  if (path === 'bulk') {
    expect(queue.current().parentPrompt).toBeNull()
    expect(queue.log).toHaveBeenCalledWith({ habitId: 'parent', date, intent: 'log' })
  } else expect(queue.current().parentPrompt).toMatchObject({ habit: { id: 'parent' }, mode: 'log' })
})

it.each(['direct', 'callback', 'bulk'] as const)('continues %s settlement offline without waiting for drill details', async path => {
  const queue = await mountDrillQueue(true)
  onlineManager.setOnline(false)
  await queue.resolve(path)
  expect(queue.refetch).not.toHaveBeenCalled()
  expect(fetchJson).toHaveBeenCalledOnce()
  if (path === 'bulk') {
    expect(queue.current().parentPrompt).toBeNull()
    expect(queue.log).toHaveBeenCalledWith({ habitId: 'parent', date, intent: 'log' })
  } else expect(queue.current().parentPrompt).toMatchObject({ habit: { id: 'parent' }, mode: 'log' })
})

it.each(['direct', 'callback', 'bulk'] as const)('continues %s settlement when fresh drill details leave the parent open', async path => {
  const queue = await mountDrillQueue()
  await queue.resolve(path)
  expect(queue.current().parentPrompt).toBeNull()
  expect(queue.log.mock.calls.map(([input]) => input.habitId)).toEqual(path === 'direct' ? ['second'] : [])
  await queue.finishDetail(false)
  if (path === 'bulk') {
    expect(queue.current().parentPrompt).toBeNull()
    expect(queue.log).toHaveBeenCalledWith({ habitId: 'parent', date, intent: 'log' })
  } else expect(queue.current().parentPrompt).toMatchObject({ habit: { id: 'parent' }, mode: 'log' })
})

it('removes an obsolete queued action when refreshed drill details prove the parent settled', async () => {
  const queue = await mountDrillQueue()
  await queue.resolve('direct')
  await queue.finishDetail(false)
  expect(queue.current().parentPrompt).toMatchObject({ habit: { id: 'parent' } })
  await queue.replaceDetail(true)
  expect(queue.drill().settlementHabitsById.get('parent')?.isCompleted).toBe(true)
  expect(queue.current().parentPrompt).toBeNull()
})
