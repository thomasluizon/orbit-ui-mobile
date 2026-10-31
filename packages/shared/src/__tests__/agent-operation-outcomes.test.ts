import { describe, expect, it } from 'vitest'
import type { AgentOperationResult, AgentPolicyDenial } from '../types/ai'
import { coalesceAgentOperationOutcomes } from '../utils/agent-operation-outcomes'

const operation: AgentOperationResult = {
  operationId: 'operation-1',
  sourceName: 'DeleteHabit',
  riskClass: 'High',
  confirmationRequirement: 'StepUp',
  status: 'Denied',
  policyReason: 'step_up_required',
}

const denial: AgentPolicyDenial = {
  operationId: 'operation-1',
  sourceName: 'DeleteHabit',
  riskClass: 'High',
  confirmationRequirement: 'StepUp',
  reason: 'step_up_required',
}

describe('coalesceAgentOperationOutcomes', () => {
  it('keeps successful operation details when policy did not replace the outcome', () => {
    const successfulOperation: AgentOperationResult = {
      operationId: 'operation-2',
      sourceName: 'CreateHabit',
      targetName: 'Morning walk',
      riskClass: 'Low',
      confirmationRequirement: 'None',
      status: 'Succeeded',
    }

    expect(coalesceAgentOperationOutcomes([operation, successfulOperation], [])).toEqual([
      {
        id: 'operation-1:0',
        source: 'DeleteHabit',
        target: undefined,
        riskClass: 'High',
        status: 'Denied',
        policyReason: 'step_up_required',
      },
      {
        id: 'operation-2:1',
        source: 'CreateHabit',
        target: 'Morning walk',
        riskClass: 'Low',
        status: 'Succeeded',
        policyReason: undefined,
      },
    ])
  })

  it('keeps one policy outcome and its reason when both API records share an id', () => {
    expect(coalesceAgentOperationOutcomes([operation], [denial])).toEqual([{
      id: 'operation-1:0',
      source: 'DeleteHabit',
      target: null,
      riskClass: 'High',
      status: 'Denied',
      policyReason: 'step_up_required',
    }])
  })

  it('retains denials that do not have a matching operation record', () => {
    expect(coalesceAgentOperationOutcomes([], [denial])).toHaveLength(1)
  })

  it('does not apply one catalog denial to another execution of the same tool', () => {
    const denied = { ...operation, pendingOperationId: '11111111-1111-4111-8111-111111111111' }
    const failed = { ...operation, pendingOperationId: '22222222-2222-4222-8222-222222222222', status: 'Failed' as const }
    const outcomes = coalesceAgentOperationOutcomes([denied, failed], [{ ...denial, pendingOperationId: denied.pendingOperationId }])
    expect(outcomes.map(outcome => outcome.status)).toEqual(['Denied', 'Failed'])
    expect(new Set(outcomes.map(outcome => outcome.id)).size).toBe(2)
  })

  it('pairs identity-free policy denials once without replacing independent failures', () => {
    const outcomes = coalesceAgentOperationOutcomes([{ ...operation, status: 'Failed' }, operation], [denial])
    expect(outcomes.map(outcome => outcome.status)).toEqual(['Failed', 'Denied'])
  })

  it('keeps the latest failed state once when its own earlier denial is replayed', () => {
    const pendingOperationId = '11111111-1111-4111-8111-111111111111'
    const outcomes = coalesceAgentOperationOutcomes(
      [{ ...operation, pendingOperationId, status: 'Failed' }], [{ ...denial, pendingOperationId }],
    )
    expect(outcomes).toMatchObject([{ id: pendingOperationId, status: 'Failed' }])
    expect(outcomes).toHaveLength(1)
  })
})
