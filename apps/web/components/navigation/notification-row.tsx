'use client'

import { useTranslations } from 'next-intl'
import type { NotificationItem } from '@orbit/shared/types/notification'
import { formatNotificationRelativeTime, getNotificationTargetKey } from '@orbit/shared/utils'
import { Calendar, ChartLine, CircleDot, Gift, Home, User } from '@/components/ui/icons'

const TARGET_ICONS = {
  'nav.today': Home,
  'nav.calendar': Calendar,
  'nav.progress': ChartLine,
  'nav.profile': User,
  'profile.wrappedTitle': Gift,
  'notifications.habit': CircleDot,
}

export function NotificationRow({ item, onOpen }: Readonly<{
  item: NotificationItem
  onOpen: (item: NotificationItem) => void
}>) {
  const t = useTranslations()
  const targetKey = getNotificationTargetKey(item.url, item.habitId)
  const TargetIcon = targetKey ? TARGET_ICONS[targetKey] : null
  return (
    <li data-read={item.isRead} className="rounded-[var(--r-well)]"
      style={item.isRead ? undefined : { background: 'var(--bg-card)', boxShadow: 'inset 0 0 0 1px var(--hairline)' }}>
      <button type="button" onClick={() => onOpen(item)}
        style={{ transition: 'background-color var(--dur-hover) var(--ease-standard)' }}
        aria-label={`${item.title}. ${t(item.isRead ? 'notifications.read' : 'notifications.unread')}${targetKey ? `. ${t(targetKey)}` : ''}`}
        className="orbit-notification-row flex min-h-11 w-full min-w-0 cursor-pointer items-start gap-3 rounded-[var(--r-well)] border-0 bg-transparent p-4 text-left hover:bg-[var(--bg-hover)]">
        <span aria-hidden="true" data-unread-column="" className="flex w-2 shrink-0 self-stretch items-center">
          {!item.isRead ? <span data-unread-dot="" className="size-2 rounded-full bg-[var(--fg-1)]" /> : null}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-baseline gap-2">
            <span data-notification-title="" className="min-w-0 flex-1 text-base"
              style={{ lineHeight: 1.4, fontWeight: item.isRead ? 400 : 500, color: item.isRead ? 'var(--fg-2)' : 'var(--fg-1)', overflowWrap: 'anywhere' }}>{item.title}</span>
            <span className="shrink-0 font-mono text-xs text-[var(--fg-2)]">
              {formatNotificationRelativeTime(item.createdAtUtc, (key, values) => t(`notifications.${key}`, values))}
            </span>
          </span>
          <span className="text-sm text-[var(--fg-2)]" style={{ lineHeight: 1.5, overflowWrap: 'anywhere' }}>{item.body}</span>
          {targetKey && TargetIcon ? <span className="flex items-center gap-2 font-mono text-xs text-[var(--fg-2)]">
            <TargetIcon size={16} className="text-[var(--fg-3)]" aria-hidden="true" />{t(targetKey)}
          </span> : null}
        </span>
      </button>
    </li>
  )
}
