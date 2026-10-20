import { describe, expect, it } from 'vitest'
import { partitionMessageActions } from '../chat/message-actions'
import type { ActionResult } from '../types/chat'

const actions: ActionResult[] = [
  { type: 'LogHabit', status: 'Success' },
  {
    type: 'BreakDownHabit',
    status: 'Suggestion',
    suggestedSubHabits: [{ title: 'Walk' }],
  },
  { type: 'BreakDownHabit', status: 'Suggestion', suggestedSubHabits: [] },
  {
    type: 'LogHabit',
    status: 'NeedsClarification',
    clarificationRequest: {
      question: 'Which habit?',
      operationId: '11111111-1111-4111-8111-111111111111',
      missingArgumentKey: 'habitId',
      quickActions: [],
    },
  },
  { type: 'LogHabit', status: 'NeedsClarification' },
]

describe('partitionMessageActions', () => {
  it('separates renderable suggestions, clarifications, and completed outcomes', () => {
    const groups = partitionMessageActions(actions)

    expect(groups.suggestionActions).toEqual([actions[1]])
    expect(groups.clarificationActions).toEqual([actions[3]])
    expect(groups.nonSuggestionActions).toEqual([actions[0]])
  })

  it('returns empty groups when a message has no actions', () => {
    expect(partitionMessageActions(undefined)).toEqual({
      clarificationActions: [],
      nonSuggestionActions: [],
      suggestionActions: [],
    })
  })

  it('excludes only the failed action represented by an upgrade policy denial', () => {
    const deniedAction: ActionResult = { type: 'CreateHabit', status: 'Failed' }
    const ordinaryFailure: ActionResult = { type: 'LogHabit', status: 'Failed' }

    const groups = partitionMessageActions(
      [deniedAction, ordinaryFailure],
      [
        {
          operationId: 'operation-1',
          sourceName: 'create_habit',
          riskClass: 'Low',
          confirmationRequirement: 'None',
          reason: 'feature_plan_required:pro',
        },
      ],
    )

    expect(groups.nonSuggestionActions).toEqual([ordinaryFailure])
  })
})
