import { describe, expect, it } from 'vitest'
import type {
  ActionResult,
  AgentExecuteOperationResponse,
  AgentOperationResult,
} from '../types/index'
import {
  buildAgentExecutionMessage,
  classifySendFailure,
  findPremiumPolicyDenial,
  invalidateAgentQueries,
  selectActionInvalidations,
} from '../hooks/chat-composer-core'
import { deriveLiveChatSuggestions } from '../chat'
import { createMockGoal, createMockHabit, createMockProfile } from './factories'
import type { HabitScheduleItem } from '../types/habit'

function makeOperation(overrides: Partial<AgentOperationResult> = {}): AgentOperationResult {
  return {
    operationId: 'op-1',
    sourceName: 'CreateHabit',
    riskClass: 'Low',
    confirmationRequirement: 'None',
    status: 'Succeeded',
    ...overrides,
  }
}

function makeExecuteResponse(
  overrides: Partial<AgentExecuteOperationResponse> = {},
): AgentExecuteOperationResponse {
  return {
    operation: makeOperation(),
    ...overrides,
  }
}

function makeAction(overrides: Partial<ActionResult> = {}): ActionResult {
  return {
    type: 'CreateHabit',
    status: 'Success',
    entityId: null,
    entityName: null,
    error: null,
    field: null,
    suggestedSubHabits: null,
    conflictWarning: null,
    ...overrides,
  }
}

