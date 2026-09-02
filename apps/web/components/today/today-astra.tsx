'use client'

import { useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import {
  selectNewestUnreadProactiveCheckin,
  shouldShowTodayAstraLine,
} from '@orbit/shared/utils'
import { useMarkNotificationRead, useNotifications } from '@/hooks/use-notifications'
import { useProfile } from '@/hooks/use-profile'
import { useUIStore } from '@/stores/ui-store'
import { AstraGlyph } from '@/components/ui/astra-glyph'

interface TodayAstraProps {
  isTodaySelected: boolean
  suppressed: boolean
}

export function TodayAstra({ isTodaySelected, suppressed }: Readonly<TodayAstraProps>) {
  const t = useTranslations()
  const { profile } = useProfile()
  const { notifications } = useNotifications()
  const markRead = useMarkNotificationRead()
  const setConversationOpen = useUIStore((state) => state.setAstraConversationOpen)
  const proactive = selectNewestUnreadProactiveCheckin(notifications)
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
  const openConversation = () => setConversationOpen(true)
  const atMessageLimit = profile != null && profile.aiMessagesUsed >= profile.aiMessagesLimit

  const line = shouldShowTodayAstraLine({ isTodaySelected, inDrillOrSurface: suppressed, isOnline, atLimit: atMessageLimit })
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
    </>
  )
}
