import type { PendingAgentOperation } from '../types/ai'
import { getAgentCapabilityLabelKey } from '../utils/agent-pending-operation'

export interface PendingOperationCardLabels {
  approve: string
  cancel: string
  confirm: string
  confirmBody: string
  confirmNote: string
  confirmTitle: string
  irreversible: string
  name: string
  pending: string
  pendingTitle: string
  risk: string
  stepUpAction: string
  stepUpMessage: string
}

export function buildPendingOperationCardLabels(
  pendingOperation: PendingAgentOperation,
  translate: (key: string) => string,
): PendingOperationCardLabels {
  const capabilityKey = getAgentCapabilityLabelKey(pendingOperation.capabilityId)
  return {
    approve: translate('chat.operation.approve'),
    cancel: translate('common.cancel'),
    confirm: translate('chat.operation.confirm'),
    confirmBody: translate('chat.operation.confirmBody'),
    confirmNote: translate('chat.operation.confirmNote'),
    confirmTitle: translate('chat.operation.confirmTitle'),
    irreversible: translate('chat.operation.irreversible'),
    name: translate(capabilityKey ?? 'chat.operation.unknown'),
    pending: translate('chat.operation.pending'),
    pendingTitle: translate('chat.operation.pendingTitle'),
    risk: translate(`chat.operation.risk.${pendingOperation.riskClass.toLowerCase()}`),
    stepUpAction: translate('chat.operation.stepUpAction'),
    stepUpMessage: translate('chat.operation.stepUpMessage'),
  }
}
