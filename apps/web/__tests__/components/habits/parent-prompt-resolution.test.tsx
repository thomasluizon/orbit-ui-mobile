import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockHabitScheduleChild, createMockHabitScheduleItem, createMockProfile } from '@orbit/shared/__tests__/factories'
import { buildOptimisticSkipPatch, findHabitInList, normalizeHabitQueryData, optimisticPatchHabit, optimisticSetDatedCompletion } from '@orbit/shared/utils'
import { useParentPromptQueue } from '@/components/habits/use-parent-prompt-queue'
import { useHabitListVisibility, useHabitRecentCompletionState, useHabitRecentCompletions } from '@/components/habits/use-habit-list-state'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))

const date = '2026-09-12'
let tree: ReactTestRenderer | undefined
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.useFakeTimers(); vi.setSystemTime(new Date(`${date}T12:00:00Z`)) })
afterEach(async () => { await act(() => tree?.unmount()); tree = undefined; vi.useRealTimers(); vi.unstubAllGlobals() })

async function mountQueue(isBadHabit: boolean, view: 'today' | 'all' | 'general', options: { mixed?: boolean; root?: boolean; hiddenBadSibling?: boolean } = {}) {
  const isGeneral = view === 'general'
  let items = [createMockHabitScheduleItem({ id: 'parent', isBadHabit, isGeneral, scheduledDates: [date], hasSubHabits: true,
    children: ['first', 'second'].map(id => createMockHabitScheduleChild({ id, isBadHabit: isBadHabit || (options.mixed === true && id === 'second'), isGeneral, dueDate: date, scheduledDates: [date] })),
  })]
  if (options.hiddenBadSibling) items[0]!.children.push(createMockHabitScheduleChild({ id: 'unscheduled', isBadHabit: true, dueDate: '2026-09-13', scheduledDates: [] }))
  const scheduleSnapshot = () => normalizeHabitQueryData(items.map(item => ({ ...item, children: item.children.filter(child => child.id !== 'unscheduled') })))
  if (options.root) items = [createMockHabitScheduleItem({ id: 'root', scheduledDates: [date], hasSubHabits: true, children: [
    createMockHabitScheduleChild({ ...items[0]!, children: items[0]!.children }),
    createMockHabitScheduleChild({ id: 'good', isCompleted: true, scheduledDates: [date] }),
  ] })]
  let snapshot = scheduleSnapshot()
  let updatedAt = 1
  let queue!: ReturnType<typeof useParentPromptQueue>
  const bulkLog = { mutateAsync: vi.fn(() => Promise.resolve({ results: [{ habitId: 'parent', status: 'Success' }] })) }
  const bulkSkip = { mutateAsync: vi.fn(() => Promise.resolve({ results: [{ habitId: 'parent', status: 'Success' }] })) }
  const log = vi.fn(({ habitId }: { habitId: string }) => {
    items = optimisticSetDatedCompletion(items, habitId, date, true, 'child-log')
    const serverSnapshot = normalizeHabitQueryData(items)
    const badChildren = (serverSnapshot.childrenByParent.get('parent') ?? []).filter(id => serverSnapshot.habitsById.get(id)?.isBadHabit)
    if (isBadHabit && badChildren.length > 0 && badChildren.every(id => serverSnapshot.habitsById.get(id)?.isLoggedInRange)) {
      items = optimisticSetDatedCompletion(items, 'parent', date, true, 'derived-parent-slip')
    }
    return Promise.resolve()
  })
  const skip = vi.fn(({ habitId }: { habitId: string }) => {
    items = optimisticPatchHabit(items, habitId, buildOptimisticSkipPatch(findHabitInList(items, habitId)!, date))
    return Promise.resolve()
  })
  const refetch = vi.fn(() => {
    snapshot = scheduleSnapshot()
    updatedAt += 1
    tree!.update(<QueryClientProvider client={client}><Probe /></QueryClientProvider>)
    return Promise.resolve()
  })
  const client = new QueryClient()
  function Probe() {
    const recent = useHabitRecentCompletionState({ selectedDateStr: date })
    const completions = useHabitRecentCompletions({ selectedDateStr: date, setRecentlyCompletedDates: recent.setRecentlyCompletedDates })
    const habitsQuery = { dataUpdatedAt: updatedAt, refetch }
    const { visibility } = useHabitListVisibility({ ...snapshot, selectedDateStr: date, todayStr: date, habitsQuery } as unknown as Parameters<typeof useHabitListVisibility>[0], { searchQuery: '', showCompleted: false, view }, recent)
    queue = useParentPromptQueue({
      selectedDateStr: date, selectedDate: new Date(`${date}T12:00:00Z`), profile: createMockProfile({ timeZone: 'UTC' }),
      habitsById: snapshot.habitsById, getChildren: (id: string) => (snapshot.childrenByParent.get(id) ?? []).map(childId => snapshot.habitsById.get(childId)!),
      visibility, view, habitsQuery, bulkLog, bulkSkip, ...completions, showError: vi.fn(), t: (key: string) => key,
      skipHabit: { mutateAsync: skip }, logHabit: { mutateAsync: log },
    } as unknown as Parameters<typeof useParentPromptQueue>[0])
    return null
  }
  await act(() => { tree = create(<QueryClientProvider client={client}><Probe /></QueryClientProvider>) })
  return {
    current: () => queue, bulkLog, bulkSkip, log,
    callbackLog: async (id: string) => {
      await act(async () => { await log({ habitId: id }); await refetch() })
      await act(() => { queue.checkAndPromptParentLog(id) })
    },
    bulkLogChildren: async () => {
      await act(async () => {
        await log({ habitId: 'first' }); await log({ habitId: 'second' })
        queue.settleBulkHabitResolutions(['first', 'second'].map(habitId => ({ habitId, mode: 'log' })), date)
      })
    },
    settleParentOnServer: () => { items = optimisticSetDatedCompletion(items, 'parent', date, true, 'server-parent-log') },
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
      if (isBadHabit && first === 'log' && second === 'log') {
        expect(queue.current().parentPrompt).toBeNull()
        expect(queue.bulkLog.mutateAsync).not.toHaveBeenCalled()
        return
      }
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


describe.each(['today', 'all', 'general'] as const)('mixed parent rules in %s', view => {
  it('prompts a good parent after its good child logs while a bad child stays unslipped', async () => {
    const queue = await mountQueue(false, view, { mixed: true })
    await queue.resolve('first', 'log')
    expect(queue.current().parentPrompt).toMatchObject({ habit: { id: 'parent' }, mode: 'log' })
    await act(() => queue.current().confirmParentSettlement())
    expect(queue.bulkLog.mutateAsync).toHaveBeenCalledWith([{ habitId: 'parent', date }])
  })
})

it('offers only the actionable root and confirms it after the API derives the bad parent slip', async () => {
  const queue = await mountQueue(true, 'today', { root: true })
  await queue.resolve('first', 'log')
  await queue.refetch()
  await queue.resolve('second', 'log')
  expect(queue.current().parentPrompt?.ancestors.map(({ habit }) => habit.id)).toEqual(['root'])
  await queue.refetch()
  await act(() => queue.current().confirmParentSettlement())
  expect(queue.bulkLog.mutateAsync).toHaveBeenCalledExactlyOnceWith([{ habitId: 'root', date }])
  expect(queue.bulkSkip.mutateAsync).not.toHaveBeenCalled()
})


it('keeps a selected higher ancestor when the nearer parent settles during refetch', async () => {
  const queue = await mountQueue(false, 'today', { root: true })
  await queue.resolve('first', 'log')
  await queue.resolve('second', 'log')
  expect(queue.current().parentPrompt?.ancestors.map(({ habit }) => habit.id)).toEqual(['parent', 'root'])
  await act(() => queue.current().selectParentAncestor(1, true))
  queue.settleParentOnServer()
  await queue.refetch()
  await act(() => queue.current().confirmParentSettlement())
  expect(queue.bulkLog.mutateAsync).toHaveBeenCalledExactlyOnceWith([{ habitId: 'root', date }])
})


it('prompts after refetch when an unscheduled bad sibling prevents API slip derivation', async () => {
  const queue = await mountQueue(true, 'today', { hiddenBadSibling: true })
  await queue.resolve('first', 'log')
  await queue.resolve('second', 'log')
  expect(queue.current().parentPrompt).toMatchObject({ habit: { id: 'parent' }, mode: 'log' })
  await act(() => queue.current().confirmParentSettlement())
  expect(queue.bulkLog.mutateAsync).toHaveBeenCalledExactlyOnceWith([{ habitId: 'parent', date }])
})


it('rechecks callback logs after the API derives the parent slip', async () => {
  const queue = await mountQueue(true, 'today', { root: true })
  await queue.callbackLog('first')
  await queue.callbackLog('second')
  expect(queue.current().parentPrompt?.ancestors.map(({ habit }) => habit.id)).toEqual(['root'])
  await act(() => queue.current().confirmParentSettlement())
  expect(queue.bulkLog.mutateAsync).toHaveBeenCalledExactlyOnceWith([{ habitId: 'root', date }])
})

it('settles only the actionable root after bulk child slips refetch their derived parent', async () => {
  const queue = await mountQueue(true, 'today', { root: true })
  await queue.bulkLogChildren()
  expect(queue.log.mock.calls.map(([input]) => input.habitId)).toEqual(['first', 'second', 'root'])
  expect(queue.current().parentPrompt).toBeNull()
})
