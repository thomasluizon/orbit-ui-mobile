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
import { getAccountGeneration } from '@/lib/session-epoch'

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

function accountChanged(id: string | null, generation: number): boolean {
  return getHeldAccountId() !== id || getAccountGeneration() !== generation
}

function accountChangedResult(t: ReturnType<typeof useTranslations>) {
  return { ok: false as const, error: t('errors.api.accountChanged') }
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
    const accountGeneration = getAccountGeneration()
    const confirmation = await confirmPendingOperation(pendingOperationId, intendedAccountId)
    if (accountChanged(intendedAccountId, accountGeneration)) return accountChangedResult(t)
    await applyServerActionFailure(confirmation)
    if (accountChanged(intendedAccountId, accountGeneration)) return accountChangedResult(t)
    if (!confirmation.ok) {
      return { ok: false, error: pendingOperationError(confirmation, t) }
    }

    const execution = await executePendingOperation(
      pendingOperationId,
      confirmation.data.confirmationToken,
      intendedAccountId,
    )
    if (accountChanged(intendedAccountId, accountGeneration)) return accountChangedResult(t)
    await applyServerActionFailure(execution)
    if (accountChanged(intendedAccountId, accountGeneration)) return accountChangedResult(t)

    if (!execution.ok) {
      return { ok: false, error: pendingOperationError(execution, t) }
    }

    await onExecuted(execution.data)
    return { ok: true, response: execution.data }
  }, [onExecuted, t])

  const prepareStepUpForBubble = useCallback(
    async (pendingOperationId: string) => {
      const intendedAccountId = getHeldAccountId()
      const accountGeneration = getAccountGeneration()
      const confirmation = await confirmPendingOperation(pendingOperationId, intendedAccountId)
      if (accountChanged(intendedAccountId, accountGeneration)) return accountChangedResult(t)
      await applyServerActionFailure(confirmation)
      if (accountChanged(intendedAccountId, accountGeneration)) return accountChangedResult(t)
      if (!confirmation.ok) {
        return { ok: false as const, error: pendingOperationError(confirmation, t) }
      }

      const challenge = await issuePendingOperationStepUp(pendingOperationId, locale, intendedAccountId)
      if (accountChanged(intendedAccountId, accountGeneration)) return accountChangedResult(t)
      await applyServerActionFailure(challenge)
      if (accountChanged(intendedAccountId, accountGeneration)) return accountChangedResult(t)
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
      const accountGeneration = getAccountGeneration()
      const verification = await verifyPendingOperationStepUp(
        pendingOperationId,
        challengeId,
        code,
        intendedAccountId,
      )
      if (accountChanged(intendedAccountId, accountGeneration)) return accountChangedResult(t)
      await applyServerActionFailure(verification)
      if (accountChanged(intendedAccountId, accountGeneration)) return accountChangedResult(t)

      if (!verification.ok) {
        return { ok: false as const, error: pendingOperationError(verification, t) }
      }

      const execution = await executePendingOperation(
        pendingOperationId,
        confirmationToken,
        intendedAccountId,
      )
      if (accountChanged(intendedAccountId, accountGeneration)) return accountChangedResult(t)
      await applyServerActionFailure(execution)
      if (accountChanged(intendedAccountId, accountGeneration)) return accountChangedResult(t)
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
