import { createComposerRuntime, buildComposerSuggestions, buildChatComposerProps } from '@orbit/shared/hooks'
import { useState, useEffect, useMemo, useRef } from 'react'

import { createAstraAllowanceTranslator,formatAPIDateInTimeZone } from '@orbit/shared/utils'

import { FlatList,Linking } from "react-native"
import { useTranslation } from "react-i18next"
import { useQueryClient } from "@tanstack/react-query"
import { resolveComposerChipSurface } from "@orbit/shared/chat"
import type { ChatMessage } from "@orbit/shared/types"
import { useProfile } from "@/hooks/use-profile"
import { useHabitDetail,useHabits } from "@/hooks/use-habit-queries"
import { useSpeechToText } from "@/hooks/use-speech-to-text"
import { useChatStore } from "@/stores/chat-store"
import { useUIStore } from "@/stores/ui-store"
import { usePrefersReducedMotion } from "@/lib/motion"
import type { AttemptedSend, UseChatComposerOptions } from './use-chat-composer-types'

import { useChatComposerSession,useChatComposerAvailability,useChatDraftPersistence,useChatComposerScroll } from './use-chat-composer-state'
import { useChatComposerAttachments } from './use-chat-composer-attachments'
import { useChatPendingBubbles } from './use-chat-pending-bubbles'
import { usePendingOperationExecution } from './use-pending-operation-execution'
import { useChatSendFailure,useChatResponseSettlement,useChatRequestPayload,useChatStream,useChatSendQueue,useChatSendMessage,useChatSendRetry,useChatBreakdownRefresh } from './use-chat-send-stream'

/**
 * Mobile chat-composer hook. Wraps the framework-agnostic
 * `@orbit/shared/hooks` core with React Native state and direct `apiClient`
 * I/O, mirroring the web `useChatComposer`. Offline gating is injected because
 * the offline UI itself lives on the screen.
 */
