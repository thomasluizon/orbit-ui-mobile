import type { AgentOperationResult, AgentPolicyDenial } from '../types/ai'

export interface AgentOperationOutcome {
  id: string
  source: string
  target: string | null | undefined
  riskClass: AgentOperationResult['riskClass']
  status: AgentOperationResult['status']
  policyReason?: string
}

/** Coalesces the API's operation and denial records into one visible outcome per operation. */
export function coalesceAgentOperationOutcomes(
  operations: readonly AgentOperationResult[],
  denials: readonly AgentPolicyDenial[],
): AgentOperationOutcome[] {
  const denialsByOperationId = new Map(denials.map((denial) => [denial.operationId, denial]))
  const representedOperationIds = new Set<string>()
  const outcomes = operations.map((operation): AgentOperationOutcome => {
    representedOperationIds.add(operation.operationId)
    const denial = denialsByOperationId.get(operation.operationId)
    if (denial) {
      return {
        id: denial.operationId,
        source: denial.sourceName,
        target: null,
        riskClass: denial.riskClass,
        status: 'UnsupportedByPolicy',
        policyReason: denial.reason,
      }
    }

    return {
      id: operation.operationId,
      source: operation.sourceName,
      target: operation.targetName,
      riskClass: operation.riskClass,
      status: operation.status,
      policyReason: operation.policyReason ?? undefined,
    }
  })

  for (const denial of denials) {
    if (representedOperationIds.has(denial.operationId)) continue
    outcomes.push({
      id: denial.operationId,
      source: denial.sourceName,
      target: null,
      riskClass: denial.riskClass,
      status: 'UnsupportedByPolicy',
      policyReason: denial.reason,
    })
  }

  return outcomes
}
