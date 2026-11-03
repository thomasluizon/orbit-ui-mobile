import { getAccountGeneration } from '@/lib/session-epoch'
import { useChatStore } from '@/stores/chat-store'
import type { useTranslation } from "react-i18next"
import { API } from "@orbit/shared/api"
import { reconcileChatPlanApproval, reconcileChatPlanExecution, reconcileChatPlanRevision, buildChatClientContext } from "@orbit/shared/chat"
import { pendingOperationRevisionResultSchema } from "@orbit/shared/types"
import type {
  AgentExecuteOperationResponse,
  AgentStepUpChallenge,
  PendingAgentOperationConfirmation,
  PendingOperationRevisionResult,
  RevisePendingOperationRequest,
} from "@orbit/shared/types"
import { ApiClientError, getFriendlyErrorMessage } from "@orbit/shared/utils"
import { apiClient } from "@/lib/api-client"

export type PendingExecutionResult =
  | { ok: true; response: AgentExecuteOperationResponse }
  | { ok: false; error: string; stale?: boolean }

export type PreparedStepUpExecution =
  | {
  ok: true
  challenge: AgentStepUpChallenge
  confirmationToken: string
  }
  | { ok: false; error: string; stale?: boolean }

interface UsePendingOperationExecutionOptions {
  handleExecutedOperation: (
  response: AgentExecuteOperationResponse,
  ) => Promise<void>
}


export function createPendingOperations(handleExecutedOperation: UsePendingOperationExecutionOptions['handleExecutedOperation'], t: ReturnType<typeof useTranslation>['t'], i18n: ReturnType<typeof useTranslation>['i18n'], getClientContext: () => ReturnType<typeof buildChatClientContext>, intendedGeneration: number) {
 const results=createPendingOperationResults(handleExecutedOperation,t,intendedGeneration)
 const challenge=createPendingStepUpChallenge(getClientContext,i18n,results,intendedGeneration)
 const execution=createPendingStepUpExecution(getClientContext,results,intendedGeneration)
 return { ...createPendingBubbleRevisions(getClientContext,results,intendedGeneration), ...createPendingBubbleExecution(getClientContext,results,intendedGeneration), ...createPendingBubbleStepUp(challenge.preparePendingOperationStepUp,execution.verifyAndExecutePendingOperationStepUp) }
}

function createPendingOperationResults(handleExecutedOperation: UsePendingOperationExecutionOptions['handleExecutedOperation'], t: ReturnType<typeof useTranslation>['t'], intendedGeneration: number) {
  const accountChangedResult = () => ({ ok: false as const, error: t('errors.api.accountChanged') })
  const pendingOperationFailure = (error: unknown) => intendedGeneration !== getAccountGeneration() ? accountChangedResult() : ({
    ok: false as const,
    error: getFriendlyErrorMessage(error, t, 'chat.sendError', 'generic'),
    stale: error instanceof ApiClientError && (error.status === 409 || error.status === 404),
  })
  const revisionResult = (id: string, accountGeneration: number, result: PendingOperationRevisionResult) => {
    if (accountGeneration !== getAccountGeneration()) return accountChangedResult()
    reconcileChatPlanRevision(useChatStore.getState(), id, result)
    return { ok: true as const, result }
  }
  const executionResult = async (id: string, accountGeneration: number, execution: AgentExecuteOperationResponse): Promise<PendingExecutionResult> => {
    if (accountGeneration !== getAccountGeneration()) return accountChangedResult()
    reconcileChatPlanExecution(useChatStore.getState(), id, execution)
    await handleExecutedOperation(execution)
    if (accountGeneration !== getAccountGeneration()) return accountChangedResult()
    return { ok: true, response: execution }
  }
  return { accountChangedResult, pendingOperationFailure, revisionResult, executionResult }
}

function createPendingBubbleRevisions(getClientContext: () => ReturnType<typeof buildChatClientContext>, { accountChangedResult, pendingOperationFailure, revisionResult }: ReturnType<typeof createPendingOperationResults>, intendedGeneration: number) {
  const revisePendingOperationForBubble = async (id: string, request: RevisePendingOperationRequest) => {
    const accountGeneration = intendedGeneration
    if (accountGeneration !== getAccountGeneration()) return accountChangedResult()
    try {
      const result = await apiClient<PendingOperationRevisionResult>(API.ai.pendingOperationRevise(id), {
        method: 'POST',
        body: JSON.stringify({ ...request, clientContext: getClientContext() }),
      }, pendingOperationRevisionResultSchema)
      return revisionResult(id, accountGeneration, result)
    }
    catch (error: unknown) {
      return pendingOperationFailure(error)
    }
  }
  const refreshPendingOperationForBubble = async (id: string) => {
    const accountGeneration = intendedGeneration
    if (accountGeneration !== getAccountGeneration()) return accountChangedResult()
    try {
      const result = await apiClient<PendingOperationRevisionResult>(`${API.ai.pendingOperationRefresh(id)}?${new URLSearchParams({ clientContext: JSON.stringify(getClientContext()) }).toString()}`, {
        method: 'POST',
      }, pendingOperationRevisionResultSchema)
      return revisionResult(id, accountGeneration, result)
    }
    catch (error: unknown) {
      return pendingOperationFailure(error)
    }
  }
  return { revisePendingOperationForBubble, refreshPendingOperationForBubble }
}

