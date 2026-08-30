'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
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
  const chat = useChatComposer()
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
        makeSuggestion('starter-1', chat.starterChips[0] ?? createSentence),
        makeSuggestion('starter-2', chat.starterChips[1] ?? createSentence),
        makeSuggestion('starter-3', chat.starterChips[2] ?? createSentence),
      ]

  let composerProps: ComposerProps = {
    ...chat.composerProps,
    suggestions: suggestions ?? chat.composerProps.suggestions,
    onOpenConversation: openConversation,
    conversationLabel: t('todayAstra.openConversation'),
  }
  if (!chat.isOnline) {
    composerProps = { ...composerProps, state: 'offline', limitReason: t('todayAstra.offline') } as ComposerProps
  }

  const line = shouldShowTodayAstraLine({ isTodaySelected, inDrillOrSurface: suppressed, isOnline: chat.isOnline, atLimit: chat.atMessageLimit })
    ? proactive
      ? { text: proactive.body, action: t('todayAstra.openConversation'), notificationId: proactive.id }
      : null
    : null

  return (
    <>
      {line ? (
        <div className="flex min-h-[42px] items-start gap-3 px-4 pb-3 pt-2 text-sm leading-5 text-[var(--fg-2)]">
          <AstraGlyph size={20} color="var(--fg-3)" />
          <p className="m-0 min-w-0 flex-1">
            {line.text}{' '}
            <button
              type="button"
              className="border-0 bg-transparent p-0 text-inherit underline underline-offset-4"
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
