import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { API } from "@orbit/shared/api";
import type {
  AgentExecuteOperationResponse,
  AgentStepUpChallenge,
  PendingAgentOperationConfirmation,
} from "@orbit/shared/types";
import { getFriendlyErrorMessage } from "@orbit/shared/utils";
import { apiClient } from "@/lib/api-client";

export type PendingExecutionResult =
  | { ok: true; response: AgentExecuteOperationResponse }
  | { ok: false; error: string };

export type PreparedStepUpExecution =
  | {
      ok: true;
      challenge: AgentStepUpChallenge;
      confirmationToken: string;
    }
  | { ok: false; error: string };

interface UsePendingOperationExecutionOptions {
  appendExecutionMessage: (
    response: AgentExecuteOperationResponse,
  ) => Promise<void>;
}

/**
 * Wraps the agent pending-operation confirm/step-up/execute API calls used by
 * the chat composer. Each call returns a discriminated `ok` result and appends
 * the resulting agent message via the injected `appendExecutionMessage`.
 */
export function usePendingOperationExecution({
  appendExecutionMessage,
}: UsePendingOperationExecutionOptions) {
  const { t, i18n } = useTranslation();

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

        await appendExecutionMessage(execution);
        return { ok: true, response: execution };
      } catch (error: unknown) {
        return { ok: false, error: getFriendlyErrorMessage(error, t, "chat.sendError", "generic") };
      }
    },
    [appendExecutionMessage, t],
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
        return { ok: false, error: getFriendlyErrorMessage(error, t, "chat.sendError", "generic") };
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

        await appendExecutionMessage(execution);
        return { ok: true, response: execution };
      } catch (error: unknown) {
        return { ok: false, error: getFriendlyErrorMessage(error, t, "chat.sendError", "generic") };
      }
    },
    [appendExecutionMessage, t],
  );

  const prepareStepUpForBubble = useCallback(
    async (pendingOperationId: string) => {
      const result = await preparePendingOperationStepUp(pendingOperationId);
      if (!result.ok) {
        return { ok: false as const, error: result.error };
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
        : { ok: false as const, error: result.error };
    },
    [verifyAndExecutePendingOperationStepUp],
  );

  return {
    confirmAndExecutePendingOperation,
    prepareStepUpForBubble,
    verifyStepUpForBubble,
  };
}
