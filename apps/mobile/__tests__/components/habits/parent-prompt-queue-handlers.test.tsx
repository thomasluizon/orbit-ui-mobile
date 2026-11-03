import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createMockHabit, createMockProfile } from '@orbit/shared/__tests__/factories'
import { useParentPromptQueue } from '@/components/habits/use-parent-prompt-queue'
import { i18n } from '@/lib/i18n'
import { subscribeBulkReplaySuccesses } from '@/lib/bulk-replay-events'

const replay = vi.hoisted(() => ({ unsubscribe: vi.fn() }))
vi.mock('@/lib/bulk-replay-events', () => ({ subscribeBulkReplaySuccesses: vi.fn(() => replay.unsubscribe) }))

let tree: ReactTestRenderer | undefined
beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true))
afterEach(async () => { await act(() => tree?.unmount()); tree = undefined; vi.useRealTimers(); vi.unstubAllGlobals() })

function queueInputs() {
  const habit = createMockHabit({ id: 'habit', scheduledDates: ['2026-09-12'] })
  const mutation = { mutateAsync: vi.fn() }
  return {
    habit,
    inputs: {
      selectedDateStr: '2026-09-12', selectedDate: new Date(2026, 8, 12),
      profile: createMockProfile({ timeZone: 'UTC' }), accountTimeZone: 'UTC', settlementDateIsReadOnly: () => false,
      habitsById: new Map([[habit.id, habit]]), getChildren: () => [],
      visibility: { isRelevantToday: () => true, isDueOnSelectedDate: () => true },
      view: 'today', habitsQuery: { dataUpdatedAt: 1, refetch: vi.fn(() => Promise.resolve(undefined)) },
      markRecentlyCompleted: vi.fn(), clearRecentlyCompleted: vi.fn(),
      showError: vi.fn(), t: i18n.t,
      bulkLog: mutation, bulkSkip: mutation,
      skipMutation: { ...mutation, mutateAsync: () => Promise.resolve({ skipId: 'skip', outcome: undefined }) }, logMutateAsync: mutation.mutateAsync, refetch: vi.fn(() => Promise.resolve(undefined)),
    } as unknown as Parameters<typeof useParentPromptQueue>[0],
  }
}

it('retains every handler across rerenders and dispatches through the latest mutation', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-12T12:00:00Z'))
  const { habit, inputs } = queueInputs()
  let queue!: ReturnType<typeof useParentPromptQueue>
  function Probe() { queue = useParentPromptQueue(inputs); return null }
  await act(() => { tree = create(<Probe />) })
  const first = queue
  const latestSkip = vi.fn(() => Promise.resolve({ skipId: 'skip', outcome: undefined }))
  inputs.skipMutation = { ...inputs.skipMutation, mutateAsync: latestSkip }
  for (let index = 0; index < 3; index += 1) await act(() => tree!.update(<Probe />))
  const handlers = ['cancelParentPrompt', 'checkAndPromptParentLog', 'settleBulkHabitResolutions',
    'skipFromRow', 'confirmParentSettlement', 'selectParentAncestor', 'handleDirectToggle'] as const
  for (const handler of handlers) expect(queue[handler], handler).toBe(first[handler])
  await act(async () => { await first.skipFromRow(habit) })
  expect(latestSkip).toHaveBeenCalledWith({ habitId: habit.id, date: inputs.selectedDateStr, onUndo: expect.any(Function) })
})

it('subscribes to bulk replay once across rerenders with unchanged inputs', async () => {
  vi.mocked(subscribeBulkReplaySuccesses).mockClear()
  replay.unsubscribe.mockClear()
  const { inputs } = queueInputs()
  function Probe() { useParentPromptQueue(inputs); return null }
  await act(() => { tree = create(<Probe />) })
  for (let index = 0; index < 3; index += 1) await act(() => tree!.update(<Probe />))
  expect(subscribeBulkReplaySuccesses).toHaveBeenCalledTimes(1)
  expect(replay.unsubscribe).not.toHaveBeenCalled()
  inputs.selectedDateStr = '2026-09-13'
  await act(() => tree!.update(<Probe />))
  expect(subscribeBulkReplaySuccesses).toHaveBeenCalledTimes(2)
  expect(replay.unsubscribe).toHaveBeenCalledTimes(1)
  await act(() => tree!.unmount())
  tree = undefined
  expect(replay.unsubscribe).toHaveBeenCalledTimes(2)
})
