import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { API } from "@orbit/shared/api";
import type {
  AgentExecuteOperationResponse,
  AgentStepUpChallenge,
  PendingAgentOperationConfirmation,
  PendingOperationRevisionResult,
  RevisePendingOperationRequest,
} from "@orbit/shared/types";
import { ApiClientError, getFriendlyErrorMessage } from "@orbit/shared/utils";
import { apiClient } from "@/lib/api-client";

export type PendingExecutionResult =
  | { ok: true; response: AgentExecuteOperationResponse }
  | { ok: false; error: string; stale?: boolean };

export type PreparedStepUpExecution =
  | {
      ok: true;
      challenge: AgentStepUpChallenge;
      confirmationToken: string;
    }
  | { ok: false; error: string; stale?: boolean };

interface UsePendingOperationExecutionOptions {
  handleExecutedOperation: (
    response: AgentExecuteOperationResponse,
  ) => Promise<void>;
}

/**
 * Wraps the agent pending-operation confirm/step-up/execute API calls used by
 * the chat composer. Each call returns a discriminated `ok` result and
 * invalidates affected queries through the injected completion callback.
 */
export function usePendingOperationExecution({
  handleExecutedOperation,
}: UsePendingOperationExecutionOptions) {
  const { t, i18n } = useTranslation();
  const [batchCount, setBatchCount] = useState(0);
  const trackBatch = useCallback(async <Result,>(operation: () => Promise<Result>) => {
    setBatchCount((count) => count + 1);
    try { return await operation(); }
    finally { setBatchCount((count) => count - 1); }
  }, []);

  const revisePendingOperationForBubble = useCallback(async (id: string, request: RevisePendingOperationRequest) => {
    try {
      const result = await apiClient<PendingOperationRevisionResult>(API.ai.pendingOperationRevise(id), {
        method: 'POST',
        body: JSON.stringify(request),
      });
      return { ok: true as const, result };
    } catch (error: unknown) {
      return {
        ok: false as const,
        error: getFriendlyErrorMessage(error, t, 'chat.sendError', 'generic'),
        stale: error instanceof ApiClientError && error.status === 409,
      };
    }
  }, [t]);

  const refreshPendingOperationForBubble = useCallback(async (id: string) => {
    try {
      const result = await apiClient<PendingOperationRevisionResult>(API.ai.pendingOperationRefresh(id), {
        method: 'POST',
      });
      return { ok: true as const, result };
    } catch (error: unknown) {
      return {
        ok: false as const,
        error: getFriendlyErrorMessage(error, t, 'chat.sendError', 'generic'),
        stale: error instanceof ApiClientError && error.status === 409,
      };
    }
  }, [t]);

  const confirmAndExecutePendingOperation = useCallback(
    async (pendingOperationId: string): Promise<PendingExecutionResult> => {
      try {
        const confirmation = await apiClient<PendingAgentOperationConfirmation>(
          API.ai.pendingOperationConfirm(pendingOperationId),
          {
            method: "POST",
          },
        );

        const execution = await apiClient<AgentExecuteOperationResponse>(
          API.ai.pendingOperationExecute(pendingOperationId),
          {
            method: "POST",
            body: JSON.stringify({
              confirmationToken: confirmation.confirmationToken,
            }),
          },
        );

        await handleExecutedOperation(execution);
        return { ok: true, response: execution };
      } catch (error: unknown) {
        return { ok: false, error: getFriendlyErrorMessage(error, t, "chat.sendError", "generic"), stale: error instanceof ApiClientError && error.status === 409 };
      }
    },
    [handleExecutedOperation, t],
  );

  const preparePendingOperationStepUp = useCallback(
    async (pendingOperationId: string): Promise<PreparedStepUpExecution> => {
      try {
        const confirmation = await apiClient<PendingAgentOperationConfirmation>(
          API.ai.pendingOperationConfirm(pendingOperationId),
          {
            method: "POST",
          },
        );

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
        return { ok: false, error: getFriendlyErrorMessage(error, t, "chat.sendError", "generic"), stale: error instanceof ApiClientError && error.status === 409 };
      }
    },
    [i18n.language, t],
  );

  const verifyAndExecutePendingOperationStepUp = useCallback(
    async (
      pendingOperationId: string,
      challengeId: string,
      code: string,
      confirmationToken: string,
    ): Promise<PendingExecutionResult> => {
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
            body: JSON.stringify({ confirmationToken }),
          },
        );

        await handleExecutedOperation(execution);
        return { ok: true, response: execution };
      } catch (error: unknown) {
        return { ok: false, error: getFriendlyErrorMessage(error, t, "chat.sendError", "generic"), stale: error instanceof ApiClientError && error.status === 409 };
      }
    },
    [handleExecutedOperation, t],
  );

  const prepareStepUpForBubble = useCallback(
    async (pendingOperationId: string) => {
      const result = await preparePendingOperationStepUp(pendingOperationId);
      if (!result.ok) {
        return { ok: false as const, error: result.error, stale: result.stale };
      }
      return {
        ok: true as const,
        challengeId: result.challenge.challengeId,
        confirmationToken: result.confirmationToken,
      };
    },
    [preparePendingOperationStepUp],
  );

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
      );
      return result.ok
        ? { ok: true as const, response: result.response }
        : { ok: false as const, error: result.error, stale: result.stale };
    },
    [verifyAndExecutePendingOperationStepUp],
  );

  const trackedExecute = useCallback((...args: Parameters<typeof confirmAndExecutePendingOperation>) =>
    trackBatch(() => confirmAndExecutePendingOperation(...args)), [confirmAndExecutePendingOperation, trackBatch]);
  const trackedPrepare = useCallback((...args: Parameters<typeof prepareStepUpForBubble>) =>
    trackBatch(() => prepareStepUpForBubble(...args)), [prepareStepUpForBubble, trackBatch]);
  const trackedVerify = useCallback((...args: Parameters<typeof verifyStepUpForBubble>) =>
    trackBatch(() => verifyStepUpForBubble(...args)), [verifyStepUpForBubble, trackBatch]);

  return {
    isPendingOperationBusy: batchCount > 0,
    revisePendingOperationForBubble,
    refreshPendingOperationForBubble,
    confirmAndExecutePendingOperation: trackedExecute,
    prepareStepUpForBubble: trackedPrepare,
    verifyStepUpForBubble: trackedVerify,
  };
}
