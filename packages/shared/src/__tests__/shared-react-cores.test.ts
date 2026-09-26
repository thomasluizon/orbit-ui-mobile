import { describe, expect, it } from 'vitest'
import {
  canStartCalendarEntryMutation,
  createBreakdownDrafts,
  editBreakdownTitle,
  cycleBreakdownCadence,
  failBreakdownResults,
  getFailedBreakdownIds,
  getPendingOperationCardPresentation,
  getPendingOperationExecutionStatus,
  getPendingOperationVerificationResult,
  getPreparedPendingOperationStepUp,
  getHabitReminderPatch,
  getCalendarEntryMutationKey,
  pendingCalendarEntryStates,
  reconciledCalendarEntryMutations,
  mergeHabitReminderChanges,
  mergeBreakdownResults,
  releaseShellNoticeRenderer,
  selectBreakdownHabits,
  toggleHabitDetailField,
  toggleHabitDetailGoal,
  type BreakdownDraftHabit,
} from '../hooks'
import type { AgentExecuteOperationResponse } from '../types/ai'
import { makeHabitDetailScopedParent } from '../test-support/habit-detail-fixtures'
import { tintProposedTree } from '../utils/proposed-tint-core'

describe('shared React-free state decisions', () => {
  it('accepts only a succeeded operation in a successful response', () => {
    const response = {
      operation: {
        operationId: 'operation-1', sourceName: 'DeleteHabit', riskClass: 'High',
        confirmationRequirement: 'StepUp', status: 'Succeeded',
      },
    } satisfies AgentExecuteOperationResponse
    expect(getPendingOperationExecutionStatus({ ok: true, response })).toBe('done')
    expect(getPendingOperationExecutionStatus({ ok: false, response })).toBe('failed')
    expect(getPendingOperationExecutionStatus({ ok: true })).toBe('failed')
    expect(getPendingOperationExecutionStatus({
      ok: true, response: { operation: { ...response.operation, status: 'Failed' } },
    })).toBe('failed')
  })

  it('prepares and verifies pending operations', () => {
    expect(getPreparedPendingOperationStepUp({
      ok: true, challengeId: 'challenge-1', confirmationToken: 'token-1',
    })).toEqual({ challengeId: 'challenge-1', confirmationToken: 'token-1' })
    expect(getPreparedPendingOperationStepUp({ ok: false })).toBeUndefined()
    expect(getPendingOperationVerificationResult({ ok: false }, 'Try again')).toEqual({ error: 'Try again' })
    expect(getPendingOperationVerificationResult({ ok: false, error: 'Wrong code' }, 'Try again'))
      .toEqual({ error: 'Wrong code' })
    expect(getPendingOperationVerificationResult({ ok: true }, 'Try again')).toEqual({ status: 'failed' })
  })

  it('derives the pending card action and frame', () => {
    expect(getPendingOperationCardPresentation('Destructive', 'StepUp', false, undefined))
      .toEqual({ destructive: true, action: 'stepUp', frameState: 'resting' })
    expect(getPendingOperationCardPresentation('High', 'None', true, undefined))
      .toEqual({ destructive: false, action: 'buttons', frameState: 'acting' })
    expect(getPendingOperationCardPresentation('High', 'None', false, 'failed'))
      .toEqual({ destructive: false, action: 'none', frameState: 'partiallyFailed' })
  })

  it('selects and marks failed breakdown drafts', () => {
    const habits = [
      { id: 'one', title: 'One' },
      { id: 'two', title: 'Two' },
    ] as BreakdownDraftHabit[]
    expect(selectBreakdownHabits(habits, ['two'])).toEqual([habits[1]])
    expect(selectBreakdownHabits(habits)).toBe(habits)
    const failed = failBreakdownResults({ one: 'done' }, [habits[1]!])
    expect(failed).toEqual({ one: 'done', two: 'failed' })
    expect(getFailedBreakdownIds(habits, failed)).toEqual(['two'])
  })

  it('creates and edits breakdown drafts, then maps server results', () => {
    const drafts = createBreakdownDrafts([{ title: 'Read one page' }, { title: 'Write one line' }])
    expect(drafts.map(({ id, title }) => ({ id, title }))).toEqual([
      { id: 'proposal-0', title: 'Read one page' },
      { id: 'proposal-1', title: 'Write one line' },
    ])
    expect(editBreakdownTitle(drafts, 'proposal-1', 'Write two lines')[1]?.title)
      .toBe('Write two lines')
    expect(cycleBreakdownCadence(drafts, 'proposal-0')[0]?.frequencyUnit).toBe('Day')
    const response = { results: [
      { index: 0, status: 'Success', habitId: 'habit-1', title: 'Read one page', error: null, field: null },
      { index: 1, status: 'Failed', habitId: null, title: 'Write one line', error: 'Denied', field: null },
    ] } as const
    expect(mergeBreakdownResults({}, drafts, { results: [...response.results] }))
      .toEqual({ 'proposal-0': 'done', 'proposal-1': 'failed' })
  })

  it('merges reminder changes and toggles the active field', () => {
    expect(toggleHabitDetailField('time', 'time')).toBeNull()
    expect(toggleHabitDetailField('time', 'schedule')).toBe('schedule')
    expect(mergeHabitReminderChanges(false, [15], [], { enabled: true, offsets: [30] }))
      .toEqual({ reminderEnabled: true, reminderTimes: [30], scheduledReminders: [] })
  })

  it('toggles linked goals and validates a reminder patch', () => {
    expect(toggleHabitDetailGoal(['goal-1'], 'goal-1')).toEqual([])
    expect(toggleHabitDetailGoal([], 'goal-2')).toEqual(['goal-2'])
    const habit = makeHabitDetailScopedParent()
    expect(getHabitReminderPatch(habit, false, [], []).patch).toEqual({
      reminderEnabled: false, reminderTimes: [], scheduledReminders: [],
    })
  })

  it('starts mutations only for an unlocked source entry', () => {
    const source = new Map([['entry', false]])
    expect(canStartCalendarEntryMutation(new Map(), source, 'entry')).toBe(true)
    expect(canStartCalendarEntryMutation(new Map([['entry', { checked: true, settled: false }]]), source, 'entry'))
      .toBe(false)
    expect(canStartCalendarEntryMutation(new Map(), source, 'missing')).toBe(false)
  })

  it('publishes and reconciles settled calendar mutations', () => {
    const key = getCalendarEntryMutationKey('2026-09-26', 'habit-1')
    expect(key).toBe('2026-09-26:habit-1')
    const mutations = new Map([[key, { checked: true, settled: true }]])
    expect(pendingCalendarEntryStates(mutations)).toEqual(new Map([[key, true]]))
    expect(reconciledCalendarEntryMutations(mutations, new Map([[key, false]]))).toEqual(mutations)
    expect(reconciledCalendarEntryMutations(mutations, new Map([[key, true]]))).toEqual(new Map())
  })

  it('releases only the matching shell notice renderer', () => {
    const registered = () => 'notice'
    const other = () => 'other'
    expect(releaseShellNoticeRenderer(registered, registered)).toBeNull()
    expect(releaseShellNoticeRenderer(other, registered)).toBe(other)
  })
})

describe('proposed tint tree', () => {
  it('tints text through nested elements while keeping explicit color', () => {
    type Node = string | { color?: boolean; children: Node[] } | Node[]
    const children: Node = [
      { children: ['Plain'] },
      { color: true, children: ['Keep'] },
    ]
    const result = tintProposedTree<Node>(children, {
      isText: (child) => typeof child === 'string',
      isElement: (child) => typeof child === 'object' && !Array.isArray(child),
      wrapText: (child) => ({ color: true, children: [child] }),
      visitElement: (child) => !Array.isArray(child) && typeof child === 'object' && child.color
        ? { kind: 'keep' } : { kind: 'recurse' },
      getChildren: (child) => !Array.isArray(child) && typeof child === 'object' ? child.children : [],
      mapChildren: (nodes, visit) => Array.isArray(nodes) ? nodes.map(visit) : nodes,
      withChildren: (child, nested) => ({
        ...(!Array.isArray(child) && typeof child === 'object' ? child : {}),
        children: Array.isArray(nested) ? nested : [nested],
      }),
    })
    expect(result).toEqual([
      { children: [{ color: true, children: ['Plain'] }] },
      { color: true, children: ['Keep'] },
    ])
  })
})
