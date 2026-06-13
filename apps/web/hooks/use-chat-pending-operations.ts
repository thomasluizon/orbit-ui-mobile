'use client'

import { useCallback } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { AgentExecuteOperationResponse } from '@orbit/shared/types/ai'
import { getErrorMessage } from '@orbit/shared/utils'
import {
  confirmPendingOperation,
  executePendingOperation,
  issuePendingOperationStepUp,
  verifyPendingOperationStepUp,
} from '@/app/actions/chat'

type PendingExecutionResult =
  | { ok: true; response: AgentExecuteOperationResponse }
  | { ok: false; error: string }

/**
 * Confirm/execute and step-up verification flows for chat pending operations.
 * Routes through the chat Server Actions and forwards a successful execution to
 * `onExecuted` so the composer can append the resulting message + invalidate.
 */
export function useChatPendingOperations(
  onExecuted: (response: AgentExecuteOperationResponse) => Promise<void>,
) {
  const t = useTranslations()
  const locale = useLocale()

  const confirmAndExecutePendingOperation = useCallback(async (pendingOperationId: string): Promise<PendingExecutionResult> => {
    const confirmation = await confirmPendingOperation(pendingOperationId)
    if (!confirmation.ok) {
      return { ok: false, error: getErrorMessage(confirmation.error, t('chat.sendError')) }
    }

    const execution = await executePendingOperation(
      pendingOperationId,
      confirmation.data.confirmationToken,
    )

    if (!execution.ok) {
      return { ok: false, error: getErrorMessage(execution.error, t('chat.sendError')) }
    }

    await onExecuted(execution.data)
    return { ok: true, response: execution.data }
  }, [onExecuted, t])

  const prepareStepUpForBubble = useCallback(
    async (pendingOperationId: string) => {
      const confirmation = await confirmPendingOperation(pendingOperationId)
      if (!confirmation.ok) {
        return { ok: false as const, error: getErrorMessage(confirmation.error, t('chat.sendError')) }
      }

      const challenge = await issuePendingOperationStepUp(pendingOperationId, locale)
      if (!challenge.ok) {
        return { ok: false as const, error: getErrorMessage(challenge.error, t('chat.sendError')) }
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
      const verification = await verifyPendingOperationStepUp(
        pendingOperationId,
        challengeId,
        code,
      )

      if (!verification.ok) {
        return { ok: false as const, error: getErrorMessage(verification.error, t('chat.sendError')) }
      }

      const execution = await executePendingOperation(pendingOperationId, confirmationToken)
      if (!execution.ok) {
        return { ok: false as const, error: getErrorMessage(execution.error, t('chat.sendError')) }
      }

      await onExecuted(execution.data)
      return { ok: true as const, response: execution.data }
    },
    [onExecuted, t],
  )

  return {
    confirmAndExecutePendingOperation,
    prepareStepUpForBubble,
    verifyStepUpForBubble,
  }
}
