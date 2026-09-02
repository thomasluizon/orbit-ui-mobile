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
        id: 'operation-1',
        source: 'DeleteHabit',
        target: undefined,
        riskClass: 'High',
        status: 'Denied',
        policyReason: 'step_up_required',
      },
      {
        id: 'operation-2',
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
      id: 'operation-1',
      source: 'DeleteHabit',
      target: null,
      riskClass: 'High',
      status: 'UnsupportedByPolicy',
      policyReason: 'step_up_required',
    }])
  })

  it('retains denials that do not have a matching operation record', () => {
    expect(coalesceAgentOperationOutcomes([], [denial])).toHaveLength(1)
  })
})
