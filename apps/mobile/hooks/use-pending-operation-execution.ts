import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AgentExecuteOperationResponse, RevisePendingOperationRequest } from '@orbit/shared/types'
import { buildChatClientContext } from '@orbit/shared/chat'
import { captureError } from '@/lib/sentry'
import { getFriendlyErrorMessage, loadModule } from '@orbit/shared/utils'
import { getAccountGeneration } from '@/lib/session-epoch'
import { useChatStore } from '@/stores/chat-store'
export type { PendingExecutionResult, PreparedStepUpExecution } from './chat-pending-operation-actions'

interface UsePendingOperationExecutionOptions {
  handleExecutedOperation: (response: AgentExecuteOperationResponse) => Promise<void>
}

export function usePendingOperationExecution({ handleExecutedOperation }: UsePendingOperationExecutionOptions) {
  const { t, i18n } = useTranslation()
  const getClientContext = useCallback(() => buildChatClientContext({ platform: 'mobile', locale: i18n.language, conversationId: useChatStore.getState().conversationId ?? undefined }), [i18n.language])
  const [batchCount, setBatchCount] = useState(0)
  const trackBatch = useCallback(async <Result,>(operation: () => Promise<Result>) => {
    setBatchCount(count => count + 1)
    try { return await operation() }
    finally { setBatchCount(count => count - 1) }
  }, [])
  const loadOperations = useCallback(async () => {
    const intendedGeneration = getAccountGeneration()
    try {
      const { createPendingOperations } = await loadModule(() => import('./chat-pending-operation-actions'), captureError)
      if (intendedGeneration !== getAccountGeneration()) return { ok: false as const, error: t('errors.api.accountChanged') }
      return { ok: true as const, operations: createPendingOperations(handleExecutedOperation, t, i18n, getClientContext, intendedGeneration) }
    } catch (error) {
      return { ok: false as const, error: getFriendlyErrorMessage(error, t, 'chat.sendError', 'generic'), stale: false }
    }
  }, [getClientContext, handleExecutedOperation, i18n, t])
  const revisePendingOperationForBubble = useCallback((id: string, request: RevisePendingOperationRequest) => trackBatch(async () => {
    const loaded = await loadOperations()
    return loaded.ok ? loaded.operations.revisePendingOperationForBubble(id, request) : loaded
  }), [loadOperations, trackBatch])
  const refreshPendingOperationForBubble = useCallback((id: string) => trackBatch(async () => {
    const loaded = await loadOperations()
    return loaded.ok ? loaded.operations.refreshPendingOperationForBubble(id) : loaded
  }), [loadOperations, trackBatch])
  const confirmAndExecutePendingOperation = useCallback((id: string) => trackBatch(async () => {
    const loaded = await loadOperations()
    return loaded.ok ? loaded.operations.confirmAndExecutePendingOperation(id) : loaded
  }), [loadOperations, trackBatch])
  const prepareStepUpForBubble = useCallback((id: string) => trackBatch(async () => {
    const loaded = await loadOperations()
    return loaded.ok ? loaded.operations.prepareStepUpForBubble(id) : loaded
  }), [loadOperations, trackBatch])
  const verifyStepUpForBubble = useCallback((id: string, challengeId: string, code: string, token: string) => trackBatch(async () => {
    const loaded = await loadOperations()
    return loaded.ok ? loaded.operations.verifyStepUpForBubble(id, challengeId, code, token) : loaded
  }), [loadOperations, trackBatch])
  return {
    isPendingOperationBusy: batchCount > 0,
    trackCardOperation: trackBatch,
    revisePendingOperationForBubble, refreshPendingOperationForBubble, confirmAndExecutePendingOperation,
    prepareStepUpForBubble, verifyStepUpForBubble,
  }
}
