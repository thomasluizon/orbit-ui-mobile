import type { AgentOperationResult, AgentPolicyDenial } from '../types/ai'

export interface AgentOperationOutcome {
  id: string
  source: string
  target: string | null | undefined
  riskClass: AgentOperationResult['riskClass']
  status: AgentOperationResult['status']
  policyReason?: string
  pendingOperationId?: string
  access?: AgentOperationResult['access']
}

/** Coalesces the API's operation and denial records into one visible outcome per operation. */
export function coalesceAgentOperationOutcomes(
  operations: readonly AgentOperationResult[],
  denials: readonly AgentPolicyDenial[],
): AgentOperationOutcome[] {
  const remainingDenials = new Set(denials)
  const outcomes = operations.map((operation, index): AgentOperationOutcome => {
    const isDenied = operation.status === 'Denied' || operation.status === 'UnsupportedByPolicy'
    const denial = [...remainingDenials].find(entry => operation.pendingOperationId
      ? entry.pendingOperationId === operation.pendingOperationId
      : isDenied && !entry.pendingOperationId && entry.operationId === operation.operationId)
    const pendingIdentity = operation.pendingOperationId
      ? { id: operation.pendingOperationId, pendingOperationId: operation.pendingOperationId }
      : { id: `${operation.operationId}:${index}` }
    const identity = { ...pendingIdentity, ...(operation.access ? { access: operation.access } : {}) }
    if (denial) remainingDenials.delete(denial)
    if (denial && isDenied) {
      return {
        ...identity,
        source: denial.sourceName,
        target: null,
        riskClass: denial.riskClass,
        status: 'UnsupportedByPolicy',
        policyReason: denial.reason,
      }
    }

    return {
      ...identity,
      source: operation.sourceName,
      target: operation.targetName,
      riskClass: operation.riskClass,
      status: operation.status,
      policyReason: operation.policyReason ?? undefined,
    }
  })

  for (const [index, denial] of [...remainingDenials].entries()) {
    outcomes.push({
      id: denial.pendingOperationId ?? `${denial.operationId}:denial:${index}`,
      ...(denial.pendingOperationId ? { pendingOperationId: denial.pendingOperationId } : {}),
      source: denial.sourceName,
      target: null,
      riskClass: denial.riskClass,
      status: 'UnsupportedByPolicy',
      policyReason: denial.reason,
    })
  }

  return outcomes
}
