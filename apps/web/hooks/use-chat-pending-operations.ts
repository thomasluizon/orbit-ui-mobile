'use client'

import { useCallback, useState } from 'react'
import { getFriendlyErrorMessage, loadModule } from '@orbit/shared/utils'
import { reportModuleLoadError } from '@/lib/report-module-load-error'
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
    try {
      const { createChatPendingOperations } = await loadModule(() => import('./chat-pending-operation-actions'), reportModuleLoadError)
      if (intent.intendedAccountId !== getHeldAccountId() || intent.accountGeneration !== getAccountGeneration())
        return { ok: false as const, error: t('errors.api.accountChanged') }
      return { ok: true as const, operations: createChatPendingOperations(t, locale, onExecuted, intent) }
    } catch (error) {
      return { ok: false as const, error: getFriendlyErrorMessage(error, t, 'chat.sendError', 'generic'), stale: false }
    }
  }, [t, locale, onExecuted])
  const revisePendingOperationForBubble = useCallback((id: string, request: RevisePendingOperationRequest) =>
    trackBatch(async () => {
      const loaded = await loadOperations()
      return loaded.ok ? loaded.operations.revisePendingOperationForBubble(id, request) : loaded
    }), [loadOperations, trackBatch])
  const refreshPendingOperationForBubble = useCallback((id: string) =>
    trackBatch(async () => {
      const loaded = await loadOperations()
      return loaded.ok ? loaded.operations.refreshPendingOperationForBubble(id) : loaded
    }), [loadOperations, trackBatch])
  const confirmAndExecutePendingOperation = useCallback((id: string) =>
    trackBatch(async () => {
      const loaded = await loadOperations()
      return loaded.ok ? loaded.operations.confirmAndExecutePendingOperation(id) : loaded
    }), [loadOperations, trackBatch])
  const prepareStepUpForBubble = useCallback((id: string) =>
    trackBatch(async () => {
      const loaded = await loadOperations()
      return loaded.ok ? loaded.operations.prepareStepUpForBubble(id) : loaded
    }), [loadOperations, trackBatch])
  const verifyStepUpForBubble = useCallback((id: string, challengeId: string, code: string, token: string) =>
    trackBatch(async () => {
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
