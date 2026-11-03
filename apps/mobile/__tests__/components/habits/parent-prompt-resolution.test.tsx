import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockHabitScheduleChild, createMockHabitScheduleItem, createMockProfile } from '@orbit/shared/__tests__/factories'
import { buildOptimisticSkipPatch, findHabitInList, normalizeHabitQueryData, optimisticPatchHabit, optimisticSetDatedCompletion } from '@orbit/shared/utils'
import { useParentPromptQueue } from '@/components/habits/use-parent-prompt-queue'
import { useHabitListVisibility, useHabitRecentCompletionState, useHabitRecentCompletions } from '@/components/habits/use-habit-list-state'

vi.mock('expo-crypto', () => ({ randomUUID: () => 'test-mutation' }))

vi.mock('@/lib/orbit-widget', () => ({ syncWidget: vi.fn() }))
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const date = '2026-09-12'
let tree: ReactTestRenderer | undefined
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.useFakeTimers(); vi.setSystemTime(new Date(`${date}T12:00:00Z`)) })
afterEach(async () => { await act(() => tree?.unmount()); tree = undefined; vi.useRealTimers(); vi.unstubAllGlobals() })

async function mountQueue(isBadHabit: boolean, view: 'today' | 'all' | 'general') {
  const isGeneral = view === 'general'
  let items = [createMockHabitScheduleItem({ id: 'parent', isBadHabit, isGeneral, scheduledDates: [date], hasSubHabits: true,
    children: ['first', 'second'].map(id => createMockHabitScheduleChild({ id, isBadHabit, isGeneral, dueDate: date, scheduledDates: [date] })),
  })]
  let snapshot = normalizeHabitQueryData(items)
  let updatedAt = 1
  let queue!: ReturnType<typeof useParentPromptQueue>
  const bulkLog = { mutateAsync: vi.fn(() => Promise.resolve({ results: [{ habitId: 'parent', status: 'Success' }] })) }
  const bulkSkip = { mutateAsync: vi.fn(() => Promise.resolve({ results: [{ habitId: 'parent', status: 'Success' }] })) }
  const log = vi.fn(({ habitId }: { habitId: string }) => { items = optimisticSetDatedCompletion(items, habitId, date, true, 'child-log'); return Promise.resolve() })
  const skip = vi.fn(({ habitId }: { habitId: string }) => {
    items = optimisticPatchHabit(items, habitId, buildOptimisticSkipPatch(findHabitInList(items, habitId)!, date))
    return Promise.resolve()
  })
  const refetch = vi.fn(() => {
    snapshot = normalizeHabitQueryData(items)
    updatedAt += 1
    tree!.update(<QueryClientProvider client={client}><Probe /></QueryClientProvider>)
    return Promise.resolve()
  })
  const client = new QueryClient()
  function Probe() {
    const recent = useHabitRecentCompletionState({ selectedDateStr: date })
    const completions = useHabitRecentCompletions({ selectedDateStr: date, setRecentlyCompletedDates: recent.setRecentlyCompletedDates })
    const habitsQuery = { dataUpdatedAt: updatedAt, refetch }
    const { visibility } = useHabitListVisibility({ movingHabitId: null }, snapshot, { selectedDateStr: date }, { searchQuery: '', showCompleted: false }, recent)
    queue = useParentPromptQueue({
      selectedDateStr: date, selectedDate: new Date(`${date}T12:00:00Z`), profile: createMockProfile({ timeZone: 'UTC' }),
      habitsById: snapshot.habitsById, getChildren: (id: string) => (snapshot.childrenByParent.get(id) ?? []).map(childId => snapshot.habitsById.get(childId)!),
      visibility, view, habitsQuery, bulkLog, bulkSkip, ...completions, showError: vi.fn(), t: (key: string) => key,
      skipMutation: { mutateAsync: skip }, logMutateAsync: log, refetch, accountTimeZone: 'UTC', settlementDateIsReadOnly: () => false,
    } as unknown as Parameters<typeof useParentPromptQueue>[0])
    return null
  }
  await act(() => { tree = create(<QueryClientProvider client={client}><Probe /></QueryClientProvider>) })
  return {
    current: () => queue, bulkLog, bulkSkip,
    refetch: async () => { await act(refetch) },
    resolve: async (id: string, mode: 'log' | 'skip') => {
      const habit = snapshot.habitsById.get(id)!
      await act(async () => { if (mode === 'skip') await queue.skipFromRow(habit); else await queue.handleDirectToggle(habit, 'log') })
    },
  }
}

describe.each([false, true])('parent resolution through list state, bad=%s', isBadHabit => {
  describe.each(['today', 'all', 'general'] as const)('%s', view => {
    describe.each([false, true])('refetch between actions=%s', refetchBetween => {
    it.each([['log', 'skip'], ['skip', 'log'], ['skip', 'skip'], ['log', 'log']] as const)('offers once after %s then %s across a refetch', async (first, second) => {
      const queue = await mountQueue(isBadHabit, view)
      await queue.resolve('first', first)
      expect(queue.current().parentPrompt).toBeNull()
      if (refetchBetween) await queue.refetch()
      await queue.resolve('second', second)
      const mode = first === 'skip' && second === 'skip' ? 'skip' : 'log'
      expect(queue.current().parentPrompt).toMatchObject({ habit: { id: 'parent' }, mode, date })
      await queue.refetch()
      await act(() => queue.current().cancelParentPrompt())
      await queue.refetch()
      await act(() => queue.current().checkAndPromptParentLog('second'))
      expect(queue.current().parentPrompt).toBeNull()
    })
    })
  })
})
