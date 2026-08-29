'use client'

import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import {
  getReturningDays,
  selectNewestUnreadProactiveCheckin,
  shouldShowTodayAstraLine,
} from '@orbit/shared/utils'
import type { ComposerProps, ComposerSuggestions } from '@orbit/shared/contracts/composer'
import { useChatComposer } from '@/hooks/use-chat-composer'
import { useStreakInfo } from '@/hooks/use-gamification'
import { useIsClient } from '@/hooks/use-is-client'
import { useMarkNotificationRead, useNotifications } from '@/hooks/use-notifications'
import { useProfile } from '@/hooks/use-profile'
import { useUIStore } from '@/stores/ui-store'
import { useChatStore } from '@/stores/chat-store'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { Composer } from '@/components/shell/composer'

interface TodayAstraProps {
  today: string
  isTodaySelected: boolean
  suppressed: boolean
}

export function TodayAstra({ today, isTodaySelected, suppressed }: Readonly<TodayAstraProps>) {
  const t = useTranslations()
  const router = useRouter()
  const isClient = useIsClient()
  const { profile, isPending: profilePending, isError: profileError } = useProfile()
  const chat = useChatComposer()
  const streak = useStreakInfo(isTodaySelected)
  const { notifications } = useNotifications()
  const markRead = useMarkNotificationRead()
  const setConversationOpen = useUIStore((state) => state.setAstraConversationOpen)
  const setDraft = useChatStore((state) => state.setDraft)
  const returningDays = getReturningDays([streak.data?.lastActiveDate], today)
  const proactive = selectNewestUnreadProactiveCheckin(notifications)
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
      ? { text: proactive.body, action: t('todayAstra.openConversation'), kind: 'conversation' as const }
      : returningDays !== null
        ? { text: t('todayAstra.returning', { days: returningDays }), action: t('todayAstra.openProgress'), kind: 'progress' as const }
        : null
    : null

  const composerTarget = isClient ? document.getElementById('today-composer-slot') : null
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
                if (line.kind === 'conversation') {
                  if (proactive) markRead.mutate(proactive.id)
                  openConversation()
                } else {
                  router.push('/progress')
                }
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
