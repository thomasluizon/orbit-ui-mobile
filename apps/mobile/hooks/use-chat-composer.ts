import type { UseChatComposerOptions } from './use-chat-composer-types'
import { useChatComposerState, useChatComposerSession, useChatComposerAvailability, useChatDraftPersistence, useChatComposerScroll, useChatComposerSuggestions, useChatComposerProps } from './use-chat-composer-state'
import { useChatComposerAttachments } from './use-chat-composer-attachments'
import { useChatPendingBubbles } from './use-chat-pending-bubbles'
import { usePendingOperationExecution } from './use-pending-operation-execution'
import { useChatSendFailure, useChatResponseSettlement, useChatRequestPayload, useChatStream, useChatSendQueue, useChatSendMessage, useChatSendRetry, useChatBreakdownRefresh } from './use-chat-send-stream'

/**
 * Mobile chat-composer hook. Wraps the framework-agnostic
 * `@orbit/shared/hooks` core with React Native state and direct `apiClient`
 * I/O, mirroring the web `useChatComposer`. Offline gating is injected because
 * the offline UI itself lives on the screen.
 */
export function useChatComposer({ isOnline, offlineTitle, pathname = "/", selectedDate, today: currentDate, totalHabitCount, includeGeneral }: UseChatComposerOptions) {
  const parameters = { isOnline, offlineTitle, pathname, selectedDate, currentDate, totalHabitCount, includeGeneral }
  const chatComposerState = useChatComposerState({ ...parameters })
  const chatComposerAttachments = useChatComposerAttachments({ ...chatComposerState })
  useChatComposerSession({ ...chatComposerState, ...chatComposerAttachments })
  const chatComposerAvailability = useChatComposerAvailability({ ...chatComposerState, ...chatComposerAttachments })
  useChatDraftPersistence({ ...chatComposerState })
  const chatComposerScroll = useChatComposerScroll({ ...chatComposerState })
  const chatPendingBubbles = useChatPendingBubbles({ ...chatComposerState })
  const chatSendFailure = useChatSendFailure({ ...chatComposerAttachments, ...chatComposerState, ...chatComposerScroll })
  const chatResponseSettlement = useChatResponseSettlement({ ...chatComposerState, ...chatComposerScroll })
  const chatRequestPayload = useChatRequestPayload({ ...chatComposerState })
  const chatStream = useChatStream({ ...chatComposerState, ...chatComposerScroll, ...chatRequestPayload, ...chatResponseSettlement })
  const chatSendQueue = useChatSendQueue({ ...chatComposerState, ...chatComposerScroll, ...chatStream, ...chatSendFailure, ...parameters, ...chatComposerAvailability, ...chatComposerAttachments })
  const chatSendMessage = useChatSendMessage({ ...chatComposerState, ...chatComposerAttachments, ...chatComposerAvailability, ...parameters, ...chatComposerScroll, ...chatSendQueue })
  const chatSendRetry = useChatSendRetry({ ...parameters, ...chatComposerAvailability, ...chatComposerState, ...chatSendQueue })
  const chatComposerSuggestions = useChatComposerSuggestions({ ...chatComposerState, ...parameters, ...chatSendMessage, ...chatComposerAvailability, ...chatSendRetry })
  const chatComposerProps = useChatComposerProps({ ...chatComposerState, ...parameters, ...chatComposerAvailability, ...chatComposerSuggestions, ...chatSendMessage, ...chatComposerAttachments, ...chatSendRetry })
  const chatPendingBubbleActions = usePendingOperationExecution(chatPendingBubbles)
  const chatBreakdownRefresh = useChatBreakdownRefresh({ ...chatComposerState })
  const { profile, isTyping, streamingMessageId, messages, input, isRecording, transcript, setInput, threadScroll, flatListRef, allowanceText, speechError, sendError, toggleRecording, isTranscribing, speechSupported, activeSteps } = chatComposerState
  const { selectedImage, selectedTextFile, imagePreview } = chatComposerAttachments
  const { atMessageLimit, dailyBudgetReached, isSending, aiMessagesLimit, aiMessagesUsed, hasProAccess, showSuggestions } = chatComposerAvailability
  const { scrollToBottom, recordingTime } = chatComposerScroll
  const { openFilePicker, removeImage } = chatComposerAttachments
  const { blockAnswerInteraction } = chatSendQueue
  const { sendMessage } = chatSendMessage
  const { canRetryLastSend, retryLastSend } = chatSendRetry
  const { composerProps } = chatComposerProps
  const { revisePendingOperationForBubble, refreshPendingOperationForBubble, isPendingOperationBusy, trackCardOperation, confirmAndExecutePendingOperation, prepareStepUpForBubble, verifyStepUpForBubble } = chatPendingBubbleActions
  const { handleBreakdownConfirmed } = chatBreakdownRefresh
  return {
    blockAnswerInteraction,
    activeSteps,
    canShowFollowUps: isOnline && !isSending && !atMessageLimit && profile != null,
    isOnline,
    flatListRef,
    threadScroll,
    messages,
    isTyping,
    isSending,
    streamingMessageId,
    sendError,
    input,
    setInput,
    selectedImage,
    selectedTextFile,
    imagePreview,
    composerProps,
    isRecording,
    isTranscribing,
    speechSupported,
    transcript,
    speechError,
    toggleRecording,
    recordingTime,
    hasProAccess,
    hasGoogleConnection: profile?.hasGoogleConnection ?? false,
    aiMessagesUsed,
    aiMessagesLimit,
    allowanceReason: allowanceText('shell.composer.limit.reason', { allowance: aiMessagesLimit }),
    atMessageLimit,
    dailyBudgetReached,
    showSuggestions,
    openFilePicker,
    removeImage,
    sendMessage,
    retryLastSend,
    canRetryLastSend,
    scrollToBottom,
    handleBreakdownConfirmed,
    revisePendingOperationForBubble,
    refreshPendingOperationForBubble,
    isPendingOperationBusy,
    trackCardOperation,
    confirmAndExecutePendingOperation,
    prepareStepUpForBubble,
    verifyStepUpForBubble,
  }
}
