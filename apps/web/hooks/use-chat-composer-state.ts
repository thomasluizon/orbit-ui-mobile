'use client'

import type { ComposerState } from '@orbit/shared/hooks'

import { buildComposerAvailability } from '@orbit/shared/hooks'


import { mediaQueryMatches } from '@/lib/media-query'
import { useRef,useCallback,useEffect,useMemo,useSyncExternalStore } from 'react'

import { useLocale,useTranslations } from 'next-intl'

import { CHAT_DRAFT_STORAGE_KEY } from '@orbit/shared/hooks'
import { useSpeechToText } from '@/hooks/use-speech-to-text'
import { useChatStore } from '@/stores/chat-store'
import { useUIStore } from '@/stores/ui-store'

import { useHabitDetail,useHabits } from '@/hooks/use-habit-queries'
import { useResetOnAccountChange } from '@/hooks/use-session-reset'
import type { AttemptedSend } from './use-chat-composer-types'
import type { useChatComposerAttachments } from './use-chat-composer-attachments'

function subscribeToNetworkStatus(onStoreChange: () => void): () => void {
  globalThis.addEventListener('online', onStoreChange)
  globalThis.addEventListener('offline', onStoreChange)
  return () => {
    globalThis.removeEventListener('online', onStoreChange)
    globalThis.removeEventListener('offline', onStoreChange)
  }
}

function readNetworkStatus(): boolean {
  return globalThis.navigator.onLine
}

function readServerNetworkStatus(): boolean {
  return true
}


export type ChatComposerState = ComposerState<AttemptedSend, ReturnType<typeof useHabits>, ReturnType<typeof useHabitDetail>> & Pick<ReturnType<typeof useSpeechToText>, 'isRecording' | 'isTranscribing' | 'transcript' | 'toggleRecording' | 'recordingDuration'> & {
  speechSupported: ReturnType<typeof useSpeechToText>['isSupported']
  speechError: ReturnType<typeof useSpeechToText>['error']
  t: ReturnType<typeof useTranslations>
  locale: ReturnType<typeof useLocale>
  selectedDate: string
  chatContainerRef: ReturnType<typeof useRef<HTMLDivElement | null>>
  composerInputId: string
}

type ChatComposerSessionInputs = Pick<ChatComposerState, 'turnReconciliation' | 'blockSubmission' | 'activeStepsRef' | 'setActiveSteps' | 'setLastFailedSend' | 'setDailyBudgetDate' | 'setSendError'>

export function useChatComposerSession(turnReconciliation: ChatComposerSessionInputs['turnReconciliation'], blockSubmission: ChatComposerSessionInputs['blockSubmission'], activeStepsRef: ChatComposerSessionInputs['activeStepsRef'], setActiveSteps: ChatComposerSessionInputs['setActiveSteps'], setLastFailedSend: ChatComposerSessionInputs['setLastFailedSend'], setDailyBudgetDate: ChatComposerSessionInputs['setDailyBudgetDate'], setSendError: ChatComposerSessionInputs['setSendError']) {
  /**
     * The app shell keeps this hook mounted through an account change, so the previous account's
     * attempted send would otherwise stay armed behind Retry and post its text under the next
     * account's cookie. The store reset cannot reach React state, so it follows the session
     * itself.
     */
  useResetOnAccountChange(() => {
    turnReconciliation.reset()
    blockSubmission.reset()
    activeStepsRef.current = []
    setActiveSteps([])
    setLastFailedSend(null)
    setDailyBudgetDate(null)
    setSendError(null)
    useUIStore.getState().setAstraConversationOpen(false)
  })

  const isOnline = useSyncExternalStore(
    subscribeToNetworkStatus,
    readNetworkStatus,
    readServerNetworkStatus,
  )
  return { isOnline }
}

type ChatComposerAvailabilityInputs = Pick<ChatComposerState, 'profile' | 'dailyBudgetDate' | 'today' | 'replyActive' | 'isTyping' | 'streamingMessageId' | 'input' | 'messages'> & Pick<ReturnType<typeof useChatComposerAttachments>, 'selectedTextFile' | 'selectedImage'> & Pick<ReturnType<typeof useChatComposerSession>, 'isOnline'>

