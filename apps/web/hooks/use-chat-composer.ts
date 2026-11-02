'use client'

import type { UseChatComposerOptions } from './use-chat-composer-types'
import { useChatComposerState, useChatComposerSession, useChatComposerAvailability, useChatComposerScroll, useChatDraftPersistence, useChatComposerSuggestions, useChatComposerProps } from './use-chat-composer-state'
import { useChatComposerAttachments } from './use-chat-composer-attachments'
import { useChatPendingBubbles } from './use-chat-pending-bubbles'
import { useChatSendFailure, useChatResponseSettlement, useChatRequestPayload, useChatStream, useChatSendQueue, useChatSendMessage, useChatSendRetry, useChatBreakdownRefresh } from './use-chat-send-stream'

/**
 * Drives the chat composer: draft + speech input, image attachment, the SSE
 * streaming send pipeline, and pending-operation step-up flows. The streaming
 * send is the one sanctioned client-side `fetch` to the API (a Server Action
 * cannot return a streaming `ReadableStream`); see apps/web/CLAUDE.md.
 */
export function useChatComposer(options: UseChatComposerOptions = {}) {
  const parameters = { options }
  const chatComposerState = useChatComposerState({ ...parameters })
  const chatComposerAttachments = useChatComposerAttachments({ ...chatComposerState })
  const chatComposerSession = useChatComposerSession({ ...chatComposerState })
  const chatComposerAvailability = useChatComposerAvailability({ ...chatComposerState, ...chatComposerAttachments, ...chatComposerSession })
  const chatComposerScroll = useChatComposerScroll({ ...chatComposerState })
  const chatPendingBubbles = useChatPendingBubbles({ ...chatComposerState, ...chatComposerAttachments })
  const chatSendFailure = useChatSendFailure({ ...chatComposerAttachments, ...chatComposerState, ...chatComposerScroll })
  const chatResponseSettlement = useChatResponseSettlement({ ...chatComposerState, ...chatComposerScroll })
  useChatDraftPersistence({ ...chatComposerState })
  const chatRequestPayload = useChatRequestPayload({ ...chatComposerState })
  const chatStream = useChatStream({ ...chatComposerState, ...chatComposerScroll, ...chatRequestPayload, ...chatResponseSettlement })
  const chatSendQueue = useChatSendQueue({ ...chatComposerState, ...chatComposerScroll, ...chatStream, ...chatSendFailure, ...chatComposerSession, ...chatComposerAvailability, ...chatComposerAttachments })
  const chatSendMessage = useChatSendMessage({ ...chatComposerState, ...chatComposerAttachments, ...chatComposerAvailability, ...chatComposerSession, ...chatComposerScroll, ...chatSendQueue })
  const chatSendRetry = useChatSendRetry({ ...chatComposerSession, ...chatComposerAvailability, ...chatComposerState, ...chatSendQueue })
  const chatComposerSuggestions = useChatComposerSuggestions({ ...chatComposerState, ...parameters, ...chatSendMessage, ...chatComposerAvailability, ...chatComposerSession, ...chatSendRetry })
  const chatComposerProps = useChatComposerProps({ ...chatComposerState, ...chatComposerSession, ...chatComposerAvailability, ...chatComposerSuggestions, ...chatSendMessage, ...chatComposerAttachments, ...chatSendRetry })
  const chatBreakdownRefresh = useChatBreakdownRefresh({ ...chatComposerState })
  const { profile, isTyping, streamingMessageId, input, messages, chatContainerRef, threadScroll, isRecording, isTranscribing, allowanceText, setInput, composerInputId, transcript, speechError, sendError, toggleRecording, speechSupported, activeSteps } = chatComposerState
  const { selectedTextFile, selectedImage, imagePreview, openFilePicker, removeImage, fileInputRef, textFileInputRef, handleFileSelect, handleTextFileSelect } = chatComposerAttachments
  const { isOnline } = chatComposerSession
  const { atMessageLimit, dailyBudgetReached, isSending, aiMessagesLimit, aiMessagesUsed, hasProAccess, canSend, showSuggestions } = chatComposerAvailability
  const { scrollToBottom, recordingTime } = chatComposerScroll
  const { revisePendingOperationForBubble, refreshPendingOperationForBubble, isPendingOperationBusy, trackCardOperation, confirmAndExecutePendingOperation, prepareStepUpForBubble, verifyStepUpForBubble } = chatPendingBubbles
  const { blockAnswerInteraction } = chatSendQueue
  const { sendMessage } = chatSendMessage
  const { canRetryLastSend, retryLastSend } = chatSendRetry
  const { composerProps } = chatComposerProps
  const { handleBreakdownConfirmed } = chatBreakdownRefresh
  return {
    blockAnswerInteraction,
    activeSteps,
    canShowFollowUps: isOnline && !isSending && !atMessageLimit && profile != null,
    chatContainerRef,
    threadScroll,
    fileInputRef,
    textFileInputRef,
    input,
    setInput,
    sendError,
    selectedImage,
    selectedTextFile,
    imagePreview,
    isRecording,
    isTranscribing,
    speechSupported,
    transcript,
    speechError,
    toggleRecording,
    recordingTime,
    messages,
    isTyping,
    isSending,
    streamingMessageId,
    hasProAccess,
    hasGoogleConnection: profile?.hasGoogleConnection ?? false,
    aiMessagesUsed,
    aiMessagesLimit,
    allowanceReason: allowanceText('shell.composer.limit.reason', { allowance: aiMessagesLimit }),
    atMessageLimit,
    dailyBudgetReached,
    canSend,
    isOnline,
    showSuggestions,
    openFilePicker,
    handleFileSelect,
    handleTextFileSelect,
    removeImage,
    composerProps,
    composerInputId,
    sendMessage,
    retryLastSend,
    canRetryLastSend,
    handleBreakdownConfirmed,
    revisePendingOperationForBubble,
    refreshPendingOperationForBubble,
    isPendingOperationBusy,
    trackCardOperation,
    confirmAndExecutePendingOperation,
    prepareStepUpForBubble,
    verifyStepUpForBubble,
    scrollToBottom,
  }
}
