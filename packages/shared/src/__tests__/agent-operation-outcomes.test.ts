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
