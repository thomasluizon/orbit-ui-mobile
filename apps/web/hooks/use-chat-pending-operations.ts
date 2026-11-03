'use client'

import { useCallback, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { AgentExecuteOperationResponse, RevisePendingOperationRequest } from '@orbit/shared/types/ai'
import { getHeldAccountId } from '@/stores/auth-store'
import { getAccountGeneration } from '@/lib/session-epoch'

export function useChatPendingOperations(onExecuted: (response: AgentExecuteOperationResponse) => Promise<void>) {
  const t = useTranslations()
  const locale = useLocale()
  const [batchCount, setBatchCount] = useState(0)
  const trackBatch = useCallback(async <Result,>(operation: () => Promise<Result>) => {
    setBatchCount(count => count + 1)
    try { return await operation() }
    finally { setBatchCount(count => count - 1) }
  }, [])
  const loadOperations = useCallback(async () => {
    const intent = { intendedAccountId: getHeldAccountId(), accountGeneration: getAccountGeneration() }
    const { createChatPendingOperations } = await import('./chat-pending-operation-actions')
    return createChatPendingOperations(t, locale, onExecuted, intent)
  }, [t, locale, onExecuted])
  const revisePendingOperationForBubble = useCallback((id: string, request: RevisePendingOperationRequest) =>
    trackBatch(async () => (await loadOperations()).revisePendingOperationForBubble(id, request)), [loadOperations, trackBatch])
  const refreshPendingOperationForBubble = useCallback((id: string) =>
    trackBatch(async () => (await loadOperations()).refreshPendingOperationForBubble(id)), [loadOperations, trackBatch])
  const confirmAndExecutePendingOperation = useCallback((id: string) =>
    trackBatch(async () => (await loadOperations()).confirmAndExecutePendingOperation(id)), [loadOperations, trackBatch])
  const prepareStepUpForBubble = useCallback((id: string) =>
    trackBatch(async () => (await loadOperations()).prepareStepUpForBubble(id)), [loadOperations, trackBatch])
  const verifyStepUpForBubble = useCallback((id: string, challengeId: string, code: string, token: string) =>
    trackBatch(async () => (await loadOperations()).verifyStepUpForBubble(id, challengeId, code, token)), [loadOperations, trackBatch])
  return {
    isPendingOperationBusy: batchCount > 0,
    trackCardOperation: trackBatch,
    revisePendingOperationForBubble, refreshPendingOperationForBubble, confirmAndExecutePendingOperation,
    prepareStepUpForBubble, verifyStepUpForBubble,
  }
}
