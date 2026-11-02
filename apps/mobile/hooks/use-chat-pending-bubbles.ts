import { useCallback } from "react"
import type { AgentExecuteOperationResponse } from "@orbit/shared/types"
import { invalidateAgentQueries } from "@orbit/shared/hooks"
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