describe('deriveLiveChatSuggestions', () => {
  const profile = createMockProfile({ currentStreak: 6 })
  const habit: HabitScheduleItem = {
    ...createMockHabit({
      id: 'habit-live',
      title: 'Morning walk',
      isOverdue: true,
      scheduledDates: ['2025-01-01'],
      linkedGoals: [],
    }),
    children: [],
    linkedGoals: [],
  }
  const goal = createMockGoal({ id: 'goal-live', title: 'Run a 10K', linkedHabits: [] })

  it('returns three distinct destination suggestions from the supplied live state', () => {
    const suggestionsByDestination = [
      deriveLiveChatSuggestions({ destination: 'hoje', habits: [habit], profile }),
      deriveLiveChatSuggestions({
        destination: 'calendario',
        calendar: { habits: [habit], logs: {} },
        profile,
      }),
      deriveLiveChatSuggestions({ destination: 'progresso', goals: [goal], profile }),
      deriveLiveChatSuggestions({ destination: 'perfil', profile }),
    ]

    expect(suggestionsByDestination.map((suggestions) => suggestions.length)).toEqual([3, 3, 3, 3])
    expect(new Set(suggestionsByDestination.map((suggestions) => suggestions[0].key)).size).toBe(4)
  })

  it('carries live habit, goal, and streak values into the localized prompts', () => {
    expect(deriveLiveChatSuggestions({ destination: 'hoje', habits: [habit], profile })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ values: { habit: 'Morning walk' } }),
        expect.objectContaining({ key: 'shell.composer.live.today.oneRemaining' }),
      ]),
    )
    expect(
      deriveLiveChatSuggestions({ destination: 'progresso', goals: [goal], profile }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ values: { goal: 'Run a 10K' } }),
        expect.objectContaining({ values: { count: 6 } }),
      ]),
    )
  })

  it('describes empty, completed, and multi-habit Today states accurately', () => {
    const empty = deriveLiveChatSuggestions({
      destination: 'hoje',
      profile: createMockProfile({ currentStreak: 0, hasGoogleConnection: false }),
    })
    expect(empty.map((suggestion) => suggestion.key)).toEqual([
      'shell.composer.live.today.firstHabit',
      'shell.composer.live.today.planRoutine',
      'shell.composer.live.profile.explainCalendar',
    ])

    const completedLinked: HabitScheduleItem = {
      ...habit,
      isCompleted: true,
      linkedGoals: [{ id: 'goal-1', title: 'Move more' }],
    }
    const completed = deriveLiveChatSuggestions({
      destination: 'hoje',
      habits: [completedLinked],
      profile: createMockProfile({ hasGoogleConnection: true }),
    })
    expect(completed.map((suggestion) => suggestion.key)).toEqual([
      'shell.composer.live.today.reviewCompleted',
      'shell.composer.live.today.reviewGoal',
      'shell.composer.live.profile.reviewCalendar',
    ])

    const multi = deriveLiveChatSuggestions({
      destination: 'hoje',
      habits: [
        { ...habit, id: 'habit-a', title: 'Read', isOverdue: false },
        { ...habit, id: 'habit-b', title: 'Stretch', isOverdue: false },
      ],
      profile,
    })
    expect(multi[0]).toMatchObject({
      key: 'shell.composer.live.today.start',
      values: { habit: 'Read' },
    })
    expect(multi[2]).toMatchObject({
      key: 'shell.composer.live.today.remaining',
      values: { count: 2 },
    })
  })

  it('describes empty, upcoming, and completed Calendar ranges accurately', () => {
    const empty = deriveLiveChatSuggestions({
      destination: 'calendario',
      profile: createMockProfile({ hasGoogleConnection: false }),
    })
    expect(empty.map((suggestion) => suggestion.key)).toEqual([
      'shell.composer.live.calendar.planEmpty',
      'shell.composer.live.profile.explainCalendar',
      'shell.composer.live.calendar.firstSchedule',
    ])

    const upcomingHabit: HabitScheduleItem = {
      ...habit,
      title: 'Future walk',
      scheduledDates: ['2099-01-01'],
    }
    const upcoming = deriveLiveChatSuggestions({
      destination: 'calendario',
      calendar: { habits: [upcomingHabit], logs: {} },
      profile,
    })
    expect(upcoming.map((suggestion) => suggestion.key)).toEqual([
      'shell.composer.live.calendar.reviewMonth',
      'shell.composer.live.calendar.planAround',
      'shell.composer.live.calendar.oneScheduled',
    ])
    expect(upcoming[1].values).toEqual({ habit: 'Future walk' })

    const secondHabit: HabitScheduleItem = {
      ...habit,
      id: 'habit-second',
      title: 'Evening walk',
      scheduledDates: ['2025-01-02'],
    }
    const completed = deriveLiveChatSuggestions({
      destination: 'calendario',
      calendar: {
        habits: [habit, secondHabit],
        logs: {
          [habit.id]: [{ id: 'log-1', date: '2025-01-01', value: 1, createdAtUtc: '2025-01-01T12:00:00Z' }],
          [secondHabit.id]: [{ id: 'log-2', date: '2025-01-02', value: 1, createdAtUtc: '2025-01-02T12:00:00Z' }],
        },
      },
      profile,
    })
    expect(completed[1]).toMatchObject({
      key: 'shell.composer.live.calendar.reviewTiming',
      values: { habit: 'Morning walk' },
    })
    expect(completed[2]).toMatchObject({
      key: 'shell.composer.live.calendar.scheduled',
      values: { count: 2 },
    })
  })

  it('uses linked goals and the active goal count in Progress suggestions', () => {
    const linkedGoals = [
      createMockGoal({
        id: 'goal-a',
        title: 'Goal A',
        linkedHabits: [{ id: 'habit-a', title: 'Habit A' }],
      }),
      createMockGoal({
        id: 'goal-b',
        title: 'Goal B',
        linkedHabits: [{ id: 'habit-b', title: 'Habit B' }],
      }),
    ]
    const suggestions = deriveLiveChatSuggestions({
      destination: 'progresso',
      goals: linkedGoals,
      profile: createMockProfile({ currentStreak: 0 }),
    })

    expect(suggestions[0]).toMatchObject({
      key: 'shell.composer.live.progress.advanceGoal',
      values: { goal: 'Goal A' },
    })
    expect(suggestions[1].key).toBe('shell.composer.live.progress.restartStreak')
    expect(suggestions[2]).toMatchObject({
      key: 'shell.composer.live.progress.reviewGoals',
      values: { count: 2 },
    })
  })

  it('reflects enabled Profile controls in all three suggestions', () => {
    const suggestions = deriveLiveChatSuggestions({
      destination: 'perfil',
      profile: createMockProfile({
        proactiveAstraEnabled: true,
        hasGoogleConnection: true,
        aiSummaryEnabled: true,
      }),
    })

    expect(suggestions.map((suggestion) => suggestion.key)).toEqual([
      'shell.composer.live.profile.pauseProactive',
      'shell.composer.live.profile.reviewCalendar',
      'shell.composer.live.profile.pauseSummary',
    ])
  })
})

describe('buildAgentExecutionMessage', () => {
  const labels = { done: 'DONE', failed: 'FAILED' }
  const internalSummary = 'Manage Calendar Sync requested via Chat'

  it('returns the done label on success, never the raw operation summary', () => {
    const response = makeExecuteResponse({
      operation: makeOperation({ status: 'Succeeded', summary: internalSummary }),
    })
    expect(buildAgentExecutionMessage(response, labels)).toBe('DONE')
  })

  it('returns the failed label for any non-succeeded operation', () => {
    const failed = makeExecuteResponse({
      operation: makeOperation({ status: 'Failed', summary: internalSummary }),
    })
    const denied = makeExecuteResponse({
      operation: makeOperation({ status: 'Denied', summary: internalSummary }),
      policyDenial: {
        operationId: 'op-1',
        sourceName: 'Src',
        riskClass: 'Low',
        confirmationRequirement: 'None',
        reason: 'denied',
      },
    })
    expect(buildAgentExecutionMessage(failed, labels)).toBe('FAILED')
    expect(buildAgentExecutionMessage(denied, labels)).toBe('FAILED')
  })

  it('never surfaces the internal operation summary as user-facing text', () => {
    const response = makeExecuteResponse({
      operation: makeOperation({ status: 'Succeeded', summary: internalSummary }),
    })
    expect(buildAgentExecutionMessage(response, labels)).not.toContain('requested via Chat')
  })
})

