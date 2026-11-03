'use client'

import { reconcileChatPlanApproval, reconcileChatPlanExecution, reconcileChatPlanRevision } from '@orbit/shared/chat'

import type { useTranslations } from 'next-intl'
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


interface PendingIntent { intendedAccountId: string | null; accountGeneration: number }

export function createChatPendingOperations(t: ReturnType<typeof useTranslations>, locale: string, onExecuted: (response: AgentExecuteOperationResponse) => Promise<void>, intent: PendingIntent) {
  const executionResult = createPendingExecutionResult(t, onExecuted)
  return { ...createPendingBubbleRevisions(t, intent), ...createPendingBubbleExecution(t, executionResult, intent), ...createPendingBubbleStepUp(t, locale, executionResult, intent) }
}

function conversationArgument(): [] | [string] {
  const id = useChatStore.getState().conversationId
  return id ? [id] : []
}

function pendingOperationError(failure: {
  error: string
  code?: string
}, t: ReturnType<typeof useTranslations>): string {
  return reportsAccountChanged(failure)
    ? t('errors.api.accountChanged')
    : getFriendlyErrorMessage(failure.error, t, 'chat.sendError', 'generic')
}

function isStalePreviewFailure(failure: {
  status?: number
  error: string
  code?: string
}): boolean {
  return (failure.status === 409 || failure.status === 404) && !reportsAccountChanged(failure)
}

function pendingOperationFailure(failure: {
  status?: number
  error: string
  code?: string
}, t: ReturnType<typeof useTranslations>, includeNonStale = true) {
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
  }
  catch (error) {
    if (!reportsAccountChanged(error))
      throw error
    return null
  }
}

function createPendingExecutionResult(t: ReturnType<typeof useTranslations>, onExecuted: (response: AgentExecuteOperationResponse) => Promise<void>) {
  const executionResult = async (id: string, intendedAccountId: string | null, accountGeneration: number, execution: ServerActionResult<AgentExecuteOperationResponse> | null, includeNonStale = true): Promise<PendingExecutionResult> => {
    if (accountChanged(intendedAccountId, accountGeneration) || !execution)
      return accountChangedResult(t)
    if (!execution.ok)
      return pendingOperationFailure(execution, t, includeNonStale)
    reconcileChatPlanExecution(useChatStore.getState(), id, execution.data)
    await onExecuted(execution.data)
    return { ok: true, response: execution.data }
  }
  return executionResult
}

function createPendingBubbleRevisions(t: ReturnType<typeof useTranslations>, intent: PendingIntent) {
  const revisionResult = (id: string, intendedAccountId: string | null, accountGeneration: number, response: ServerActionResult<PendingOperationRevisionResult> | null) => {
    if (accountChanged(intendedAccountId, accountGeneration) || !response)
      return accountChangedResult(t)
    if (!response.ok)
      return pendingOperationFailure(response, t)
    reconcileChatPlanRevision(useChatStore.getState(), id, response.data)
    return { ok: true as const, result: response.data }
  }
  const revisePendingOperationForBubble = async (id: string, request: RevisePendingOperationRequest) => {
    const { intendedAccountId, accountGeneration } = intent
    if (accountChanged(intendedAccountId, accountGeneration)) return accountChangedResult(t)
    const response = await runChatAction(revisePendingOperation(id, request, accountIntentWithOrigin(intendedAccountId), ...conversationArgument()))
    return revisionResult(id, intendedAccountId, accountGeneration, response)
  }
  const refreshPendingOperationForBubble = async (id: string) => {
    const { intendedAccountId, accountGeneration } = intent
    if (accountChanged(intendedAccountId, accountGeneration)) return accountChangedResult(t)
    const response = await runChatAction(refreshPendingOperation(id, accountIntentWithOrigin(intendedAccountId), ...conversationArgument()))
    return revisionResult(id, intendedAccountId, accountGeneration, response)
  }
  return { revisePendingOperationForBubble, refreshPendingOperationForBubble }
}

function createPendingBubbleExecution(t: ReturnType<typeof useTranslations>, executionResult: ReturnType<typeof createPendingExecutionResult>, intent: PendingIntent) {
  const confirmAndExecutePendingOperation = async (pendingOperationId: string): Promise<PendingExecutionResult> => {
    const { intendedAccountId, accountGeneration } = intent
    if (accountChanged(intendedAccountId, accountGeneration)) return accountChangedResult(t)
    const confirmation = await runChatAction(confirmPendingOperation(pendingOperationId, accountIntentWithOrigin(intendedAccountId), ...conversationArgument()))
    if (accountChanged(intendedAccountId, accountGeneration) || !confirmation)
      return accountChangedResult(t)
    if (!confirmation.ok) {
      return pendingOperationFailure(confirmation, t, false)
    }
    reconcileChatPlanApproval(useChatStore.getState(), pendingOperationId, 'running', confirmation.data.plan)
    const execution = await runChatAction(executePendingOperation(pendingOperationId, confirmation.data.confirmationToken, accountIntentWithOrigin(intendedAccountId), ...conversationArgument()))
    return executionResult(pendingOperationId, intendedAccountId, accountGeneration, execution, false)
  }
  return { confirmAndExecutePendingOperation }
}

function createPendingBubbleStepUp(t: ReturnType<typeof useTranslations>, locale: string, executionResult: ReturnType<typeof createPendingExecutionResult>, intent: PendingIntent) {
  const prepareStepUpForBubble = async (pendingOperationId: string) => {
    const { intendedAccountId, accountGeneration } = intent
    if (accountChanged(intendedAccountId, accountGeneration)) return accountChangedResult(t)
    const confirmation = await runChatAction(confirmPendingOperation(pendingOperationId, accountIntentWithOrigin(intendedAccountId), ...conversationArgument()))
    if (accountChanged(intendedAccountId, accountGeneration) || !confirmation)
      return accountChangedResult(t)
    if (!confirmation.ok) {
      return pendingOperationFailure(confirmation, t)
    }
    reconcileChatPlanApproval(useChatStore.getState(), pendingOperationId, 'running', confirmation.data.plan)
    const challenge = await runChatAction(issuePendingOperationStepUp(pendingOperationId, locale, accountIntentWithOrigin(intendedAccountId)))
    if (accountChanged(intendedAccountId, accountGeneration) || !challenge)
      return accountChangedResult(t)
    if (!challenge.ok) {
      return pendingOperationFailure(challenge, t)
    }
    return {
      ok: true as const,
      challengeId: challenge.data.challengeId,
      confirmationToken: confirmation.data.confirmationToken,
    }
  }
  const verifyStepUpForBubble = async (pendingOperationId: string, challengeId: string, code: string, confirmationToken: string) => {
    const { intendedAccountId, accountGeneration } = intent
    if (accountChanged(intendedAccountId, accountGeneration)) return accountChangedResult(t)
    const verification = await runChatAction(verifyPendingOperationStepUp(pendingOperationId, challengeId, code, accountIntentWithOrigin(intendedAccountId)))
    if (accountChanged(intendedAccountId, accountGeneration) || !verification)
      return accountChangedResult(t)
    if (!verification.ok) {
      return pendingOperationFailure(verification, t)
    }
    const execution = await runChatAction(executePendingOperation(pendingOperationId, confirmationToken, accountIntentWithOrigin(intendedAccountId), ...conversationArgument()))
    return executionResult(pendingOperationId, intendedAccountId, accountGeneration, execution)
  }
  return { prepareStepUpForBubble, verifyStepUpForBubble }
}
