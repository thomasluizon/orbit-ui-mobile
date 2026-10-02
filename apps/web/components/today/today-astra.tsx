'use client'

import { useId, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import {
  getReturningInterval,
  selectNewestUnreadProactiveCheckin,
  shouldShowTodayAstraLine,
  shouldShowTodayAstraSurface,
} from '@orbit/shared/utils'
import { useMarkNotificationRead, useNotifications } from '@/hooks/use-notifications'
import { useProfile } from '@/hooks/use-profile'
import { useUIStore } from '@/stores/ui-store'
import { AstraGlyph } from '@/components/ui/astra-glyph'

interface TodayAstraProps {
  today: string
  isTodaySelected: boolean
  suppressed: boolean
}

export function TodayAstra({ today, isTodaySelected, suppressed }: Readonly<TodayAstraProps>) {
  const t = useTranslations()
  const destinationId = useId()
  const { profile } = useProfile()
  const { notifications } = useNotifications()
  const markRead = useMarkNotificationRead()
  const setConversationOpen = useUIStore((state) => state.setAstraConversationOpen)
  const isOnline = useSyncExternalStore(
    (onChange) => {
      globalThis.addEventListener('online', onChange)
      globalThis.addEventListener('offline', onChange)
      return () => {
        globalThis.removeEventListener('online', onChange)
        globalThis.removeEventListener('offline', onChange)
      }
    },
    () => globalThis.navigator.onLine,
    () => true,
  )
  const atMessageLimit = profile != null && profile.aiMessagesUsed >= profile.aiMessagesLimit
  const returning = getReturningInterval(profile?.lastCompletionDate, profile?.timeZone)
  const proactive = shouldShowTodayAstraLine({ isTodaySelected, inDrillOrSurface: suppressed, isOnline, atLimit: atMessageLimit })
    ? selectNewestUnreadProactiveCheckin(notifications, today, profile?.timeZone)
    : null

  const line = shouldShowTodayAstraSurface({ isTodaySelected, inDrillOrSurface: suppressed })
    ? proactive
      ? { text: proactive.body, destination: t('todayAstra.openConversation'), notificationId: proactive.id }
      : returning
        ? {
            text: returning.kind === 'elapsed'
              ? t('todayAstra.returningElapsed', { days: returning.days })
              : t('todayAstra.returningBounded'),
            destination: t('todayAstra.viewProgress'),
            notificationId: null,
          }
        : null
    : null

  if (!line) return null

  const content = (
    <>
      <AstraGlyph size={20} color="var(--fg-3)" />
      <span className="today-astra-sentence">{line.text}</span>
    </>
  )

  return (
    <>
      {line.notificationId ? (
        <button
          type="button"
          className="today-astra-line"
          aria-describedby={destinationId}
          onClick={() => {
            markRead.mutate(line.notificationId)
            setConversationOpen(true)
          }}
        >
          {content}
        </button>
      ) : (
        <Link className="today-astra-line" href="/progress" aria-describedby={destinationId}>
          {content}
        </Link>
      )}
      <span id={destinationId} className="sr-only">{line.destination}</span>
    </>
  )
}
