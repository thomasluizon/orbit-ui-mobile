'use client'

import { useCallback } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { AgentExecuteOperationResponse } from '@orbit/shared/types/ai'
import { getFriendlyErrorMessage } from '@orbit/shared/utils'
import {
  confirmPendingOperation,
  executePendingOperation,
  issuePendingOperationStepUp,
  verifyPendingOperationStepUp,
} from '@/app/actions/chat'
import { applyServerActionFailure } from '@/lib/client-action'
import { reportsAccountChanged } from '@/app/actions/action-result'
import { getHeldAccountId } from '@/stores/auth-store'

type PendingExecutionResult =
  | { ok: true; response: AgentExecuteOperationResponse }
  | { ok: false; error: string }

function pendingOperationError(
  failure: { error: string; code?: string },
  t: ReturnType<typeof useTranslations>,
): string {
  return reportsAccountChanged(failure)
    ? t('errors.api.accountChanged')
    : getFriendlyErrorMessage(failure.error, t, 'chat.sendError', 'generic')
}

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
    const intendedAccountId = getHeldAccountId()
    const confirmation = await confirmPendingOperation(pendingOperationId, intendedAccountId)
    await applyServerActionFailure(confirmation)
    if (!confirmation.ok) {
      return { ok: false, error: pendingOperationError(confirmation, t) }
    }

    const execution = await executePendingOperation(
      pendingOperationId,
      confirmation.data.confirmationToken,
      intendedAccountId,
    )
    await applyServerActionFailure(execution)

    if (!execution.ok) {
      return { ok: false, error: pendingOperationError(execution, t) }
    }

    await onExecuted(execution.data)
    return { ok: true, response: execution.data }
  }, [onExecuted, t])

  const prepareStepUpForBubble = useCallback(
    async (pendingOperationId: string) => {
      const intendedAccountId = getHeldAccountId()
      const confirmation = await confirmPendingOperation(pendingOperationId, intendedAccountId)
      await applyServerActionFailure(confirmation)
      if (!confirmation.ok) {
        return { ok: false as const, error: pendingOperationError(confirmation, t) }
      }

      const challenge = await issuePendingOperationStepUp(pendingOperationId, locale, intendedAccountId)
      await applyServerActionFailure(challenge)
      if (!challenge.ok) {
        return { ok: false as const, error: pendingOperationError(challenge, t) }
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
      const verification = await verifyPendingOperationStepUp(
        pendingOperationId,
        challengeId,
        code,
        intendedAccountId,
      )
      await applyServerActionFailure(verification)

      if (!verification.ok) {
        return { ok: false as const, error: pendingOperationError(verification, t) }
      }

      const execution = await executePendingOperation(
        pendingOperationId,
        confirmationToken,
        intendedAccountId,
      )
      await applyServerActionFailure(execution)
      if (!execution.ok) {
        return { ok: false as const, error: pendingOperationError(execution, t) }
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
