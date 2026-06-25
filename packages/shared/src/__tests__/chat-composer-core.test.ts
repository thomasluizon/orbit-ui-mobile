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
  selectActionInvalidations,
} from '../hooks/chat-composer-core'

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