export function useChatComposerAvailability(profile: ChatComposerAvailabilityInputs['profile'], dailyBudgetDate: ChatComposerAvailabilityInputs['dailyBudgetDate'], today: ChatComposerAvailabilityInputs['today'], replyActive: ChatComposerAvailabilityInputs['replyActive'], isTyping: ChatComposerAvailabilityInputs['isTyping'], streamingMessageId: ChatComposerAvailabilityInputs['streamingMessageId'], selectedTextFile: ChatComposerAvailabilityInputs['selectedTextFile'], selectedImage: ChatComposerAvailabilityInputs['selectedImage'], input: ChatComposerAvailabilityInputs['input'], isOnline: ChatComposerAvailabilityInputs['isOnline'], messages: ChatComposerAvailabilityInputs['messages']) {
  const attachments = useMemo(
    () => [
      ...(selectedTextFile
        ? [{ id: 'chat-file', kind: 'file' as const, name: selectedTextFile.name }]
        : []),
      ...(selectedImage
        ? [{ id: 'chat-image', kind: 'image' as const, name: selectedImage.name }]
        : []),
    ],
    [selectedImage, selectedTextFile],
  )
  return buildComposerAvailability({ profile, dailyBudgetDate, today, replyActive, isTyping, streamingMessageId, messages, attachments, input, isOnline })
}

type ChatComposerScrollInputs = Pick<ChatComposerState, 'recordingDuration' | 'chatContainerRef' | 'threadScroll'>

export function useChatComposerScroll(recordingDuration: ChatComposerScrollInputs['recordingDuration'], chatContainerRef: ChatComposerScrollInputs['chatContainerRef'], threadScroll: ChatComposerScrollInputs['threadScroll']) {
  const recordingTime = useMemo(() => {
    const mins = Math.floor(recordingDuration / 60)
    const secs = recordingDuration % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }, [recordingDuration])

  const scrollToBottom = useCallback((afterScroll?: () => void) => {
    requestAnimationFrame(() => {
      const el = chatContainerRef.current
      if (el && threadScroll.isFollowing()) el.scrollTo({
        top: el.scrollHeight,
        behavior: mediaQueryMatches('(prefers-reduced-motion: reduce)', true) ? 'auto' : 'smooth',
      })
      afterScroll?.()
    })
  }, [chatContainerRef, threadScroll])
  return { scrollToBottom, recordingTime }
}

type ChatDraftPersistenceInputs = Pick<ChatComposerState, 'draftHydrated' | 'composerInputId' | 'hydrateDraft' | 'input' | 'isRecording' | 'pendingVoiceCommitRef' | 'transcript' | 'setInput'>

export function useChatDraftPersistence(draftHydrated: ChatDraftPersistenceInputs['draftHydrated'], composerInputId: ChatDraftPersistenceInputs['composerInputId'], hydrateDraft: ChatDraftPersistenceInputs['hydrateDraft'], input: ChatDraftPersistenceInputs['input'], isRecording: ChatDraftPersistenceInputs['isRecording'], pendingVoiceCommitRef: ChatDraftPersistenceInputs['pendingVoiceCommitRef'], transcript: ChatDraftPersistenceInputs['transcript'], setInput: ChatDraftPersistenceInputs['setInput']) {
  useEffect(() => {
    if (!draftHydrated) {
      const textarea = document.getElementById(composerInputId) as HTMLTextAreaElement | null
      hydrateDraft(globalThis.localStorage.getItem(CHAT_DRAFT_STORAGE_KEY), textarea?.value)
    }
  }, [composerInputId, draftHydrated, hydrateDraft])

  useEffect(() => {
    if (!draftHydrated) return
    const trimmedDraft = input.trim()
    if (!trimmedDraft) {
      globalThis.localStorage.removeItem(CHAT_DRAFT_STORAGE_KEY)
      return
    }
    globalThis.localStorage.setItem(CHAT_DRAFT_STORAGE_KEY, input)
  }, [draftHydrated, input])

  useEffect(() => {
    if (isRecording) {
      pendingVoiceCommitRef.current = true
    } else if (pendingVoiceCommitRef.current && transcript.trim()) {
      pendingVoiceCommitRef.current = false
      setInput((current) => (current ? `${current} ${transcript.trim()}` : transcript.trim()))
    }
  }, [isRecording, pendingVoiceCommitRef, setInput, transcript])

}
