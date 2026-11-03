import { getAccountGeneration } from '@/lib/session-epoch'
import { useChatStore } from '@/stores/chat-store'
import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
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

/**
 * Wraps the agent pending-operation confirm/step-up/execute API calls used by
 * the chat composer. Each call returns a discriminated `ok` result and
 * invalidates affected queries through the injected completion callback.
 */
export function usePendingOperationExecution({
  handleExecutedOperation,
}: UsePendingOperationExecutionOptions) {
  const { t, i18n } = useTranslation()
  const getClientContext = useCallback(() => buildChatClientContext({ platform: 'mobile', locale: i18n.language, conversationId: useChatStore.getState().conversationId ?? undefined }), [i18n.language])
  const [batchCount, setBatchCount] = useState(0)
  const trackBatch = useCallback(async <Result,>(operation: () => Promise<Result>) => {
    setBatchCount((count) => count + 1)
    try { return await operation() }
    finally { setBatchCount((count) => count - 1) }
  }, [])
  const results = usePendingOperationResults(handleExecutedOperation, t)
  const { revisePendingOperationForBubble, refreshPendingOperationForBubble } = usePendingBubbleRevisions(getClientContext, results)
  const { confirmAndExecutePendingOperation } = usePendingBubbleExecution(getClientContext, results)
  const { preparePendingOperationStepUp } = usePendingStepUpChallenge(getClientContext, i18n, results)
  const { verifyAndExecutePendingOperationStepUp } = usePendingStepUpExecution(getClientContext, results)
  const { prepareStepUpForBubble, verifyStepUpForBubble } = usePendingBubbleStepUp(preparePendingOperationStepUp, verifyAndExecutePendingOperationStepUp)

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


function usePendingOperationResults(handleExecutedOperation: UsePendingOperationExecutionOptions['handleExecutedOperation'], t: ReturnType<typeof useTranslation>['t']) {
  const pendingOperationFailure = useCallback((error: unknown) => ({
    ok: false as const,
    error: getFriendlyErrorMessage(error, t, 'chat.sendError', 'generic'),
    stale: error instanceof ApiClientError && (error.status === 409 || error.status === 404),
  }), [t]);

  const revisionResult = useCallback((id: string, accountGeneration: number, result: PendingOperationRevisionResult) => {
    if (accountGeneration === getAccountGeneration()) {
      reconcileChatPlanRevision(useChatStore.getState(), id, result);
    }
    return { ok: true as const, result };
  }, []);

  const executionResult = useCallback(async (
    id: string, accountGeneration: number, execution: AgentExecuteOperationResponse,
  ): Promise<PendingExecutionResult> => {
    if (accountGeneration === getAccountGeneration()) {
      reconcileChatPlanExecution(useChatStore.getState(), id, execution);
    }
    await handleExecutedOperation(execution);
    return { ok: true, response: execution };
  }, [handleExecutedOperation]);

  return { pendingOperationFailure, revisionResult, executionResult }
}

function usePendingBubbleRevisions(getClientContext: () => ReturnType<typeof buildChatClientContext>, { pendingOperationFailure, revisionResult }: ReturnType<typeof usePendingOperationResults>) {
  const revisePendingOperationForBubble = useCallback(async (id: string, request: RevisePendingOperationRequest) => {
    const accountGeneration = getAccountGeneration();
    try {
      const result = await apiClient<PendingOperationRevisionResult>(API.ai.pendingOperationRevise(id), {
        method: 'POST',
        body: JSON.stringify({ ...request, clientContext: getClientContext() }),
      }, pendingOperationRevisionResultSchema);
      return revisionResult(id, accountGeneration, result);
    } catch (error: unknown) {
      return pendingOperationFailure(error);
    }
  }, [getClientContext, pendingOperationFailure, revisionResult]);

  const refreshPendingOperationForBubble = useCallback(async (id: string) => {
    const accountGeneration = getAccountGeneration();
    try {
      const result = await apiClient<PendingOperationRevisionResult>(`${API.ai.pendingOperationRefresh(id)}?${new URLSearchParams({ clientContext: JSON.stringify(getClientContext()) }).toString()}`, {
        method: 'POST',
      }, pendingOperationRevisionResultSchema);
      return revisionResult(id, accountGeneration, result);
    } catch (error: unknown) {
      return pendingOperationFailure(error);
    }
  }, [getClientContext, pendingOperationFailure, revisionResult]);

  return { revisePendingOperationForBubble, refreshPendingOperationForBubble }
}

function usePendingBubbleExecution(getClientContext: () => ReturnType<typeof buildChatClientContext>, { pendingOperationFailure, executionResult }: ReturnType<typeof usePendingOperationResults>) {
  const confirmAndExecutePendingOperation = useCallback(
    async (pendingOperationId: string): Promise<PendingExecutionResult> => {
      const accountGeneration = getAccountGeneration();
      try {
        const confirmation = await apiClient<PendingAgentOperationConfirmation>(
          `${API.ai.pendingOperationConfirm(pendingOperationId)}?${new URLSearchParams({ clientContext: JSON.stringify(getClientContext()) }).toString()}`,
          {
            method: "POST",
          },
        );

        if (accountGeneration === getAccountGeneration()) reconcileChatPlanApproval(useChatStore.getState(), pendingOperationId, 'running', confirmation.plan);

        const execution = await apiClient<AgentExecuteOperationResponse>(
          API.ai.pendingOperationExecute(pendingOperationId),
          {
            method: "POST",
            body: JSON.stringify({
              confirmationToken: confirmation.confirmationToken,
              clientContext: getClientContext(),
            }),
          },
        );

        return await executionResult(pendingOperationId, accountGeneration, execution);
      } catch (error: unknown) {
        return pendingOperationFailure(error);
      }
    },
    [executionResult, getClientContext, pendingOperationFailure],
  );

  return { confirmAndExecutePendingOperation }
}

function usePendingStepUpChallenge(getClientContext: () => ReturnType<typeof buildChatClientContext>, i18n: ReturnType<typeof useTranslation>['i18n'], { pendingOperationFailure }: ReturnType<typeof usePendingOperationResults>) {
  const preparePendingOperationStepUp = useCallback(
    async (pendingOperationId: string): Promise<PreparedStepUpExecution> => {
      const accountGeneration = getAccountGeneration();
      try {
        const confirmation = await apiClient<PendingAgentOperationConfirmation>(
          `${API.ai.pendingOperationConfirm(pendingOperationId)}?${new URLSearchParams({ clientContext: JSON.stringify(getClientContext()) }).toString()}`,
          {
            method: "POST",
          },
        );

        if (accountGeneration === getAccountGeneration()) reconcileChatPlanApproval(useChatStore.getState(), pendingOperationId, 'running', confirmation.plan);

        const challenge = await apiClient<AgentStepUpChallenge>(
          API.ai.pendingOperationStepUp(pendingOperationId),
          {
            method: "POST",
            body: JSON.stringify({ language: i18n.language }),
          },
        );

        return {
          ok: true,
          challenge,
          confirmationToken: confirmation.confirmationToken,
        };
      } catch (error: unknown) {
        return pendingOperationFailure(error);
      }
    },
    [getClientContext, i18n.language, pendingOperationFailure],
  );

  return { preparePendingOperationStepUp }
}

function usePendingStepUpExecution(getClientContext: () => ReturnType<typeof buildChatClientContext>, { pendingOperationFailure, executionResult }: ReturnType<typeof usePendingOperationResults>) {
  const verifyAndExecutePendingOperationStepUp = useCallback(
    async (
      pendingOperationId: string,
      challengeId: string,
      code: string,
      confirmationToken: string,
    ): Promise<PendingExecutionResult> => {
      const accountGeneration = getAccountGeneration();
      try {
        await apiClient<{ id: string } | null>(
          API.ai.pendingOperationVerifyStepUp(pendingOperationId),
          {
            method: "POST",
            body: JSON.stringify({ challengeId, code }),
          },
        );

        const execution = await apiClient<AgentExecuteOperationResponse>(
          API.ai.pendingOperationExecute(pendingOperationId),
          {
            method: "POST",
            body: JSON.stringify({ confirmationToken, clientContext: getClientContext() }),
          },
        );

        return await executionResult(pendingOperationId, accountGeneration, execution);
      } catch (error: unknown) {
        return pendingOperationFailure(error);
      }
    },
    [executionResult, getClientContext, pendingOperationFailure],
  );

  return { verifyAndExecutePendingOperationStepUp }
}

function usePendingBubbleStepUp(preparePendingOperationStepUp: ReturnType<typeof usePendingStepUpChallenge>['preparePendingOperationStepUp'], verifyAndExecutePendingOperationStepUp: ReturnType<typeof usePendingStepUpExecution>['verifyAndExecutePendingOperationStepUp']) {
  const prepareStepUpForBubble = useCallback(
    async (pendingOperationId: string) => {
      const result = await preparePendingOperationStepUp(pendingOperationId)
      if (!result.ok) {
        return { ok: false as const, error: result.error, stale: result.stale }
      }
      return {
        ok: true as const,
        challengeId: result.challenge.challengeId,
        confirmationToken: result.confirmationToken,
      }
    },
    [preparePendingOperationStepUp],
  )

  const verifyStepUpForBubble = useCallback(
    async (
      pendingOperationId: string,
      challengeId: string,
      code: string,
      confirmationToken: string,
    ) => {
      const result = await verifyAndExecutePendingOperationStepUp(
        pendingOperationId,
        challengeId,
        code,
        confirmationToken,
      )
      return result.ok
        ? { ok: true as const, response: result.response }
        : { ok: false as const, error: result.error, stale: result.stale }
    },
    [verifyAndExecutePendingOperationStepUp],
  )
  return { prepareStepUpForBubble, verifyStepUpForBubble }
}