function createPendingBubbleExecution(getClientContext: () => ReturnType<typeof buildChatClientContext>, { accountChangedResult, pendingOperationFailure, executionResult }: ReturnType<typeof createPendingOperationResults>, intendedGeneration: number) {
  const confirmAndExecutePendingOperation = async (pendingOperationId: string): Promise<PendingExecutionResult> => {
    const accountGeneration = intendedGeneration
    if (accountGeneration !== getAccountGeneration()) return accountChangedResult()
    try {
      const confirmation = await apiClient<PendingAgentOperationConfirmation>(`${API.ai.pendingOperationConfirm(pendingOperationId)}?${new URLSearchParams({ clientContext: JSON.stringify(getClientContext()) }).toString()}`, {
        method: "POST",
      })
      if (accountGeneration !== getAccountGeneration()) return accountChangedResult()
      reconcileChatPlanApproval(useChatStore.getState(), pendingOperationId, 'running', confirmation.plan)
      const execution = await apiClient<AgentExecuteOperationResponse>(API.ai.pendingOperationExecute(pendingOperationId), {
        method: "POST",
        body: JSON.stringify({
          confirmationToken: confirmation.confirmationToken,
          clientContext: getClientContext(),
        }),
      })
      return await executionResult(pendingOperationId, accountGeneration, execution)
    }
    catch (error: unknown) {
      return pendingOperationFailure(error)
    }
  }
  return { confirmAndExecutePendingOperation }
}

function createPendingStepUpChallenge(getClientContext: () => ReturnType<typeof buildChatClientContext>, i18n: ReturnType<typeof useTranslation>['i18n'], { accountChangedResult, pendingOperationFailure }: ReturnType<typeof createPendingOperationResults>, intendedGeneration: number) {
  const preparePendingOperationStepUp = async (pendingOperationId: string): Promise<PreparedStepUpExecution> => {
    const accountGeneration = intendedGeneration
    if (accountGeneration !== getAccountGeneration()) return accountChangedResult()
    try {
      const confirmation = await apiClient<PendingAgentOperationConfirmation>(`${API.ai.pendingOperationConfirm(pendingOperationId)}?${new URLSearchParams({ clientContext: JSON.stringify(getClientContext()) }).toString()}`, {
        method: "POST",
      })
      if (accountGeneration !== getAccountGeneration()) return accountChangedResult()
      reconcileChatPlanApproval(useChatStore.getState(), pendingOperationId, 'running', confirmation.plan)
      const challenge = await apiClient<AgentStepUpChallenge>(API.ai.pendingOperationStepUp(pendingOperationId), {
        method: "POST",
        body: JSON.stringify({ language: i18n.language }),
      })
      if (accountGeneration !== getAccountGeneration()) return accountChangedResult()
      return {
        ok: true,
        challenge,
        confirmationToken: confirmation.confirmationToken,
      }
    }
    catch (error: unknown) {
      return pendingOperationFailure(error)
    }
  }
  return { preparePendingOperationStepUp }
}

function createPendingStepUpExecution(getClientContext: () => ReturnType<typeof buildChatClientContext>, { accountChangedResult, pendingOperationFailure, executionResult }: ReturnType<typeof createPendingOperationResults>, intendedGeneration: number) {
  const verifyAndExecutePendingOperationStepUp = async (pendingOperationId: string, challengeId: string, code: string, confirmationToken: string): Promise<PendingExecutionResult> => {
    const accountGeneration = intendedGeneration
    if (accountGeneration !== getAccountGeneration()) return accountChangedResult()
    try {
      await apiClient<{
        id: string
      } | null>(API.ai.pendingOperationVerifyStepUp(pendingOperationId), {
        method: "POST",
        body: JSON.stringify({ challengeId, code }),
      })
      if (accountGeneration !== getAccountGeneration()) return accountChangedResult()
      const execution = await apiClient<AgentExecuteOperationResponse>(API.ai.pendingOperationExecute(pendingOperationId), {
        method: "POST",
        body: JSON.stringify({ confirmationToken, clientContext: getClientContext() }),
      })
      return await executionResult(pendingOperationId, accountGeneration, execution)
    }
    catch (error: unknown) {
      return pendingOperationFailure(error)
    }
  }
  return { verifyAndExecutePendingOperationStepUp }
}

function createPendingBubbleStepUp(preparePendingOperationStepUp: ReturnType<typeof createPendingStepUpChallenge>['preparePendingOperationStepUp'], verifyAndExecutePendingOperationStepUp: ReturnType<typeof createPendingStepUpExecution>['verifyAndExecutePendingOperationStepUp']) {
  const prepareStepUpForBubble = async (pendingOperationId: string) => {
    const result = await preparePendingOperationStepUp(pendingOperationId)
    if (!result.ok) {
      return { ok: false as const, error: result.error, stale: result.stale }
    }
    return {
      ok: true as const,
      challengeId: result.challenge.challengeId,
      confirmationToken: result.confirmationToken,
    }
  }
  const verifyStepUpForBubble = async (pendingOperationId: string, challengeId: string, code: string, confirmationToken: string) => {
    const result = await verifyAndExecutePendingOperationStepUp(pendingOperationId, challengeId, code, confirmationToken)
    return result.ok
      ? { ok: true as const, response: result.response }
      : { ok: false as const, error: result.error, stale: result.stale }
  }
  return { prepareStepUpForBubble, verifyStepUpForBubble }
}
