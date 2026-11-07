'use client'

import { createComposerRuntime, buildComposerSuggestions, buildChatComposerProps } from '@orbit/shared/hooks'
import { useState, useRef, useId, useMemo } from 'react'

import { createAstraAllowanceTranslator, formatAPIDateInTimeZone } from '@orbit/shared/utils'

import { useQueryClient } from '@tanstack/react-query'
import { useLocale,useTranslations } from 'next-intl'
import { resolveComposerChipSurface } from '@orbit/shared/chat'

import { useSpeechToText } from '@/hooks/use-speech-to-text'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'
import { useProfile } from '@/hooks/use-profile'
import { useHabitDetail,useHabits } from '@/hooks/use-habit-queries'
import type { AttemptedSend, UseChatComposerOptions } from './use-chat-composer-types'

import { useChatComposerSession,useChatComposerAvailability,useChatComposerScroll,useChatDraftPersistence } from './use-chat-composer-state'
import { useChatComposerAttachments } from './use-chat-composer-attachments'
import { useChatPendingBubbles } from './use-chat-pending-bubbles'
import { useChatSendFailure,useChatResponseSettlement,useChatRequestPayload,useChatStream,useChatSendQueue,useChatSendMessage,useChatSendRetry,useChatBreakdownRefresh } from './use-chat-send-stream'

/**
 * Drives the chat composer: draft + speech input, image attachment, the SSE
 * streaming send pipeline, and pending-operation step-up flows. The streaming
 * send is the one sanctioned client-side `fetch` to the API (a Server Action
 * cannot return a streaming `ReadableStream`); see apps/web/CLAUDE.md.
 */