describe('classifySendFailure', () => {
  it('classifies a 408 as a timeout', () => {
    const result = classifySendFailure({ status: 408, reason: 'CHAT_TIMEOUT' })
    expect(result.kind).toBe('timeout')
  })

  it('classifies a 403 with a non-upgrade reason as a limit', () => {
    const result = classifySendFailure({ status: 403, reason: 'Daily message limit reached' })
    expect(result.kind).toBe('limit')
  })

  it('classifies a premium denial reason as an upgrade', () => {
    const result = classifySendFailure({ status: 403, reason: 'Premium plan required to use AI' })
    expect(result.kind).toBe('upgrade')
    expect(result.upgrade.shouldUpgrade).toBe(true)
  })

  it('classifies a PAY_GATE code as an upgrade regardless of status', () => {
    const result = classifySendFailure({ status: 500, code: 'PAY_GATE', reason: 'blocked' })
    expect(result.kind).toBe('upgrade')
  })

  it('classifies an unknown failure as generic', () => {
    const result = classifySendFailure({ status: 500, reason: 'Something broke' })
    expect(result.kind).toBe('generic')
    expect(result.reason).toBe('Something broke')
  })
})

describe('selectActionInvalidations', () => {
  it('flags habits when a successful habit action is present', () => {
    expect(selectActionInvalidations([makeAction({ type: 'CreateHabit' })])).toEqual({
      habits: true,
      goals: false,
      tags: false,
    })
  })

  it('flags goals when a successful goal action is present', () => {
    expect(selectActionInvalidations([makeAction({ type: 'CreateGoal' })])).toEqual({
      habits: false,
      goals: true,
      tags: false,
    })
  })

  it('flags both when successful habit and goal actions are present', () => {
    expect(
      selectActionInvalidations([
        makeAction({ type: 'CreateHabit' }),
        makeAction({ type: 'UpdateGoal' }),
      ]),
    ).toEqual({ habits: true, goals: true, tags: false })
  })

  it('flags tags and habits when a successful tag action is present', () => {
    expect(selectActionInvalidations([makeAction({ type: 'CreateTag' })])).toEqual({
      habits: true,
      goals: false,
      tags: true,
    })
  })

  it('flags habits when a habit reorder succeeds', () => {
    expect(selectActionInvalidations([makeAction({ type: 'ReorderHabits' })])).toEqual({
      habits: true,
      goals: false,
      tags: false,
    })
  })

  it('flags goals when a goal reorder succeeds', () => {
    expect(selectActionInvalidations([makeAction({ type: 'ReorderGoals' })])).toEqual({
      habits: false,
      goals: true,
      tags: false,
    })
  })

  it('flags nothing when no action succeeded', () => {
    expect(
      selectActionInvalidations([makeAction({ type: 'CreateHabit', status: 'Failed' })]),
    ).toEqual({ habits: false, goals: false, tags: false })
  })

  it('flags nothing for an empty or undefined action list', () => {
    expect(selectActionInvalidations(undefined)).toEqual({
      habits: false,
      goals: false,
      tags: false,
    })
    expect(selectActionInvalidations([])).toEqual({ habits: false, goals: false, tags: false })
  })
})

describe('invalidateAgentQueries', () => {
  it('keeps the surviving invalidations without the retired query family', async () => {
    const invalidatedKeys: (readonly unknown[])[] = []
    const queryClient = {
      invalidateQueries: async ({ queryKey }: { queryKey: readonly unknown[] }) => {
        invalidatedKeys.push(queryKey)
      },
    }
    await invalidateAgentQueries(queryClient as never)
    const retiredQueryKey = ['user', 'Facts'].join('')
    expect(invalidatedKeys).not.toContainEqual([retiredQueryKey])
    expect(invalidatedKeys).toContainEqual(['habits'])
    expect(invalidatedKeys).toContainEqual(['profile'])
  })
})

describe('findPremiumPolicyDenial', () => {
  it('returns the first denial that requires an upgrade', () => {
    const denial = findPremiumPolicyDenial([
      {
        operationId: 'op-1',
        sourceName: 'Src',
        riskClass: 'Low',
        confirmationRequirement: 'None',
        reason: 'not an upgrade',
      },
      {
        operationId: 'op-2',
        sourceName: 'Src',
        riskClass: 'Low',
        confirmationRequirement: 'None',
        reason: 'Yearly Pro plan required',
      },
    ])
    expect(denial?.operationId).toBe('op-2')
  })

  it('returns undefined when no denial requires an upgrade', () => {
    expect(findPremiumPolicyDenial(undefined)).toBeUndefined()
    expect(
      findPremiumPolicyDenial([
        {
          operationId: 'op-1',
          sourceName: 'Src',
          riskClass: 'Low',
          confirmationRequirement: 'None',
          reason: 'just a note',
        },
      ]),
    ).toBeUndefined()
  })
})