export function useChatComposer({ isOnline, offlineTitle, pathname = "/", selectedDate, today: currentDate, totalHabitCount, includeGeneral }: UseChatComposerOptions) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const { profile } = useProfile()
  const allowanceText = useMemo(() => createAstraAllowanceTranslator(t, profile, i18n.language), [t, profile, i18n.language])

  const contextualSuggestion = useChatStore((state) => state.contextualSuggestion)
  const calendarHasError = useUIStore((state) => state.calendarHasError)
  const today = currentDate ?? formatAPIDateInTimeZone(new Date(), profile?.timeZone)
  const date = selectedDate ?? today
  const surface = resolveComposerChipSurface(pathname)
  const habitsQuery = useHabits(surface === "progress"
    ? {}
    : { dateFrom: date, dateTo: date, includeOverdue: date === today, includeGeneral: includeGeneral || undefined },
    { completeDay: true })
  const detailId = surface === "habitDetail" ? pathname.split("/")[2] ?? null : null
  const detailQuery = useHabitDetail(detailId)

  const {
    isRecording,
    isTranscribing,
    isSupported: speechSupported,
    transcript,
    error: speechError,
    toggleRecording,
    recordingDuration,
  } = useSpeechToText()

  const flatListRef = useRef<FlatList<ChatMessage>>(null)
  const prefersReducedMotion = usePrefersReducedMotion()
  const prefersReducedMotionRef = useRef(prefersReducedMotion)
  useEffect(() => {
    prefersReducedMotionRef.current = prefersReducedMotion
  }, [prefersReducedMotion])
  const { messages, isTyping, queuedPrompts, queuePaused, queueReady, replyActive, streamingMessageId, addMessage, updateMessage, appendToMessageContent, setIsTyping, setStreamingMessageId, draft: input, setDraft: setInput, draftHydrated, hydrateDraft } = useChatStore()
  const [sendError, setSendError] = useState<string | null>(null)
  const [activeSteps, setActiveSteps] = useState<{ domain: string; access: string }[]>([])
  const [lastFailedSend, setLastFailedSend] = useState<AttemptedSend | null>(null)
  const [dailyBudgetDate, setDailyBudgetDate] = useState<string | null>(null)
  const [{ stopReply, pendingVoiceCommitRef, threadScroll, activeStepsRef, turnReconciliation, blockSubmission }] = useState(createComposerRuntime)
  const { selectedImage, selectedTextFile, imagePreview, openFilePicker, removeImage, setSelectedImage, setImagePreview, setSelectedTextFile, imageSelectionVersionRef, openTextFilePicker, removeTextFile } = useChatComposerAttachments({ t, setSendError })
  useChatComposerSession(turnReconciliation, blockSubmission, activeStepsRef, setActiveSteps, setLastFailedSend, setDailyBudgetDate, setSendError, setSelectedImage, setImagePreview, setSelectedTextFile, imageSelectionVersionRef)
  const { atMessageLimit, dailyBudgetReached, isSending, aiMessagesLimit, aiMessagesUsed, hasProAccess, showSuggestions, attachments } = useChatComposerAvailability(profile, dailyBudgetDate, today, replyActive, isTyping, streamingMessageId, selectedImage, selectedTextFile, messages, input, isOnline)
  useChatDraftPersistence(draftHydrated, hydrateDraft, input, isRecording, pendingVoiceCommitRef, transcript, setInput)
  const { scrollToBottom, recordingTime } = useChatComposerScroll(recordingDuration, threadScroll, flatListRef, prefersReducedMotionRef)
  const chatPendingBubbles = useChatPendingBubbles(queryClient)
  const { handleFailedSend, handleAllowanceExceeded, handleDailyBudgetExceeded } = useChatSendFailure({ setSelectedImage, setImagePreview, setSelectedTextFile, imageSelectionVersionRef, today, t, setSendError, activeStepsRef, setActiveSteps, setLastFailedSend, setDailyBudgetDate, setInput, allowanceText, updateMessage, addMessage, setIsTyping, scrollToBottom })
  const { applyFinalResponse } = useChatResponseSettlement({ activeStepsRef, setActiveSteps, threadScroll, queryClient, updateMessage, addMessage, setIsTyping, setStreamingMessageId, scrollToBottom })
  const { buildChatFormData } = useChatRequestPayload(i18n, profile)
  const { runStreamingSend } = useChatStream({ t, turnReconciliation, activeStepsRef, setActiveSteps, queryClient, allowanceText, updateMessage, addMessage, setIsTyping, setStreamingMessageId, stopReply, appendToMessageContent, scrollToBottom, buildChatFormData, applyFinalResponse })
  const { blockAnswerInteraction, reportHistoryFailure, sendPreparedAttempt, performSend } = useChatSendQueue(threadScroll, activeStepsRef, setActiveSteps, setSendError, setLastFailedSend, scrollToBottom, setIsTyping, runStreamingSend, handleFailedSend, blockSubmission, isOnline, atMessageLimit, dailyBudgetReached, handleAllowanceExceeded, handleDailyBudgetExceeded, i18n, queryClient, t, isSending, aiMessagesLimit, allowanceText, setInput, setSelectedImage, setImagePreview, setSelectedTextFile, imageSelectionVersionRef)
  const { sendMessage } = useChatSendMessage(input, selectedTextFile, t, attachments, isOnline, setSendError, dailyBudgetReached, atMessageLimit, addMessage, allowanceText, scrollToBottom, reportHistoryFailure, selectedImage, imagePreview, sendPreparedAttempt)
  const { canRetryLastSend, retryLastSend, sendQueuedPrompt } = useChatSendRetry(isOnline, atMessageLimit, queryClient, isSending, queuePaused, queueReady, queuedPrompts, lastFailedSend, setSendError, offlineTitle, performSend, setInput)
  const speechRecovery = useMemo(() => speechError === t('speech.micDenied') ? { errorRecovery: { label: t('common.openSettings'), onSelect: () => { void Linking.openSettings() } } } : {}, [speechError, t])
  const { queue, usageMessage, renewalHint, allowanceReason, composerSuggestions, messageLimitPlaceholder, messageLimitReason } = buildComposerSuggestions({ surface, habitsQuery, detailQuery, calendarHasError, today, totalHabitCount, profile, contextualSuggestion, t, sendMessage, aiMessagesLimit, aiMessagesUsed, dailyBudgetReached, allowanceText, queuedPrompts, queuePaused, isSending, isOnline, atMessageLimit, setSendError, sendQueuedPrompt, selectedDate: date, getChat: useChatStore.getState })
  const composerProps = buildChatComposerProps({ t, isOnline, isSending, queue, stopReply, usageMessage, renewalHint, allowanceReason, input, speechError, sendError, setInput, sendMessage, composerSuggestions, openTextFilePicker, openFilePicker, attachments, removeTextFile, removeImage, canRetryLastSend, retryLastSend, isRecording, toggleRecording, isTranscribing, speechSupported, atMessageLimit, messageLimitPlaceholder, messageLimitReason }, speechRecovery)
  const { revisePendingOperationForBubble, refreshPendingOperationForBubble, isPendingOperationBusy, trackCardOperation, confirmAndExecutePendingOperation, prepareStepUpForBubble, verifyStepUpForBubble } = usePendingOperationExecution(chatPendingBubbles)
  const { handleBreakdownConfirmed } = useChatBreakdownRefresh(queryClient)

  return {
    blockAnswerInteraction, activeSteps, canShowFollowUps: isOnline && !isSending && !atMessageLimit && profile != null, isOnline,
    flatListRef, threadScroll, messages, isTyping,
    isSending, streamingMessageId, sendError, input,
    setInput, selectedImage, selectedTextFile, imagePreview,
    composerProps, isRecording, isTranscribing, speechSupported,
    transcript, speechError, toggleRecording, recordingTime,
    hasProAccess, hasGoogleConnection: profile?.hasGoogleConnection ?? false, aiMessagesUsed, aiMessagesLimit,
    allowanceReason: allowanceText('shell.composer.limit.reason', { allowance: aiMessagesLimit }), atMessageLimit, dailyBudgetReached, showSuggestions,
    openFilePicker, removeImage, sendMessage, retryLastSend,
    canRetryLastSend, scrollToBottom, handleBreakdownConfirmed, revisePendingOperationForBubble,
    refreshPendingOperationForBubble, isPendingOperationBusy, trackCardOperation, confirmAndExecutePendingOperation,
    prepareStepUpForBubble, verifyStepUpForBubble,
  }
}
