'use client'

import { reconcileChatPlanApproval, reconcileChatPlanExecution, reconcileChatPlanRevision } from '@orbit/shared/chat'

import { useCallback, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { AgentExecuteOperationResponse } from '@orbit/shared/types/ai'
import type { PendingOperationRevisionResult, RevisePendingOperationRequest } from '@orbit/shared/types/ai'
import type { ServerActionResult } from '@/app/actions/action-result'
import { getFriendlyErrorMessage } from '@orbit/shared/utils'
import {
  confirmPendingOperation,
  executePendingOperation,
  issuePendingOperationStepUp,
  revisePendingOperation,
  refreshPendingOperation,
  verifyPendingOperationStepUp,
} from '@/app/actions/chat'
import { accountIntentWithOrigin, runServerActionResult } from '@/lib/client-action'
import { reportsAccountChanged } from '@/app/actions/action-result'
import { getHeldAccountId } from '@/stores/auth-store'
import { useChatStore } from '@/stores/chat-store'
import { getAccountGeneration } from '@/lib/session-epoch'

type PendingExecutionResult =
  | { ok: true; response: AgentExecuteOperationResponse }
  | { ok: false; error: string; stale?: boolean }

function conversationArgument(): [] | [string] {
  const id = useChatStore.getState().conversationId
  return id ? [id] : []
}

function pendingOperationError(
  failure: { error: string; code?: string },
  t: ReturnType<typeof useTranslations>,
): string {
  return reportsAccountChanged(failure)
    ? t('errors.api.accountChanged')
    : getFriendlyErrorMessage(failure.error, t, 'chat.sendError', 'generic')
}

function isStalePreviewFailure(failure: { status?: number; error: string; code?: string }): boolean {
  return (failure.status === 409 || failure.status === 404) && !reportsAccountChanged(failure)
}

function pendingOperationFailure(
  failure: { status?: number; error: string; code?: string },
  t: ReturnType<typeof useTranslations>,
  includeNonStale = true,
) {
  const stale = isStalePreviewFailure(failure)
  return {
    ok: false as const,
    error: pendingOperationError(failure, t),
    ...(stale || includeNonStale ? { stale } : {}),
  }
}

function accountChanged(id: string | null, generation: number): boolean {
  return getHeldAccountId() !== id || getAccountGeneration() !== generation
}

function accountChangedResult(t: ReturnType<typeof useTranslations>) {
  return { ok: false as const, error: t('errors.api.accountChanged') }
}

async function runChatAction<T>(action: Promise<ServerActionResult<T>>): Promise<ServerActionResult<T> | null> {
  try {
    return await runServerActionResult(action)
  } catch (error) {
    if (!reportsAccountChanged(error)) throw error
    return null
  }
}

/**
 * Confirm/execute and step-up verification flows for chat pending operations.
 * Routes through the chat Server Actions and forwards a successful execution to
 * `onExecuted` so the composer can invalidate affected queries.
 */
export function useChatPendingOperations(
  onExecuted: (response: AgentExecuteOperationResponse) => Promise<void>,
) {
  const t = useTranslations()
  const locale = useLocale()
  const [batchCount, setBatchCount] = useState(0)
  const trackBatch = useCallback(async <Result,>(operation: () => Promise<Result>) => {
    setBatchCount((count) => count + 1)
    try { return await operation() }
    finally { setBatchCount((count) => count - 1) }
  }, [])
  const executionResult = usePendingExecutionResult(t, onExecuted)
  const { revisePendingOperationForBubble, refreshPendingOperationForBubble } = usePendingBubbleRevisions(t)
  const { confirmAndExecutePendingOperation } = usePendingBubbleExecution(t, executionResult)
  const { prepareStepUpForBubble, verifyStepUpForBubble } = usePendingBubbleStepUp(t, locale, executionResult)

  const trackedRevise = useCallback((...args: Parameters<typeof revisePendingOperationForBubble>) =>
    trackBatch(() => revisePendingOperationForBubble(...args)), [revisePendingOperationForBubble, trackBatch])
  const trackedRefresh = useCallback((...args: Parameters<typeof refreshPendingOperationForBubble>) =>
    trackBatch(() => refreshPendingOperationForBubble(...args)), [refreshPendingOperationForBubble, trackBatch])
  const trackedExecute = useCallback((...args: Parameters<typeof confirmAndExecutePendingOperation>) =>
    trackBatch(() => confirmAndExecutePendingOperation(...args)), [confirmAndExecutePendingOperation, trackBatch])
  const trackedPrepare = useCallback((...args: Parameters<typeof prepareStepUpForBubble>) =>
    trackBatch(() => prepareStepUpForBubble(...args)), [prepareStepUpForBubble, trackBatch])
  const trackedVerify = useCallback((...args: Parameters<typeof verifyStepUpForBubble>) =>
    trackBatch(() => verifyStepUpForBubble(...args)), [verifyStepUpForBubble, trackBatch])

  return {
    isPendingOperationBusy: batchCount > 0,
    trackCardOperation: trackBatch,
    revisePendingOperationForBubble: trackedRevise,
    refreshPendingOperationForBubble: trackedRefresh,
    confirmAndExecutePendingOperation: trackedExecute,
    prepareStepUpForBubble: trackedPrepare,
    verifyStepUpForBubble: trackedVerify,
  }
}


function usePendingExecutionResult(t: ReturnType<typeof useTranslations>, onExecuted: (response: AgentExecuteOperationResponse) => Promise<void>) {
  const executionResult = useCallback(async (
    id: string, intendedAccountId: string | null, accountGeneration: number,
    execution: ServerActionResult<AgentExecuteOperationResponse> | null, includeNonStale = true,
  ): Promise<PendingExecutionResult> => {
    if (accountChanged(intendedAccountId, accountGeneration) || !execution) return accountChangedResult(t)
    if (!execution.ok) return pendingOperationFailure(execution, t, includeNonStale)
    reconcileChatPlanExecution(useChatStore.getState(), id, execution.data)
    await onExecuted(execution.data)
    return { ok: true, response: execution.data }
  }, [onExecuted, t])

  return executionResult
}

function usePendingBubbleRevisions(t: ReturnType<typeof useTranslations>) {
  const revisionResult = useCallback((
    id: string, intendedAccountId: string | null, accountGeneration: number,
    response: ServerActionResult<PendingOperationRevisionResult> | null,
  ) => {
    if (accountChanged(intendedAccountId, accountGeneration) || !response) return accountChangedResult(t)
    if (!response.ok) return pendingOperationFailure(response, t)
    reconcileChatPlanRevision(useChatStore.getState(), id, response.data)
    return { ok: true as const, result: response.data }
  }, [t])

  const revisePendingOperationForBubble = useCallback(async (id: string, request: RevisePendingOperationRequest) => {
    const intendedAccountId = getHeldAccountId()
    const accountGeneration = getAccountGeneration()
    const response = await runChatAction(revisePendingOperation(id, request, accountIntentWithOrigin(intendedAccountId), ...conversationArgument()))
    return revisionResult(id, intendedAccountId, accountGeneration, response)
  }, [revisionResult])

  const refreshPendingOperationForBubble = useCallback(async (id: string) => {
    const intendedAccountId = getHeldAccountId()
    const accountGeneration = getAccountGeneration()
    const response = await runChatAction(refreshPendingOperation(id, accountIntentWithOrigin(intendedAccountId), ...conversationArgument()))
    return revisionResult(id, intendedAccountId, accountGeneration, response)
  }, [revisionResult])

  return { revisePendingOperationForBubble, refreshPendingOperationForBubble }
}

function usePendingBubbleExecution(t: ReturnType<typeof useTranslations>, executionResult: ReturnType<typeof usePendingExecutionResult>) {
  const confirmAndExecutePendingOperation = useCallback(async (pendingOperationId: string): Promise<PendingExecutionResult> => {
    const intendedAccountId = getHeldAccountId()
    const accountGeneration = getAccountGeneration()
    const confirmation = await runChatAction(confirmPendingOperation(pendingOperationId, accountIntentWithOrigin(intendedAccountId), ...conversationArgument()))
    if (accountChanged(intendedAccountId, accountGeneration) || !confirmation) return accountChangedResult(t)
    if (!confirmation.ok) {
      return pendingOperationFailure(confirmation, t, false)
    }

    reconcileChatPlanApproval(useChatStore.getState(), pendingOperationId, 'running', confirmation.data.plan)

    const execution = await runChatAction(executePendingOperation(
      pendingOperationId,
      confirmation.data.confirmationToken,
      accountIntentWithOrigin(intendedAccountId),
      ...conversationArgument(),
    ))
    return executionResult(pendingOperationId, intendedAccountId, accountGeneration, execution, false)
  }, [executionResult, t])

  return { confirmAndExecutePendingOperation }
}

function usePendingBubbleStepUp(t: ReturnType<typeof useTranslations>, locale: string, executionResult: ReturnType<typeof usePendingExecutionResult>) {
  const prepareStepUpForBubble = useCallback(
    async (pendingOperationId: string) => {
      const intendedAccountId = getHeldAccountId()
      const accountGeneration = getAccountGeneration()
      const confirmation = await runChatAction(confirmPendingOperation(pendingOperationId, accountIntentWithOrigin(intendedAccountId), ...conversationArgument()))
      if (accountChanged(intendedAccountId, accountGeneration) || !confirmation) return accountChangedResult(t)
      if (!confirmation.ok) {
        return pendingOperationFailure(confirmation, t)
      }

      reconcileChatPlanApproval(useChatStore.getState(), pendingOperationId, 'running', confirmation.data.plan)

      const challenge = await runChatAction(issuePendingOperationStepUp(pendingOperationId, locale, accountIntentWithOrigin(intendedAccountId)))
      if (accountChanged(intendedAccountId, accountGeneration) || !challenge) return accountChangedResult(t)
      if (!challenge.ok) {
        return pendingOperationFailure(challenge, t)
      }

      return {
        ok: true as const,
        challengeId: challenge.data.challengeId,
        confirmationToken: confirmation.data.confirmationToken,
      }
    },
    [locale, t],
  )

  const verifyStepUpForBubble = useCallback(
    async (
      pendingOperationId: string,
      challengeId: string,
      code: string,
      confirmationToken: string,
    ) => {
      const intendedAccountId = getHeldAccountId()
      const accountGeneration = getAccountGeneration()
      const verification = await runChatAction(verifyPendingOperationStepUp(
        pendingOperationId,
        challengeId,
        code,
        accountIntentWithOrigin(intendedAccountId),
      ))
      if (accountChanged(intendedAccountId, accountGeneration) || !verification) return accountChangedResult(t)

      if (!verification.ok) {
        return pendingOperationFailure(verification, t)
      }

      const execution = await runChatAction(executePendingOperation(
        pendingOperationId,
        confirmationToken,
        accountIntentWithOrigin(intendedAccountId),
        ...conversationArgument(),
      ))
      return executionResult(pendingOperationId, intendedAccountId, accountGeneration, execution)
    },
    [executionResult, t],
  )

  return { prepareStepUpForBubble, verifyStepUpForBubble }
}
