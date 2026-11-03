'use client'

import { useCallback,useEffect } from 'react'
import type { AgentExecuteOperationResponse } from '@orbit/shared/types/ai'
import { invalidateAgentQueries } from '@orbit/shared/hooks'
import { useChatPendingOperations } from '@/hooks/use-chat-pending-operations'
import { blockDesktopWebReload } from '@/lib/web-reload-state'
import type { ChatComposerState } from './use-chat-composer-state'
import type { useChatComposerAttachments } from './use-chat-composer-attachments'

type ChatPendingBubblesInputs = Pick<ChatComposerState, 'queryClient' | 'isRecording' | 'isTranscribing' | 'lastFailedSend' | 'queuedPrompts'> & Pick<ReturnType<typeof useChatComposerAttachments>, 'selectedImage' | 'selectedTextFile'>

export function useChatPendingBubbles(queryClient: ChatPendingBubblesInputs['queryClient'], isRecording: ChatPendingBubblesInputs['isRecording'], isTranscribing: ChatPendingBubblesInputs['isTranscribing'], selectedImage: ChatPendingBubblesInputs['selectedImage'], selectedTextFile: ChatPendingBubblesInputs['selectedTextFile'], lastFailedSend: ChatPendingBubblesInputs['lastFailedSend'], queuedPrompts: ChatPendingBubblesInputs['queuedPrompts']) {
  const handleExecutedOperation = useCallback(async (response: AgentExecuteOperationResponse) => {
    if (response.operation.status === 'Succeeded') {
      await invalidateAgentQueries(queryClient)
    }
  }, [queryClient])

  const {
    revisePendingOperationForBubble,
    refreshPendingOperationForBubble,
    isPendingOperationBusy,
    trackCardOperation,
    confirmAndExecutePendingOperation,
    prepareStepUpForBubble,
    verifyStepUpForBubble,
  } = useChatPendingOperations(handleExecutedOperation)

  useEffect(() => {
    if (isRecording || isTranscribing || selectedImage || selectedTextFile || lastFailedSend || isPendingOperationBusy || queuedPrompts.length > 0) return blockDesktopWebReload()
  }, [isRecording, isTranscribing, selectedImage, selectedTextFile, lastFailedSend, isPendingOperationBusy, queuedPrompts.length])
  return { revisePendingOperationForBubble, refreshPendingOperationForBubble, isPendingOperationBusy, trackCardOperation, confirmAndExecutePendingOperation, prepareStepUpForBubble, verifyStepUpForBubble }
}
