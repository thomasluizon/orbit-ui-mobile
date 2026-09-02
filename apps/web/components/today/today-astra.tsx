'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { CHAT_TEXT_FILE_WEB_ACCEPT } from '@orbit/shared/chat'
import {
  selectNewestUnreadProactiveCheckin,
  shouldShowTodayAstraLine,
} from '@orbit/shared/utils'
import type { ComposerProps, ComposerSuggestions } from '@orbit/shared/contracts/composer'
import { useChatComposer } from '@/hooks/use-chat-composer'
import { useMarkNotificationRead, useNotifications } from '@/hooks/use-notifications'
import { useProfile } from '@/hooks/use-profile'
import { useUIStore } from '@/stores/ui-store'
import { useChatStore } from '@/stores/chat-store'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { Composer } from '@/components/shell/composer'

interface TodayAstraProps {
  isTodaySelected: boolean
  suppressed: boolean
}

export function TodayAstra({ isTodaySelected, suppressed }: Readonly<TodayAstraProps>) {
  const t = useTranslations()
  const [composerTarget, setComposerTarget] = useState<HTMLElement | null>(null)
  const { profile, isPending: profilePending, isError: profileError } = useProfile()
  const {
    atMessageLimit,
    composerProps: chatComposerProps,
    fileInputRef,
    handleFileSelect,
    handleTextFileSelect,
    isOnline,
    starterChips,
    textFileInputRef,
  } = useChatComposer()
  const { notifications } = useNotifications()
  const markRead = useMarkNotificationRead()
  const setConversationOpen = useUIStore((state) => state.setAstraConversationOpen)
  const setDraft = useChatStore((state) => state.setDraft)
  const proactive = selectNewestUnreadProactiveCheckin(notifications)

  useEffect(() => {
    const target = document.getElementById('today-composer-slot')
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) setComposerTarget(target)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const openConversation = () => setConversationOpen(true)
  const createSentence = t('todayAstra.createSentence')
  const makeSuggestion = (id: string, label: string) => ({
    id,
    label,
    onSelect: () => {
      setDraft(label)
      openConversation()
    },
  })
  const suggestions: ComposerSuggestions | null = profilePending || profileError || !profile
    ? null
    : [
        makeSuggestion('create-habit', createSentence),
        makeSuggestion('starter-1', starterChips[0] ?? createSentence),
        makeSuggestion('starter-2', starterChips[1] ?? createSentence),
        makeSuggestion('starter-3', starterChips[2] ?? createSentence),
      ]

  let composerProps: ComposerProps = {
    ...chatComposerProps,
    suggestions: suggestions ?? chatComposerProps.suggestions,
    onOpenConversation: openConversation,
    conversationLabel: t('todayAstra.openConversation'),
  }
  if (!isOnline) {
    composerProps = { ...composerProps, state: 'offline', limitReason: t('todayAstra.offline') } as ComposerProps
  }

  const line = shouldShowTodayAstraLine({ isTodaySelected, inDrillOrSurface: suppressed, isOnline, atLimit: atMessageLimit })
    ? proactive
      ? { text: proactive.body, action: t('todayAstra.openConversation'), notificationId: proactive.id }
      : null
    : null

  return (
    <>
      <input
        ref={textFileInputRef}
        type="file"
        accept={CHAT_TEXT_FILE_WEB_ACCEPT}
        className="hidden"
        onChange={(event) => void handleTextFileSelect(event)}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileSelect}
      />
      {line ? (
        <div className="flex min-h-[42px] items-start gap-3 px-4 pb-3 pt-2 text-sm leading-5 text-[var(--fg-2)]">
          <AstraGlyph size={20} color="var(--fg-3)" />
          <p className="m-0 min-w-0 flex-1">
            {line.text}{' '}
            <button
              type="button"
              className="orbit-link-action orbit-link-action-persistent border-0 bg-transparent p-0 text-inherit"
              onClick={() => {
                markRead.mutate(line.notificationId)
                openConversation()
              }}
            >
              {line.action}
            </button>
          </p>
        </div>
      ) : null}
      {composerTarget && !suppressed && suggestions ? createPortal(<Composer {...composerProps} />, composerTarget) : null}
    </>
  )
}
