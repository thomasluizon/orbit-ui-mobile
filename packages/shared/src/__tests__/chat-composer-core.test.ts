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
  it('prefers operation.summary over every fallback', () => {
    const response = makeExecuteResponse({
      operation: makeOperation({ summary: 'Done', policyReason: 'reason', sourceName: 'Src' }),
      policyDenial: {
        operationId: 'op-1',
        sourceName: 'Src',
        riskClass: 'Low',
        confirmationRequirement: 'None',
        reason: 'denied',
      },
    })
    expect(buildAgentExecutionMessage(response)).toBe('Done')
  })

  it('falls back to policyDenial.reason when summary is absent', () => {
    const response = makeExecuteResponse({
      operation: makeOperation({ summary: null, policyReason: 'reason', sourceName: 'Src' }),
      policyDenial: {
        operationId: 'op-1',
        sourceName: 'Src',
        riskClass: 'Low',
        confirmationRequirement: 'None',
        reason: 'denied',
      },
    })
    expect(buildAgentExecutionMessage(response)).toBe('denied')
  })

  it('falls back to operation.policyReason before sourceName', () => {
    const response = makeExecuteResponse({
      operation: makeOperation({ summary: null, policyReason: 'plan required', sourceName: 'Src' }),
    })
    expect(buildAgentExecutionMessage(response)).toBe('plan required')
  })

  it('falls back to sourceName when nothing else is present', () => {
    const response = makeExecuteResponse({
      operation: makeOperation({ summary: null, policyReason: null, sourceName: 'Src' }),
    })
    expect(buildAgentExecutionMessage(response)).toBe('Src')
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
    })
  })

  it('flags goals when a successful goal action is present', () => {
    expect(selectActionInvalidations([makeAction({ type: 'CreateGoal' })])).toEqual({
      habits: false,
      goals: true,
    })
  })

  it('flags both when successful habit and goal actions are present', () => {
    expect(
      selectActionInvalidations([
        makeAction({ type: 'CreateHabit' }),
        makeAction({ type: 'UpdateGoal' }),
      ]),
    ).toEqual({ habits: true, goals: true })
  })

  it('flags nothing when no action succeeded', () => {
    expect(
      selectActionInvalidations([makeAction({ type: 'CreateHabit', status: 'Failed' })]),
    ).toEqual({ habits: false, goals: false })
  })

  it('flags nothing for an empty or undefined action list', () => {
    expect(selectActionInvalidations(undefined)).toEqual({ habits: false, goals: false })
    expect(selectActionInvalidations([])).toEqual({ habits: false, goals: false })
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
