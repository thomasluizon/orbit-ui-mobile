import { useCallback } from "react"
import type { AgentExecuteOperationResponse } from "@orbit/shared/types"
import { invalidateAgentQueries } from "@orbit/shared/hooks"
import { usePendingOperationExecution } from "@/hooks/use-pending-operation-execution"
import type { useChatComposerState } from './use-chat-composer-state'

type ChatPendingBubblesInputs = Pick<ReturnType<typeof useChatComposerState>, 'queryClient'>

export function useChatPendingBubbles({ queryClient }: ChatPendingBubblesInputs) {
  const handleExecutedOperation = useCallback(
    async (response: AgentExecuteOperationResponse) => {
      if (response.operation.status === "Succeeded") {
        await invalidateAgentQueries(queryClient)
      }
    },
    [queryClient],
  )
  return { handleExecutedOperation }
}

type ChatPendingBubbleActionsInputs = Pick<ReturnType<typeof useChatPendingBubbles>, 'handleExecutedOperation'>

export function useChatPendingBubbleActions({ handleExecutedOperation }: ChatPendingBubbleActionsInputs) {
  const {
    revisePendingOperationForBubble,
    refreshPendingOperationForBubble,
    isPendingOperationBusy,
    trackCardOperation,
    confirmAndExecutePendingOperation,
    prepareStepUpForBubble,
    verifyStepUpForBubble,
  } = usePendingOperationExecution({ handleExecutedOperation })
  return { revisePendingOperationForBubble, refreshPendingOperationForBubble, isPendingOperationBusy, trackCardOperation, confirmAndExecutePendingOperation, prepareStepUpForBubble, verifyStepUpForBubble }
}
