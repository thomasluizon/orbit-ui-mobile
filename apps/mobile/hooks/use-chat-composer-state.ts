import type { ComposerState } from '@orbit/shared/hooks'
import { buildComposerAvailability,CHAT_DRAFT_STORAGE_KEY } from '@orbit/shared/hooks'

import { useCallback,useEffect,useMemo,useRef } from "react"
import { FlatList } from "react-native"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useTranslation } from "react-i18next"

import type { ChatMessage } from "@orbit/shared/types"

import { useHabitDetail,useHabits } from "@/hooks/use-habit-queries"
import { useSpeechToText } from "@/hooks/use-speech-to-text"

import { useUIStore } from "@/stores/ui-store"
import { useResetOnAccountChange } from "@/hooks/use-session-reset"
import type { AttemptedSend } from './use-chat-composer-types'
import type { useChatComposerAttachmentState } from './use-chat-composer-attachments'

export type ChatComposerState = ComposerState<AttemptedSend, ReturnType<typeof useHabits>, ReturnType<typeof useHabitDetail>> & Pick<ReturnType<typeof useSpeechToText>, 'isRecording' | 'isTranscribing' | 'transcript' | 'toggleRecording' | 'recordingDuration'> & {
  speechSupported: ReturnType<typeof useSpeechToText>['isSupported']
  speechError: ReturnType<typeof useSpeechToText>['error']
  t: ReturnType<typeof useTranslation>['t']
  i18n: ReturnType<typeof useTranslation>['i18n']
  date: string
  flatListRef: ReturnType<typeof useRef<FlatList<ChatMessage> | null>>
  prefersReducedMotionRef: ReturnType<typeof useRef<boolean>>
}

type ChatComposerSessionInputs = Pick<ChatComposerState, 'turnReconciliation' | 'blockSubmission' | 'activeStepsRef' | 'setActiveSteps' | 'setLastFailedSend' | 'setDailyBudgetDate' | 'setSendError'> & Pick<ReturnType<typeof useChatComposerAttachmentState>, 'setSelectedImage' | 'setImagePreview' | 'setSelectedTextFile' | 'imageSelectionVersionRef'>

export function useChatComposerSession(turnReconciliation: ChatComposerSessionInputs['turnReconciliation'], blockSubmission: ChatComposerSessionInputs['blockSubmission'], activeStepsRef: ChatComposerSessionInputs['activeStepsRef'], setActiveSteps: ChatComposerSessionInputs['setActiveSteps'], setLastFailedSend: ChatComposerSessionInputs['setLastFailedSend'], setDailyBudgetDate: ChatComposerSessionInputs['setDailyBudgetDate'], setSendError: ChatComposerSessionInputs['setSendError'], setSelectedImage: ChatComposerSessionInputs['setSelectedImage'], setImagePreview: ChatComposerSessionInputs['setImagePreview'], setSelectedTextFile: ChatComposerSessionInputs['setSelectedTextFile'], imageSelectionVersionRef: ChatComposerSessionInputs['imageSelectionVersionRef']) {
  /**
     * The root layout keeps this hook mounted through an account change, so the previous account's
     * attempted send would otherwise stay armed behind Retry and post its text and image under the
     * next account's token. The store reset cannot reach React state, so it follows the session
     * itself, and every field added here is covered by the same subscription.
     */
  useResetOnAccountChange(() => {
    imageSelectionVersionRef.current += 1
    turnReconciliation.reset()
    blockSubmission.reset()
    activeStepsRef.current = []
    setActiveSteps([])
    setLastFailedSend(null)
    setDailyBudgetDate(null)
    setSendError(null)
    setSelectedImage(null)
    setImagePreview(null)
    setSelectedTextFile(null)
    useUIStore.getState().setAstraConversationOpen(false)
  })

}

type ChatComposerAvailabilityInputs = Pick<ChatComposerState, 'profile' | 'dailyBudgetDate' | 'today' | 'replyActive' | 'isTyping' | 'streamingMessageId' | 'messages' | 'input'> & Pick<ReturnType<typeof useChatComposerAttachmentState>, 'selectedImage' | 'selectedTextFile'> & { isOnline: boolean }