export function useChatComposer(options: UseChatComposerOptions = {}) {
  const t = useTranslations()
  const locale = useLocale()
  const queryClient = useQueryClient()
  const { profile } = useProfile()
  const allowanceText = useMemo(() => createAstraAllowanceTranslator(t, profile, locale), [t, profile, locale])

  const contextualSuggestion = useChatStore((state) => state.contextualSuggestion)
  const calendarHasError = useUIStore((state) => state.calendarHasError)
  const today = options.today ?? formatAPIDateInTimeZone(new Date(), profile?.timeZone)
  const selectedDate = options.selectedDate ?? today
  const surface = resolveComposerChipSurface(options.pathname ?? '/')
  const habitsQuery = useHabits(surface === 'progress'
    ? {}
    : { dateFrom: selectedDate, dateTo: selectedDate, includeOverdue: selectedDate === today, includeGeneral: options.includeGeneral || undefined },
    undefined, { completeDay: true })
  const detailId = surface === 'habitDetail' ? options.pathname?.split('/')[2] ?? null : null
  const detailQuery = useHabitDetail(detailId)

  const {
    isRecording,
    isTranscribing,
    isSupported: speechSupported,
    transcript,
    error: speechError,
    clearError: clearSpeechError,
    toggleRecording,
    recordingDuration,
  } = useSpeechToText()

  const chatContainerRef = useRef<HTMLDivElement>(null)
  const composerInputId = useId()
  const { messages, isTyping, queuedPrompts, queuePaused, queueReady, replyActive, streamingMessageId, addMessage, updateMessage, appendToMessageContent, setIsTyping, setStreamingMessageId, draft: input, draftRevision, setDraft: setInput, draftHydrated, hydrateDraft } = useChatStore()
  const [sendError, setSendError] = useState<string | null>(null)
  const [activeSteps, setActiveSteps] = useState<{ domain: string; access: string }[]>([])
  const [lastFailedSend, setLastFailedSend] = useState<AttemptedSend | null>(null)
  const [dailyBudgetDate, setDailyBudgetDate] = useState<string | null>(null)
  const [{ stopReply, pendingVoiceCommitRef, threadScroll, activeStepsRef, turnReconciliation, blockSubmission }] = useState(createComposerRuntime)
  const { selectedTextFile, selectedImage, imagePreview, openFilePicker, removeImage, fileInputRef, textFileInputRef, handleFileSelect, handleTextFileSelect, restoreImage, restoreTextFile, clearImage, removeTextFile, handlePaste, openTextFilePicker } = useChatComposerAttachments(setSendError)
  const { isOnline } = useChatComposerSession(turnReconciliation, blockSubmission, activeStepsRef, setActiveSteps, setLastFailedSend, setDailyBudgetDate, setSendError)
  const { atMessageLimit, dailyBudgetReached, isSending, aiMessagesLimit, aiMessagesUsed, hasProAccess, canSend, showSuggestions, attachments } = useChatComposerAvailability(profile, dailyBudgetDate, today, replyActive, isTyping, streamingMessageId, selectedTextFile, selectedImage, input, isOnline, messages)
  const { scrollToBottom, recordingTime } = useChatComposerScroll(recordingDuration, chatContainerRef, threadScroll)
  const { revisePendingOperationForBubble, refreshPendingOperationForBubble, isPendingOperationBusy, trackCardOperation, confirmAndExecutePendingOperation, prepareStepUpForBubble, verifyStepUpForBubble } = useChatPendingBubbles(queryClient, isRecording, isTranscribing, selectedImage, selectedTextFile, lastFailedSend, queuedPrompts)
  const { handleFailedSend, handleAllowanceExceeded, handleDailyBudgetExceeded } = useChatSendFailure({ restoreImage, restoreTextFile, today, setSendError, activeStepsRef, setActiveSteps, setLastFailedSend, setDailyBudgetDate, allowanceText, updateMessage, addMessage, setIsTyping, setInput, t, scrollToBottom })
  const { applyFinalResponse } = useChatResponseSettlement({ activeStepsRef, setActiveSteps, threadScroll, queryClient, updateMessage, addMessage, setIsTyping, setStreamingMessageId, scrollToBottom })
  useChatDraftPersistence(draftHydrated, composerInputId, hydrateDraft, input, isRecording, pendingVoiceCommitRef, transcript, setInput)
  const { buildChatFormData } = useChatRequestPayload(locale, profile)
  const { runStreamingSend } = useChatStream({ turnReconciliation, activeStepsRef, setActiveSteps, queryClient, allowanceText, updateMessage, addMessage, setIsTyping, t, setStreamingMessageId, stopReply, appendToMessageContent, scrollToBottom, buildChatFormData, applyFinalResponse })
  const { blockAnswerInteraction, reportHistoryFailure, sendPreparedAttempt, performSend } = useChatSendQueue(threadScroll, chatContainerRef, activeStepsRef, setActiveSteps, setSendError, setLastFailedSend, scrollToBottom, setIsTyping, runStreamingSend, handleFailedSend, blockSubmission, isOnline, atMessageLimit, dailyBudgetReached, handleAllowanceExceeded, handleDailyBudgetExceeded, locale, queryClient, t, isSending, aiMessagesLimit, allowanceText, setInput, clearImage, removeTextFile, clearSpeechError)
  const { sendMessage } = useChatSendMessage(input, selectedTextFile, t, attachments, isOnline, setSendError, dailyBudgetReached, atMessageLimit, addMessage, allowanceText, scrollToBottom, reportHistoryFailure, selectedImage, imagePreview, sendPreparedAttempt)
  const { canRetryLastSend, retryLastSend, sendQueuedPrompt } = useChatSendRetry(isOnline, atMessageLimit, queryClient, isSending, queuePaused, queueReady, queuedPrompts, lastFailedSend, performSend, setInput, { draft: input, draftRevision, attachments })
  const { queue, usageMessage, renewalHint, allowanceReason, composerSuggestions, messageLimitPlaceholder, messageLimitReason } = buildComposerSuggestions({ surface, habitsQuery, detailQuery, calendarHasError, selectedDate, today, profile, contextualSuggestion, t, sendMessage, aiMessagesLimit, aiMessagesUsed, dailyBudgetReached, allowanceText, queuedPrompts, queuePaused, isSending, isOnline, atMessageLimit, setSendError, sendQueuedPrompt, totalHabitCount: options.totalHabitCount, getChat: useChatStore.getState })
  const composerProps = buildChatComposerProps({ t, isOnline, isSending, queue, stopReply, usageMessage, renewalHint, allowanceReason, input, speechError, sendError, setInput, sendMessage, composerSuggestions, openTextFilePicker, openFilePicker, attachments, removeTextFile, removeImage, canRetryLastSend, retryLastSend, isRecording, toggleRecording, isTranscribing, speechSupported, atMessageLimit, messageLimitPlaceholder, messageLimitReason }, { onPaste: handlePaste })
  const { handleBreakdownConfirmed } = useChatBreakdownRefresh(queryClient)

  return {
    blockAnswerInteraction, activeSteps, canShowFollowUps: isOnline && !isSending && !atMessageLimit && profile != null, chatContainerRef,
    threadScroll, fileInputRef, textFileInputRef, input,
    setInput, sendError, selectedImage, selectedTextFile,
    imagePreview, isRecording, isTranscribing, speechSupported,
    transcript, speechError, toggleRecording, recordingTime,
    messages, isTyping, isSending, streamingMessageId,
    hasProAccess, hasGoogleConnection: profile?.hasGoogleConnection ?? false, aiMessagesUsed, aiMessagesLimit,
    allowanceReason: allowanceText('shell.composer.limit.reason', { allowance: aiMessagesLimit }), atMessageLimit, dailyBudgetReached, canSend,
    isOnline, showSuggestions, openFilePicker, handleFileSelect,
    handleTextFileSelect, removeImage, composerProps, composerInputId,
    sendMessage, retryLastSend, canRetryLastSend, handleBreakdownConfirmed,
    revisePendingOperationForBubble, refreshPendingOperationForBubble, isPendingOperationBusy, trackCardOperation,
    confirmAndExecutePendingOperation, prepareStepUpForBubble, verifyStepUpForBubble, scrollToBottom,
  }
}
