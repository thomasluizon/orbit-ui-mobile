'use client'

import { createPortal } from 'react-dom'
import { useQueries } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { habitKeys, QUERY_STALE_TIMES } from '@orbit/shared/query'
import { API } from '@orbit/shared/api'
import type { HabitMetrics, NormalizedHabit } from '@orbit/shared/types/habit'
import {
  getReturningDays,
  selectNewestUnreadProactiveCheckin,
  shouldShowTodayAstraLine,
} from '@orbit/shared/utils'
import type { ComposerProps, ComposerSuggestions } from '@orbit/shared/contracts/composer'
import { useChatComposer } from '@/hooks/use-chat-composer'
import { useIsClient } from '@/hooks/use-is-client'
import { useMarkNotificationRead, useNotifications } from '@/hooks/use-notifications'
import { useProfile } from '@/hooks/use-profile'
import { useUIStore } from '@/stores/ui-store'
import { fetchJson } from '@/lib/api-fetch'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { Composer } from '@/components/shell/composer'

interface TodayAstraProps {
  habitsById: Map<string, NormalizedHabit>
  today: string
  isTodaySelected: boolean
  suppressed: boolean
}

export function TodayAstra({ habitsById, today, isTodaySelected, suppressed }: Readonly<TodayAstraProps>) {
  const t = useTranslations()
  const router = useRouter()
  const isClient = useIsClient()
  const { profile, isPending: profilePending, isError: profileError } = useProfile()
  const chat = useChatComposer()
  const { notifications } = useNotifications()
  const markRead = useMarkNotificationRead()
  const setConversationOpen = useUIStore((state) => state.setAstraConversationOpen)
  const metrics = useQueries({
    queries: Array.from(habitsById.keys()).map((id) => ({
      queryKey: habitKeys.metrics(id),
      queryFn: () => fetchJson<HabitMetrics>(API.habits.metrics(id)),
      staleTime: QUERY_STALE_TIMES.habits,
      enabled: isTodaySelected,
    })),
  })
  const returningDays = getReturningDays(metrics.map((query) => query.data?.lastCompletedDate), today)
  const proactive = selectNewestUnreadProactiveCheckin(notifications)
  const openConversation = () => setConversationOpen(true)
  const createSentence = t('todayAstra.createSentence')
  const makeSuggestion = (id: string, label: string) => ({
    id,
    label,
    onSelect: () => {
      chat.setInput(label)
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
