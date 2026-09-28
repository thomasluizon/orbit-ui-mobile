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
import { accountIntentWithOrigin, runServerActionResult } from '@/lib/client-action'
import { reportsAccountChanged } from '@/app/actions/action-result'
import { getHeldAccountId } from '@/stores/auth-store'

type PendingExecutionResult =
  | { ok: true; response: AgentExecuteOperationResponse }
  | { ok: false; error: string }

function accountRefusalResult(error: unknown, t: (key: string) => string): PendingExecutionResult {
  if (!reportsAccountChanged(error)) throw error
  return { ok: false, error: t('errors.api.accountChanged') }
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
    try {
    const intendedAccountId = accountIntentWithOrigin(getHeldAccountId())
    const confirmation = await runServerActionResult(confirmPendingOperation(pendingOperationId, intendedAccountId))
    if (!confirmation.ok) {
      return { ok: false, error: getFriendlyErrorMessage(confirmation.error, t, 'chat.sendError', 'generic') }
    }

    const execution = await runServerActionResult(executePendingOperation(
      pendingOperationId,
      confirmation.data.confirmationToken,
      intendedAccountId,
    ))

    if (!execution.ok) {
      return { ok: false, error: getFriendlyErrorMessage(execution.error, t, 'chat.sendError', 'generic') }
    }

    await onExecuted(execution.data)
    return { ok: true, response: execution.data }
    } catch (error) {
      return accountRefusalResult(error, t)
    }
  }, [onExecuted, t])

  const prepareStepUpForBubble = useCallback(
    async (pendingOperationId: string) => {
      try {
      const intendedAccountId = accountIntentWithOrigin(getHeldAccountId())
      const confirmation = await runServerActionResult(confirmPendingOperation(pendingOperationId, intendedAccountId))
      if (!confirmation.ok) {
        return { ok: false as const, error: getFriendlyErrorMessage(confirmation.error, t, 'chat.sendError', 'generic') }
      }

      const challenge = await runServerActionResult(issuePendingOperationStepUp(pendingOperationId, locale, intendedAccountId))
      if (!challenge.ok) {
        return { ok: false as const, error: getFriendlyErrorMessage(challenge.error, t, 'chat.sendError', 'generic') }
      }

      return {
        ok: true as const,
        challengeId: challenge.data.challengeId,
        confirmationToken: confirmation.data.confirmationToken,
      }
      } catch (error) {
        return accountRefusalResult(error, t)
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
      try {
      const intendedAccountId = accountIntentWithOrigin(getHeldAccountId())
      const verification = await runServerActionResult(verifyPendingOperationStepUp(
        pendingOperationId,
        challengeId,
        code,
        intendedAccountId,
      ))

      if (!verification.ok) {
        return { ok: false as const, error: getFriendlyErrorMessage(verification.error, t, 'chat.sendError', 'generic') }
      }

      const execution = await runServerActionResult(executePendingOperation(pendingOperationId, confirmationToken, intendedAccountId))
      if (!execution.ok) {
        return { ok: false as const, error: getFriendlyErrorMessage(execution.error, t, 'chat.sendError', 'generic') }
      }

      await onExecuted(execution.data)
      return { ok: true as const, response: execution.data }
      } catch (error) {
        return accountRefusalResult(error, t)
      }
    },
    [onExecuted, t],
  )

  return {
    confirmAndExecutePendingOperation,
    prepareStepUpForBubble,
    verifyStepUpForBubble,
  }
}
