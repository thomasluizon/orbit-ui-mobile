import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest'
import { createMockHabit,createMockProfile } from './factories'
import { computeParentPromptChain,type ParentPromptChain } from '../utils'
import { createParentPromptQueue,transitionParentPromptQueue,createConfirmedResolutionRecord,refreshConfirmedResolutions,createUseParentPromptQueue,type ParentPromptInputs } from '../hooks/parent-prompt-queue-core'
import { createHookStateHarness } from '../test-support/hook-state'

function parentPromptHarness() {
  const state = createHookStateHarness()
  const effects: (() => void)[] = []
  const useRef = <Value,>(initial: Value) => state.useState(() => ({ current: initial }))[0]
  const useEffect = (effect: () => void | (() => void), dependencies: readonly unknown[]) => {
    const record = useRef<{ dependencies?: readonly unknown[]; cleanup?: () => void }>({})
    if (record.current.dependencies && dependencies.every((value, index) => Object.is(value, record.current.dependencies?.[index]))) return
    effects.push(() => {
      record.current.cleanup?.()
      record.current = { dependencies: [...dependencies], cleanup: effect() ?? undefined }
    })
  }
  let reset = () => {}
  const useQueue = createUseParentPromptQueue({ useState: state.useState, useRef, useEffect, useLayoutEffect: useEffect,
    useResetOnAccountChange: callback => { reset = callback } })
  const parent = createMockHabit({ id: 'parent', scheduledDates: ['2026-09-12'] })
  const child = createMockHabit({ id: 'child', parentId: parent.id, scheduledDates: ['2026-09-12'] })
  const habits = [parent, child]
  const logHabit = vi.fn<ParentPromptInputs['logHabit']>().mockResolvedValue(undefined)
  const skipHabit = vi.fn<ParentPromptInputs['skipHabit']>().mockResolvedValue(undefined)
  const bulkLog = vi.fn<ParentPromptInputs['bulkLog']>(async items => ({ results: items.map(({ habitId }) => ({ habitId, status: 'Success' })) }))
  const inputs: ParentPromptInputs = { selectedDateStr: '2026-09-12', selectedDate: new Date(2026, 8, 12),
    profile: createMockProfile({ timeZone: 'UTC' }), habitsById: new Map(habits.map(habit => [habit.id, habit])),
    getChildren: id => habits.filter(habit => habit.parentId === id), view: 'today', updatedAt: 1,
    visibility: { isRelevantToday: () => true, isDueOnSelectedDate: () => true }, logHabit, skipHabit,
    bulkLog, bulkSkip: bulkLog, markRecentlyCompleted: vi.fn(), clearRecentlyCompleted: vi.fn(),
    showError: vi.fn(), t: key => key, refetch: vi.fn(async () => {}), toggleKey: (id, date) => `${id}:${date}` }
  const render = () => {
    const queue = state.render(() => useQueue(inputs))
    for (const effect of effects.splice(0)) effect()
    return queue
  }
  render()
  return { render, inputs, parent, child, logHabit, skipHabit, bulkLog, resetAccount: () => reset() }
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-12T12:00:00Z')) })
afterEach(() => vi.useRealTimers())

function promptFixture(date = '2026-09-12'): ParentPromptChain {
  const root = createMockHabit({ id: 'root', scheduledDates: [date] })
  const parent = createMockHabit({ id: 'parent', parentId: root.id, scheduledDates: [date] })
  const child = createMockHabit({ id: 'child', parentId: parent.id, scheduledDates: [date] })
  const habits = [root, parent, child]
  const ancestors = computeParentPromptChain(child.id, new Map(habits.map((habit) => [habit.id, habit])), date, {
    getChildren: (id) => habits.filter((habit) => habit.parentId === id),
    isRelevantToday: () => true,
    isDueOnSelectedDate: () => true,
    skippedIds: new Set(),
    resolvedModes: new Map([[child.id, 'log']]),
  })
  return { ...ancestors[0]!, childId: child.id, date, ancestors, selectedCount: 1 }
}

describe('parent prompt transitions', () => {
  it('enqueues in order and starts a new queue for another date', () => {
    const prompt = promptFixture()
    const first = transitionParentPromptQueue(createParentPromptQueue(prompt.date), { type: 'enqueue', prompt })
    const second = { ...prompt, childId: 'another-child' }
    const queued = transitionParentPromptQueue(first, { type: 'enqueue', prompt: second })
    expect(queued.prompts).toEqual([prompt, second])
    const nextDate = promptFixture('2026-09-13')
    expect(transitionParentPromptQueue(queued, { type: 'enqueue', prompt: nextDate })).toEqual({ date: nextDate.date, prompts: [nextDate] })
  })

  it('shifts only the active date and retains the next prompt', () => {
    const prompt = promptFixture()
    const second = { ...prompt, childId: 'another-child' }
    const queue = { date: prompt.date, prompts: [prompt, second] }
    expect(transitionParentPromptQueue(queue, { type: 'shift', date: '2026-09-13' })).toBe(queue)
    expect(transitionParentPromptQueue(queue, { type: 'shift', date: prompt.date }).prompts).toEqual([second])
  })

  it('progresses the selected ancestor prefix without changing a different prompt', () => {
    const prompt = promptFixture()
    const other = { ...prompt, childId: 'another-child' }
    const queue = { date: prompt.date, prompts: [prompt, other] }
    const progressed = transitionParentPromptQueue(queue, { type: 'progress', prompt, index: 1, checked: true })
    expect(progressed.prompts[0]?.selectedCount).toBe(2)
    expect(progressed.prompts[1]).toBe(other)
    const reduced = transitionParentPromptQueue(progressed, { type: 'progress', prompt: progressed.prompts[0]!, index: 0, checked: false })
    expect(reduced.prompts[0]?.selectedCount).toBe(0)
  })

  it('clears every prompt and owns the next date', () => {
    const prompt = promptFixture()
    const queue = { date: prompt.date, prompts: [prompt] }
    expect(transitionParentPromptQueue(queue, { type: 'clear', date: '2026-09-13' })).toEqual(createParentPromptQueue('2026-09-13'))
  })
})


describe('confirmed parent resolutions', () => {
  it('retains day resolutions across idle refetches', () => {
    const record = createConfirmedResolutionRecord('2026-09-12')
    const habit = createMockHabit({ id: 'child' })
    record.sources.set(habit.id, { habit, mode: 'log' })
    record.modes.set(habit.id, 'log')
    refreshConfirmedResolutions(record, new Map())
    expect(record.modes.get(habit.id)).toBe('log')
    refreshConfirmedResolutions(record, new Map())
    expect(record.modes.get(habit.id)).toBe('log')
    expect(record.sources.has(habit.id)).toBe(true)
  })

  it('drops persisted optimistic modes while retaining the source for a queued ancestor', () => {
    const record = createConfirmedResolutionRecord('2026-09-12')
    const child = createMockHabit({ id: 'child', isCompleted: true })
    record.sources.set(child.id, { habit: child, mode: 'skip' })
    record.modes.set(child.id, 'skip')
    record.skippedIds.add(child.id)
    refreshConfirmedResolutions(record, new Map([[child.id, child]]))
    expect(record.modes.size).toBe(0)
    expect(record.skippedIds.size).toBe(0)
    expect(record.sources.has(child.id)).toBe(true)
  })
})

describe('parent prompt controller', () => {
  it('offers and confirms the parent after its child is logged', async () => {
    const queue = parentPromptHarness()
    await queue.render().handleDirectToggle(queue.child, 'log')
    const prompted = queue.render()
    expect(prompted.parentPrompt?.habit.id).toBe(queue.parent.id)
    await prompted.confirmParentSettlement()
    expect(queue.bulkLog).toHaveBeenCalledWith([{ habitId: queue.parent.id, date: queue.inputs.selectedDateStr }], [])
    expect(queue.render().parentPrompt).toBeNull()
  })

  it('deduplicates a pending toggle and releases its parent when the child fails', async () => {
    const queue = parentPromptHarness()
    let reject!: (error: Error) => void
    queue.logHabit.mockReturnValueOnce(new Promise((_, fail) => { reject = fail }))
    const first = queue.render().handleDirectToggle(queue.child, 'log')
    expect(queue.render().parentPrompt?.habit.id).toBe(queue.parent.id)
    await queue.render().handleDirectToggle(queue.child, 'log')
    expect(queue.logHabit).toHaveBeenCalledOnce()
    reject(new Error('Write failed'))
    await first
    expect(queue.render().parentPrompt).toBeNull()
    expect(queue.inputs.clearRecentlyCompleted).toHaveBeenCalledWith(queue.child.id, queue.inputs.selectedDateStr)
  })

  it.each([false, true])('waits for the child and rejects an obsolete account: %s', async replaceAccount => {
    const queue = parentPromptHarness()
    let finish!: () => void
    queue.logHabit.mockReturnValueOnce(new Promise(resolve => { finish = () => resolve(undefined) }))
    const child = queue.render().handleDirectToggle(queue.child, 'log')
    const confirmation = queue.render().confirmParentSettlement()
    await Promise.resolve()
    expect(queue.bulkLog).not.toHaveBeenCalled()
    if (replaceAccount) { queue.resetAccount(); queue.render() }
    finish()
    await Promise.all([child, confirmation])
    expect(queue.bulkLog).toHaveBeenCalledTimes(replaceAccount ? 0 : 1)
  })

  it('withdraws a skip prompt when the row undo restores its child', async () => {
    const queue = parentPromptHarness()
    await queue.render().skipFromRow(queue.child)
    expect(queue.render().parentPrompt?.mode).toBe('skip')
    queue.skipHabit.mock.calls[0]?.[0].onUndo?.()
    expect(queue.render().parentPrompt).toBeNull()
  })

  it('settles bulk resolutions automatically and reports a partial confirmation failure', async () => {
    const queue = parentPromptHarness()
    queue.render().settleBulkHabitResolutions([{ habitId: queue.child.id, mode: 'log' }], queue.inputs.selectedDateStr)
    await Promise.resolve()
    expect(queue.logHabit).toHaveBeenCalledWith({ habitId: queue.parent.id, date: queue.inputs.selectedDateStr, intent: 'log' })
    const failed = parentPromptHarness()
    failed.render().checkAndPromptParentLog(failed.child.id)
    failed.bulkLog.mockResolvedValueOnce({ results: [{ habitId: failed.parent.id, status: 'Failed' }] })
    await failed.render().confirmParentSettlement()
    expect(failed.inputs.showError).toHaveBeenCalledWith('habits.bulkBar.partialFailure')
  })

  it('refuses an unresolved account day and clears the queue when the date changes', async () => {
    const queue = parentPromptHarness()
    queue.inputs.profile = undefined
    await queue.render().handleDirectToggle(queue.child, 'log')
    expect(queue.logHabit).not.toHaveBeenCalled()
    queue.inputs.profile = createMockProfile({ timeZone: 'UTC' })
    queue.render().checkAndPromptParentLog(queue.child.id)
    expect(queue.render().parentPrompt).not.toBeNull()
    queue.inputs.selectedDateStr = '2026-09-13'
    expect(queue.render().parentPrompt).toBeNull()
  })
})