export function useChatComposerAvailability(profile: ChatComposerAvailabilityInputs['profile'], dailyBudgetDate: ChatComposerAvailabilityInputs['dailyBudgetDate'], today: ChatComposerAvailabilityInputs['today'], replyActive: ChatComposerAvailabilityInputs['replyActive'], isTyping: ChatComposerAvailabilityInputs['isTyping'], streamingMessageId: ChatComposerAvailabilityInputs['streamingMessageId'], selectedImage: ChatComposerAvailabilityInputs['selectedImage'], selectedTextFile: ChatComposerAvailabilityInputs['selectedTextFile'], messages: ChatComposerAvailabilityInputs['messages'], input: ChatComposerAvailabilityInputs['input'], isOnline: ChatComposerAvailabilityInputs['isOnline']) {
  const imageName = selectedImage?.fileName ?? selectedImage?.uri.split("/").at(-1)
  const attachments = useMemo(
    () => [
      ...(selectedTextFile
        ? [{ id: "chat-file", kind: "file" as const, name: selectedTextFile.name }]
        : []),
      ...(selectedImage && imageName
        ? [{ id: "chat-image", kind: "image" as const, name: imageName }]
        : []),
    ],
    [imageName, selectedImage, selectedTextFile],
  )
  return buildComposerAvailability({ profile, dailyBudgetDate, today, replyActive, isTyping, streamingMessageId, messages, input, isOnline, attachments })
}

type ChatDraftPersistenceInputs = Pick<ChatComposerState, 'draftHydrated' | 'hydrateDraft' | 'input' | 'isRecording' | 'pendingVoiceCommitRef' | 'transcript' | 'setInput'>

export function useChatDraftPersistence(draftHydrated: ChatDraftPersistenceInputs['draftHydrated'], hydrateDraft: ChatDraftPersistenceInputs['hydrateDraft'], input: ChatDraftPersistenceInputs['input'], isRecording: ChatDraftPersistenceInputs['isRecording'], pendingVoiceCommitRef: ChatDraftPersistenceInputs['pendingVoiceCommitRef'], transcript: ChatDraftPersistenceInputs['transcript'], setInput: ChatDraftPersistenceInputs['setInput']) {
  useEffect(() => {
    if (draftHydrated) return
    let active = true
    void AsyncStorage.getItem(CHAT_DRAFT_STORAGE_KEY).then((storedDraft) => {
      if (active) hydrateDraft(storedDraft)
    })
    return () => {
      active = false
    }
  }, [draftHydrated, hydrateDraft])

  useEffect(() => {
    if (!draftHydrated) return
    if (input.trim()) {
      void AsyncStorage.setItem(CHAT_DRAFT_STORAGE_KEY, input)
    } else {
      void AsyncStorage.removeItem(CHAT_DRAFT_STORAGE_KEY)
    }
  }, [draftHydrated, input])

  useEffect(() => {
    if (isRecording) {
      pendingVoiceCommitRef.current = true
    } else if (pendingVoiceCommitRef.current && transcript.trim()) {
      pendingVoiceCommitRef.current = false
      setInput((current) => current ? `${current} ${transcript.trim()}` : transcript.trim())
    }
  }, [isRecording, pendingVoiceCommitRef, setInput, transcript])

}

type ChatComposerScrollInputs = Pick<ChatComposerState, 'recordingDuration' | 'threadScroll' | 'flatListRef' | 'prefersReducedMotionRef'>

export function useChatComposerScroll(recordingDuration: ChatComposerScrollInputs['recordingDuration'], threadScroll: ChatComposerScrollInputs['threadScroll'], flatListRef: ChatComposerScrollInputs['flatListRef'], prefersReducedMotionRef: ChatComposerScrollInputs['prefersReducedMotionRef']) {
  const recordingTime = useMemo(() => {
    const mins = Math.floor(recordingDuration / 60)
    const secs = recordingDuration % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }, [recordingDuration])

  const scrollToBottom = useCallback((afterScroll?: () => void) => {
    setTimeout(() => {
      if (threadScroll.isFollowing()) flatListRef.current?.scrollToEnd({ animated: !prefersReducedMotionRef.current })
      afterScroll?.()
    }, 100)
  }, [flatListRef, prefersReducedMotionRef, threadScroll])
  return { scrollToBottom, recordingTime }
}
